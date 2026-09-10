-- "Pelo maltratado $450" es un precio alternativo del baño estético
-- completo, no un servicio ni un cargo. El mismo baño, la misma lista de
-- lo que incluye, el mismo lugar en la agenda: lo único que cambia es
-- cuánto cuesta, porque el perro llega enredado y se trabaja más.
--
-- Por qué una columna y no una dimensión más de la matriz: en el cartel
-- son DOS NÚMEROS EN LA MISMA CELDA ("Poodle y similares $390 / Pelo
-- maltratado $450"), y solo existen para un servicio. Como dimensión
-- habría que capturar "rapado × maltratado" y "exprés × maltratado" para
-- los siete grupos, todas en no_aplica: veintiuna celdas de ruido para
-- expresar algo que el negocio piensa como un número al lado del otro.
alter table public.tarifas
  add column if not exists precio_pelo_maltratado numeric(10, 2)
    check (precio_pelo_maltratado is null or precio_pelo_maltratado >= 0);

comment on column public.tarifas.precio_pelo_maltratado is
  'Precio alternativo del mismo servicio cuando el perro llega con el pelo maltratado. Null = ese grupo no cobra distinto por eso.';

-- La vista de tarifas vigentes tiene su lista de columnas escrita a mano,
-- así que una columna nueva en la tabla NO aparece ahí sola. Sin este
-- paso, cualquier pantalla que le pida el precio alternativo recibe un
-- error y se queda sin NINGÚN precio — la cotización del alta entera se
-- caía a "sin tarifa". Recrearla es parte de agregar la columna, no un
-- detalle aparte.
--
-- Cuerpo tomado de 20260910032252_add_grupo_raza_a_tarifas.sql, con la
-- columna nueva añadida.
drop view if exists public.tarifas_vigentes;

create view public.tarifas_vigentes
with (security_invoker = true)
as
select distinct on (t.servicio_id, t.grupo_raza_id, t.tamano_id, t.pelaje_id, t.cantidad_desde, t.cantidad_hasta)
  t.servicio_id,
  s.nombre as servicio_nombre,
  s.categoria,
  s.unidad,
  t.grupo_raza_id,
  gr.nombre as grupo_raza_nombre,
  t.tamano_id,
  t.pelaje_id,
  t.cantidad_desde,
  t.cantidad_hasta,
  t.precio,
  t.precio_pelo_maltratado,
  t.no_aplica,
  t.vigencia_desde
from public.tarifas t
join public.servicios s on s.id = t.servicio_id
left join public.grupos_raza gr on gr.id = t.grupo_raza_id
where t.vigencia_desde <= current_date
  and t.deleted_at is null
  and s.deleted_at is null
order by
  t.servicio_id, t.grupo_raza_id, t.tamano_id, t.pelaje_id, t.cantidad_desde, t.cantidad_hasta,
  t.vigencia_desde desc;

-- Quién decide que un perro llegó maltratado: quien lo ve. Se marca en la
-- cita, y el precio se resuelve con esa marca puesta — no es algo que el
-- dueño pueda contestar desde su celular.
alter table public.citas_estetica
  add column if not exists pelo_maltratado boolean not null default false;

comment on column public.citas_estetica.pelo_maltratado is
  'Lo marca quien recibe al perro. Cambia el precio al alternativo del mismo servicio, no agrega un cargo.';

-- resolver_precio gana el séptimo parámetro AL FINAL y con default, para
-- no tocar ninguna de las llamadas que ya existen. Y devuelve el precio
-- alternativo aparte del efectivo: la pantalla del cliente necesita poder
-- decir "desde $390, o $450 si llega enredado" sin preguntar dos veces.
--
-- Se dropea antes de recrear porque cambia el tipo de retorno (columna
-- nueva), que es lo único que `create or replace` no puede hacer.
drop function if exists public.resolver_precio(uuid, uuid, uuid, int, date, uuid);

create or replace function public.resolver_precio(
  p_servicio_id uuid,
  p_tamano_id uuid,
  p_pelaje_id uuid,
  p_cantidad int,
  p_fecha date default current_date,
  p_grupo_raza_id uuid default null,
  p_pelo_maltratado boolean default false
)
returns table (
  precio numeric,
  precio_pelo_maltratado numeric,
  no_aplica boolean,
  estado text,
  vigencia_desde date
)
language sql
stable
set search_path = ''
as $$
  select
    -- El precio EFECTIVO: el alternativo solo cuando de verdad hay uno
    -- capturado para ese perro. Si el grupo no cobra distinto por pelo
    -- maltratado, marcar la casilla no debe inventar un recargo — se
    -- cobra lo de siempre.
    case
      when p_pelo_maltratado and t.precio_pelo_maltratado is not null
        then t.precio_pelo_maltratado
      else t.precio
    end,
    t.precio_pelo_maltratado,
    t.no_aplica,
    case
      when t.id is null then 'sin_tarifa'
      when t.no_aplica then 'no_aplica'
      else 'disponible'
    end as estado,
    t.vigencia_desde
  from (select 1) as _dummy
  left join lateral (
    select tr.id, tr.precio, tr.precio_pelo_maltratado, tr.no_aplica, tr.vigencia_desde
    from public.tarifas tr
    where tr.servicio_id = p_servicio_id
      and tr.grupo_raza_id is not distinct from p_grupo_raza_id
      and tr.tamano_id is not distinct from p_tamano_id
      and tr.pelaje_id is not distinct from p_pelaje_id
      and p_cantidad >= tr.cantidad_desde
      and (tr.cantidad_hasta is null or p_cantidad <= tr.cantidad_hasta)
      and tr.vigencia_desde <= p_fecha
      and tr.deleted_at is null
    order by tr.vigencia_desde desc
    limit 1
  ) t on true;
$$;

revoke execute on function public.resolver_precio(uuid, uuid, uuid, int, date, uuid, boolean) from public;
revoke execute on function public.resolver_precio(uuid, uuid, uuid, int, date, uuid, boolean) from anon;
grant execute on function public.resolver_precio(uuid, uuid, uuid, int, date, uuid, boolean) to authenticated;

-- El trigger de la cita pasa la marca. Cuerpo tomado de
-- 20260910032252_add_grupo_raza_a_tarifas.sql y parcheado solo en esa
-- línea: el resto es el mismo que ya corría.
create or replace function public.validar_cita_estetica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria text;
  v_duracion int;
  v_depende_tamano boolean;
  v_depende_pelaje boolean;
  v_depende_grupo boolean;
  v_precio numeric;
  v_estado_precio text;
  v_fecha_local date;
  v_estancia record;
  v_fechas_cambiaron boolean;
  v_activa boolean;
  v_hora_cierre time;
  v_grupo record;
begin
  select categoria, duracion_minutos, depende_tamano, depende_pelaje, depende_grupo_raza
    into v_categoria, v_duracion, v_depende_tamano, v_depende_pelaje, v_depende_grupo
  from public.servicios
  where id = new.servicio_id and deleted_at is null;

  if v_categoria is null then
    raise exception 'El servicio de esta cita no existe.';
  end if;
  if v_categoria <> 'estetica' then
    raise exception 'Una cita de estética solo puede usar un servicio de categoría estetica.';
  end if;

  if new.fin is null then
    new.fin := new.inicio + (coalesce(v_duracion, 60) * interval '1 minute');
  end if;

  v_fecha_local := public.fecha_negocio(new.inicio);

  if new.estancia_id is not null then
    select perro_id, fecha_entrada, fecha_salida into v_estancia
    from public.estancias
    where id = new.estancia_id and deleted_at is null;

    if not found then
      raise exception 'La estancia ligada a esta cita no existe.';
    end if;

    if v_estancia.perro_id is distinct from new.perro_id then
      raise exception 'Esta cita es de un perro distinto al de la estancia que se está ligando.';
    end if;

    if v_fecha_local < v_estancia.fecha_entrada or v_fecha_local >= v_estancia.fecha_salida then
      raise exception 'La fecha de esta cita no cae dentro del rango de la estancia ligada.';
    end if;
  end if;

  -- La marca de pelo maltratado entra a la lista de lo que obliga a
  -- recotizar: si alguien la prende sobre una cita ya guardada, el precio
  -- tiene que seguirla.
  v_fechas_cambiaron := TG_OP = 'INSERT'
    or new.servicio_id is distinct from old.servicio_id
    or new.perro_id is distinct from old.perro_id
    or new.inicio is distinct from old.inicio
    or new.pelo_maltratado is distinct from old.pelo_maltratado;

  v_activa := new.estado not in ('cancelada', 'no_llego');

  if v_fechas_cambiaron then
    if v_depende_grupo then
      select * into v_grupo from public.perro_grupo_raza where perro_id = new.perro_id;
      if v_grupo.grupo_raza_id is null then
        raise exception 'No se pudo determinar el grupo de raza de este perro. Revisa el catálogo de razas.';
      end if;

      if v_grupo.depende_tamano then
        select tamano_id into new.tamano_id from public.perros where id = new.perro_id;
        if new.tamano_id is null then
          raise exception 'Este perro no tiene tamaño registrado y su grupo de raza cobra por talla. Complétalo en su expediente antes de reservar.';
        end if;
      else
        new.tamano_id := null;
      end if;
    elsif v_depende_tamano then
      select tamano_id into new.tamano_id from public.perros where id = new.perro_id;
      if new.tamano_id is null then
        raise exception 'Este perro no tiene tamaño registrado. Complétalo en su expediente antes de reservar.';
      end if;
    else
      new.tamano_id := null;
    end if;

    if v_depende_pelaje then
      select pelaje_id into new.pelaje_id from public.perros where id = new.perro_id;
      if new.pelaje_id is null then
        raise exception 'Este perro no tiene pelaje registrado. Complétalo en su expediente antes de reservar.';
      end if;
    else
      new.pelaje_id := null;
    end if;

    select precio, estado into v_precio, v_estado_precio
    from public.resolver_precio(
      new.servicio_id, new.tamano_id, new.pelaje_id, 1, v_fecha_local,
      case when v_depende_grupo then v_grupo.grupo_raza_id else null end,
      new.pelo_maltratado
    );

    if v_estado_precio = 'sin_tarifa' then
      raise exception 'No hay tarifa capturada para este servicio en esta fecha. Captúrala antes de reservar.';
    elsif v_estado_precio = 'no_aplica' then
      raise exception 'Este servicio no aplica para este perro.';
    end if;

    new.precio := v_precio;
  end if;

  if v_fechas_cambiaron and v_activa then
    if new.bloqueo_sanitario_superado and not public.is_admin() then
      raise exception 'Solo un admin puede autorizar una excepción al bloqueo sanitario.';
    end if;

    if new.bloqueo_sanitario_superado then
      new.autorizado_por := auth.uid();
    else
      if exists (
        select 1 from public.perro_requisitos_sanitarios_estado e
        where e.perro_id = new.perro_id
          and e.es_critica
          and e.estado in ('vencida', 'sin_registro')
      ) then
        raise exception 'Este perro tiene requisitos sanitarios críticos vencidos o sin registro.';
      end if;
    end if;
  end if;

  select hora_cierre into v_hora_cierre
  from public.resolver_cupo_configuracion(v_fecha_local);

  new.fuera_de_horario := v_hora_cierre is not null
    and public.hora_negocio(new.fin) > v_hora_cierre;

  return new;
end;
$$;
