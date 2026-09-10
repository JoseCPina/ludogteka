-- El teléfono pasa a ser la identidad del cliente, y eso cambia dos cosas
-- en la base antes de tocar una sola pantalla.

-- 1. El teléfono de recepción, configurable.
--
-- Es a donde el dueño manda "olvidé mi contraseña" por WhatsApp, así que
-- no puede estar escrito en el código: cambia cuando el negocio cambia de
-- línea, y quien lo cambia no compila nada. Va en cupo_configuracion,
-- junto al cupo y al horario, porque es lo mismo — un dato de operación
-- del negocio, versionado en el tiempo con el mismo patrón de solo
-- inserción.
alter table public.cupo_configuracion
  add column if not exists telefono_recepcion text
    check (telefono_recepcion is null or telefono_recepcion ~ '^[0-9]{10}$');

comment on column public.cupo_configuracion.telefono_recepcion is
  'Diez dígitos, sin lada de país. Es el WhatsApp al que el cliente le escribe para que le restablezcan la contraseña.';

-- 2. Un teléfono, un cliente.
--
-- Mientras el teléfono era un dato de contacto, dos expedientes podían
-- compartirlo sin consecuencias. Ahora es con lo que alguien inicia
-- sesión: si dos clientes tienen el mismo número, "de quién es esta
-- cuenta" deja de tener respuesta, y el alta no puede decidir si
-- rechazar o vincular.
--
-- Verificado contra producción antes de escribir esto: 15 clientes, cero
-- números repetidos y todos con diez dígitos. En desarrollo sí había
-- repetidos, todos residuo de pruebas mías, renumerados a mano ahí (no
-- aquí: no se toca data de producción desde una migración).
--
-- Parcial por deleted_at a propósito: un cliente dado de baja conserva su
-- número en el historial, y ese número debe poder reusarse si la persona
-- vuelve.
create unique index if not exists clientes_telefono_unico_idx
  on public.clientes (telefono) where deleted_at is null;

-- Cuerpo tomado de 20260802020913_add_horario_semana.sql (la versión
-- vigente, con horario por día de la semana) y ampliado con el teléfono
-- de recepción: es el mismo que ya corría.
--
-- Se DROPEA antes de recrearla: `create or replace` no puede cambiarle el
-- tipo de retorno a una función, y aquí la tabla que devuelve gana una
-- columna. Mismo paso que hizo la migración del horario por la misma
-- razón.
drop function if exists public.resolver_cupo_configuracion(date);

create or replace function public.resolver_cupo_configuracion(
  p_fecha date default current_date
)
returns table (
  cupo_diurno int,
  cupo_nocturno int,
  hora_apertura time,
  hora_cierre time,
  vigencia_desde date,
  estado text,
  base_direccion text,
  base_lat double precision,
  base_lng double precision,
  telefono_recepcion text
)
language sql
stable
set search_path = ''
as $$
  select
    c.cupo_diurno,
    c.cupo_nocturno,
    h.hora_apertura,
    h.hora_cierre,
    c.vigencia_desde,
    case when c.id is null then 'sin_configurar' else 'configurado' end as estado,
    c.base_direccion,
    c.base_lat,
    c.base_lng,
    c.telefono_recepcion
  from (select 1) as _dummy
  left join lateral (
    select cc.id, cc.cupo_diurno, cc.cupo_nocturno, cc.vigencia_desde,
      cc.base_direccion, cc.base_lat, cc.base_lng, cc.telefono_recepcion
    from public.cupo_configuracion cc
    where cc.vigencia_desde <= p_fecha
      and cc.deleted_at is null
    order by cc.vigencia_desde desc
    limit 1
  ) c on true
  left join lateral (
    select hs.hora_apertura, hs.hora_cierre
    from public.horario_semana hs
    where hs.cupo_configuracion_id = c.id
      and hs.dia_semana = extract(dow from p_fecha)
      and hs.deleted_at is null
  ) h on true;
$$;

grant execute on function public.resolver_cupo_configuracion(date) to authenticated;

-- La pantalla de login es pública: quien llegó ahí no tiene sesión y aun
-- así necesita el número al que escribirle. Por eso una función aparte,
-- que devuelve SOLO el teléfono de recepción y nada más del renglón de
-- configuración — el cupo y la dirección de la base no tienen por qué
-- viajar a una pantalla sin sesión.
create or replace function public.telefono_recepcion_publico()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select cc.telefono_recepcion
  from public.cupo_configuracion cc
  where cc.vigencia_desde <= current_date
    and cc.deleted_at is null
  order by cc.vigencia_desde desc
  limit 1;
$$;

revoke execute on function public.telefono_recepcion_publico() from public;
grant execute on function public.telefono_recepcion_publico() to anon;
grant execute on function public.telefono_recepcion_publico() to authenticated;

-- Guardar una versión nueva de la configuración. Insert-only, igual que
-- tarifas: cambiar el teléfono no reescribe el renglón anterior, agrega
-- uno con la vigencia de hoy. Los valores que no se tocan se arrastran
-- del vigente, para que cambiar un dato no obligue a recapturar el resto.
create or replace function public.guardar_configuracion_negocio(
  p_cupo_diurno int,
  p_cupo_nocturno int,
  p_telefono_recepcion text,
  p_base_direccion text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vigente public.cupo_configuracion%rowtype;
  v_direccion text;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede cambiar la configuración del negocio.';
  end if;

  if p_cupo_diurno is null or p_cupo_diurno < 0 or p_cupo_nocturno is null or p_cupo_nocturno < 0 then
    raise exception 'El cupo no puede ser negativo.';
  end if;
  if p_telefono_recepcion is not null and p_telefono_recepcion !~ '^[0-9]{10}$' then
    raise exception 'El teléfono de recepción debe tener diez dígitos.';
  end if;

  v_direccion := nullif(btrim(coalesce(p_base_direccion, '')), '');

  select * into v_vigente
  from public.cupo_configuracion
  where vigencia_desde <= public.fecha_negocio() and deleted_at is null
  order by vigencia_desde desc
  limit 1;

  insert into public.cupo_configuracion
    (vigencia_desde, cupo_diurno, cupo_nocturno, hora_cierre,
     base_direccion, base_lat, base_lng, telefono_recepcion, created_by)
  values (
    public.fecha_negocio(),
    p_cupo_diurno,
    p_cupo_nocturno,
    -- hora_cierre sigue siendo NOT NULL en la tabla aunque el horario real
    -- se lea de horario_semana desde Fase 4: se arrastra el valor viejo
    -- para no romper la restricción ni inventar un horario.
    coalesce(v_vigente.hora_cierre, time '19:00'),
    coalesce(v_direccion, v_vigente.base_direccion),
    -- Las coordenadas solo se tiran cuando la dirección CAMBIA de verdad:
    -- son de un geocodificado que cuesta una llamada a Google, y quien
    -- entra a cambiar el teléfono de recepción no manda la dirección. La
    -- primera versión comparaba contra el parámetro vacío y las borraba en
    -- cada guardado — con eso, cotizar una recolección dejaba de
    -- funcionar por haber tocado un campo que no tiene nada que ver.
    case when v_direccion is not null and v_direccion is distinct from v_vigente.base_direccion
      then null else v_vigente.base_lat end,
    case when v_direccion is not null and v_direccion is distinct from v_vigente.base_direccion
      then null else v_vigente.base_lng end,
    p_telefono_recepcion,
    auth.uid()
  )
  returning id into v_id;

  -- El horario por día de la semana cuelga del renglón de configuración,
  -- así que la versión nueva se queda sin horario si no se copia — y el
  -- negocio se encontraría con que "hoy no cerramos" de la nada.
  insert into public.horario_semana
    (cupo_configuracion_id, dia_semana, hora_apertura, hora_cierre, created_by)
  select v_id, hs.dia_semana, hs.hora_apertura, hs.hora_cierre, auth.uid()
  from public.horario_semana hs
  where hs.cupo_configuracion_id = v_vigente.id and hs.deleted_at is null;

  return v_id;
end;
$$;

revoke execute on function public.guardar_configuracion_negocio(int, int, text, text) from public;
revoke execute on function public.guardar_configuracion_negocio(int, int, text, text) from anon;
grant execute on function public.guardar_configuracion_negocio(int, int, text, text) to authenticated;
