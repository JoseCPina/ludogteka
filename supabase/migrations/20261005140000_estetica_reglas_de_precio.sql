-- Estética: reglas de precio por pelaje, recargo manual con motivo y carga
-- de tarifas por la plataforma.
--
--  1. servicios.pelajes_excluidos: claves de pelaje a las que NO se ofrece el
--     servicio (el rapado no se ofrece a pelo corto). Vacío = a todos. Es
--     configuración de cada negocio, no una regla fija.
--  2. grupos_raza.pelajes_permitidos: si no es nulo, el grupo solo cobra
--     automático a perros con esos pelajes (el grupo «por talla» solo cobra
--     pelo corto). Un perro de otro pelaje queda «sin grupo» por motivo
--     'pelaje': no se adivina un precio; se resuelve con la excepción de
--     grupo con motivo que ya existe, o corrigiendo su pelaje.
--  3. perro_grupo_raza: sin_grupo_motivo ('sin_grupo' | 'pelaje') y pelaje.
--  4. citas_estetica: precio_base, recargo, recargo_motivo, recargo_por. El
--     recargo es manual, lleva motivo y lo da quien tenga «excepciones al
--     reservar»; precio (lo que se cobra) = precio_base + recargo.
--  5. validar_cita_estetica con todo lo anterior.
--  6. plataforma_cargar_tarifas_estetica: carga idempotente de tarifas y de
--     las dos reglas de pelaje en UN negocio, con la foto de lo anterior en
--     plataforma_eventos para poder revertir.

alter table public.servicios add column pelajes_excluidos text[] not null default '{}';
alter table public.grupos_raza add column pelajes_permitidos text[];
alter table public.citas_estetica
  add column precio_base numeric(10, 2),
  add column recargo numeric(10, 2) not null default 0 check (recargo >= 0),
  add column recargo_motivo text,
  add column recargo_por uuid references auth.users(id) on delete set null;

-- ── 3. La vista ──────────────────────────────────────────────────────

create or replace view public.perro_grupo_raza with (security_invoker = true) as
select q.perro_id, q.grupo_raza_id, q.grupo_clave, q.grupo_nombre, q.depende_tamano, q.por_defecto,
  (q.sin_grupo_catalogo or q.fuera_de_pelaje) as sin_grupo,
  q.raza_id, q.raza_nombre, q.propuesta_id,
  case when q.sin_grupo_catalogo then 'sin_grupo' when q.fuera_de_pelaje then 'pelaje' end as sin_grupo_motivo,
  q.pelaje_clave
from (
  select p.id as perro_id,
    case when r.id is not null then g.id when pr.id is not null then gpr.id else gp.id end as grupo_raza_id,
    case when r.id is not null then g.clave when pr.id is not null then gpr.clave else gp.clave end as grupo_clave,
    case when r.id is not null then g.nombre when pr.id is not null then gpr.nombre else gp.nombre end as grupo_nombre,
    case when r.id is not null then g.depende_tamano when pr.id is not null then gpr.depende_tamano else gp.depende_tamano end as depende_tamano,
    (p.raza_id is null and pr.id is null) as por_defecto,
    ((r.id is not null and g.id is null) or (pr.id is not null and gpr.id is null)) as sin_grupo_catalogo,
    (
      case when r.id is not null then g.pelajes_permitidos when pr.id is not null then gpr.pelajes_permitidos else gp.pelajes_permitidos end is not null
      and (pe.clave is null or not (pe.clave = any (case when r.id is not null then g.pelajes_permitidos when pr.id is not null then gpr.pelajes_permitidos else gp.pelajes_permitidos end)))
    ) as fuera_de_pelaje,
    r.id as raza_id,
    coalesce(r.nombre, pr.nombre) as raza_nombre,
    pr.id as propuesta_id,
    pe.clave as pelaje_clave
  from public.perros p
  left join public.tipos_pelaje pe on pe.id = p.pelaje_id
  left join public.razas r on r.id = p.raza_id and r.deleted_at is null
  left join public.razas_grupo rg on rg.raza_id = r.id and rg.negocio_id = p.negocio_id and rg.deleted_at is null
  left join public.grupos_raza g on g.id = rg.grupo_raza_id and g.deleted_at is null
  left join lateral (
    select x.id, x.nombre, x.grupo_raza_id
    from public.razas_propuestas_perros pp
    join public.razas_propuestas x on x.id = pp.propuesta_id and x.deleted_at is null and x.estado = 'pendiente'
    where pp.perro_id = p.id and pp.deleted_at is null and p.raza_id is null
    order by pp.created_at desc limit 1
  ) pr on true
  left join public.grupos_raza gpr on gpr.id = pr.grupo_raza_id and gpr.deleted_at is null
  left join public.grupos_raza gp on gp.es_predeterminado and gp.deleted_at is null and gp.negocio_id = p.negocio_id
  where p.deleted_at is null
) q;

-- ── 5. La cita ───────────────────────────────────────────────────────

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
  v_excluidos text[];
  v_nombre_servicio text;
  v_precio numeric;
  v_estado_precio text;
  v_fecha_local date;
  v_estancia record;
  v_fechas_cambiaron boolean;
  v_hora_cierre time;
  v_grupo record;
  v_permitidos text[];
  v_pelaje_clave text;
  v_cambio_recargo boolean;
begin
  select categoria, duracion_minutos, depende_tamano, depende_pelaje, depende_grupo_raza, pelajes_excluidos, nombre
    into v_categoria, v_duracion, v_depende_tamano, v_depende_pelaje, v_depende_grupo, v_excluidos, v_nombre_servicio
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

  -- El recargo manual: con motivo, de quien tenga «excepciones al reservar»,
  -- y no sobre una cita que ya se cobró o se cerró.
  new.recargo := coalesce(new.recargo, 0);
  v_cambio_recargo := TG_OP = 'INSERT' or new.recargo is distinct from old.recargo;
  if new.recargo < 0 then
    raise exception 'El recargo no puede ser negativo.';
  end if;
  if v_cambio_recargo and (new.recargo > 0 or (TG_OP = 'UPDATE' and old.recargo > 0)) then
    if not coalesce((select public.tiene_permiso('excepciones_reserva')), false) then
      raise exception 'Aplicar o quitar un recargo es de admin o de quien tenga el permiso de excepciones al reservar.' using errcode = '42501';
    end if;
    if TG_OP = 'UPDATE' and old.estado in ('finalizada', 'cancelada', 'no_llego') then
      raise exception 'Esta cita ya se cerró: no se le puede cambiar el recargo.';
    end if;
    if new.recargo > 0 then
      if btrim(coalesce(new.recargo_motivo, '')) = '' then
        raise exception 'El recargo necesita un motivo.';
      end if;
      new.recargo_por := auth.uid();
    else
      new.recargo_motivo := null;
      new.recargo_por := null;
    end if;
  end if;

  v_fechas_cambiaron := TG_OP = 'INSERT'
    or new.servicio_id is distinct from old.servicio_id
    or new.perro_id is distinct from old.perro_id
    or new.inicio is distinct from old.inicio
    or new.pelo_maltratado is distinct from old.pelo_maltratado
    or new.recargo is distinct from old.recargo;

  if v_fechas_cambiaron then
    -- Servicios que no se ofrecen a ciertos pelajes (el rapado, a pelo corto).
    if coalesce(cardinality(v_excluidos), 0) > 0 then
      select pe.clave into v_pelaje_clave
      from public.perros p left join public.tipos_pelaje pe on pe.id = p.pelaje_id
      where p.id = new.perro_id;
      if v_pelaje_clave is null then
        raise exception 'Este perro no tiene pelaje registrado y «%» depende de él. Complétalo en su expediente: /perros/%', v_nombre_servicio, new.perro_id;
      end if;
      if v_pelaje_clave = any (v_excluidos) then
        raise exception '«%» no se ofrece a perros con pelaje %. Escoge otro servicio, o corrige el pelaje del perro si está mal capturado: /perros/%', v_nombre_servicio, v_pelaje_clave, new.perro_id;
      end if;
    end if;

    if v_depende_grupo then
      select * into v_grupo from public.perro_grupo_raza where perro_id = new.perro_id;
      if coalesce(v_grupo.sin_grupo, false) then
        -- O el grupo de la raza no está decidido en este negocio, o el grupo
        -- no cobra automático a ese pelaje: no se adivina. O se resuelve
        -- (asignar el grupo / corregir el pelaje) o la cita lleva una
        -- excepción con grupo y motivo.
        if new.grupo_raza_excepcion_id is null then
          if v_grupo.sin_grupo_motivo = 'pelaje' then
            raise exception 'El grupo «%» de este perro solo cobra automático a ciertos pelajes y él tiene pelaje %. Corrige su pelaje en su expediente (/perros/%) o registra una excepción de grupo de precio con motivo al agendar la cita.', v_grupo.grupo_nombre, coalesce(v_grupo.pelaje_clave, 'sin capturar'), new.perro_id;
          end if;
          raise exception 'La raza % de este perro todavía no tiene grupo de precio en este negocio. Asígnalo en /perros/razas/grupos o registra una excepción al agendar la cita.', v_grupo.raza_nombre;
        end if;
        if btrim(coalesce(new.excepcion_grupo_motivo, '')) = '' then
          raise exception 'La excepción de grupo de precio necesita un motivo.';
        end if;
        if not coalesce((select public.tiene_permiso('excepciones_reserva')), false) then
          raise exception 'Registrar una excepción de grupo de precio es de admin o de quien tenga el permiso de excepciones al reservar.' using errcode = '42501';
        end if;
        select g.id, g.depende_tamano, g.pelajes_permitidos into v_grupo.grupo_raza_id, v_grupo.depende_tamano, v_permitidos
        from public.grupos_raza g where g.id = new.grupo_raza_excepcion_id and g.deleted_at is null;
        if v_grupo.grupo_raza_id is null then
          raise exception 'El grupo de la excepción no existe en este negocio.';
        end if;
        if v_permitidos is not null and (v_grupo.pelaje_clave is null or not (v_grupo.pelaje_clave = any (v_permitidos))) then
          raise exception 'El grupo de la excepción tampoco cobra automático al pelaje de este perro. Escoge otro grupo.';
        end if;
        new.excepcion_grupo_por := auth.uid();
      else
        new.grupo_raza_excepcion_id := null;
        new.excepcion_grupo_motivo := null;
        new.excepcion_grupo_por := null;
      end if;
      if v_grupo.grupo_raza_id is null then
        raise exception 'No se pudo determinar el grupo de raza de este perro. Revisa el catálogo de razas.';
      end if;

      if v_grupo.depende_tamano then
        select tamano_id into new.tamano_id from public.perros where id = new.perro_id;
        if new.tamano_id is null then
          raise exception 'Este perro no tiene talla registrada y su grupo de raza cobra por talla. Captúrala en /perros/%', new.perro_id;
        end if;
      else
        new.tamano_id := null;
      end if;
    elsif v_depende_tamano then
      select tamano_id into new.tamano_id from public.perros where id = new.perro_id;
      if new.tamano_id is null then
        raise exception 'Este perro no tiene talla registrada y el precio depende de ella. Captúrala en /perros/%', new.perro_id;
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
      raise exception '%', public.describir_precio_faltante(new.servicio_id, new.tamano_id, new.pelaje_id, 1, v_fecha_local, case when v_depende_grupo then v_grupo.grupo_raza_id else null end);
    elsif v_estado_precio = 'no_aplica' then
      raise exception '%', public.describir_precio_faltante(new.servicio_id, new.tamano_id, new.pelaje_id, 1, v_fecha_local, case when v_depende_grupo then v_grupo.grupo_raza_id else null end, 'no_aplica');
    end if;

    new.precio_base := v_precio;
    new.precio := v_precio + new.recargo;
  end if;

  -- Sin bloqueo sanitario aquí (ver encabezado). La marca de excepción
  -- ya no hace nada; si alguien la manda, no cambia el resultado.

  select hora_cierre into v_hora_cierre
  from public.resolver_cupo_configuracion(v_fecha_local);

  new.fuera_de_horario := v_hora_cierre is not null
    and public.hora_negocio(new.fin) > v_hora_cierre;

  return new;
end;
$$;

-- ── 6. La carga de tarifas por la plataforma ─────────────────────────

alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check
  check (accion in ('crear_negocio', 'actualizar_negocio', 'agregar_admin_negocio', 'restablecer_password', 'editar_catalogo',
                    'cambiar_plan', 'asignar_plan', 'editar_plan', 'resolver_propuesta_raza', 'agregar_raza', 'eliminar_negocio', 'seguimiento_pausa', 'cargar_tarifas_estetica'));

-- p_config: {
--   "servicios": [{"clave": "estetica_rapado", "pelajes_excluidos": ["corto"]}],
--   "grupos":    [{"clave": "pelo_corto", "pelajes_permitidos": ["corto"]}],
--   "tarifas":   [{"servicio": "...", "grupo": "...", "tamano": null|"chico",
--                  "precio": 390, "maltratado": 450|null, "no_aplica": false}]
-- }
-- Idempotente: lo que ya vale lo mismo no se toca; lo que cambia entra como
-- una tarifa nueva con vigencia de hoy (la anterior queda como historial y
-- las citas ya agendadas conservan su precio). La foto de lo anterior queda
-- en plataforma_eventos.detalle.antes.
create or replace function public.plataforma_cargar_tarifas_estetica(
  p_negocio_id uuid, p_config jsonb, p_motivo text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy date;
  v_antes jsonb;
  v_t jsonb;
  v_s jsonb;
  v_g jsonb;
  v_servicio uuid;
  v_grupo uuid;
  v_tamano uuid;
  v_actual record;
  v_precio numeric;
  v_malt numeric;
  v_na boolean;
  v_nuevas int := 0;
  v_iguales int := 0;
  v_reglas int := 0;
begin
  if not (coalesce((select public.es_admin_plataforma()), false) or auth.role() = 'service_role') then
    raise exception 'Solo la administración de la plataforma.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.negocios where id = p_negocio_id) then
    raise exception 'Ese negocio no existe.';
  end if;
  perform set_config('app.negocio_id', p_negocio_id::text, true);
  v_hoy := public.fecha_negocio();

  select coalesce(jsonb_agg(jsonb_build_object(
      'servicio', s.clave, 'grupo', g.clave, 'tamano', tc.clave, 'precio', t.precio,
      'maltratado', t.precio_pelo_maltratado, 'no_aplica', t.no_aplica, 'vigencia_desde', t.vigencia_desde)
      order by s.clave, g.orden, tc.orden), '[]'::jsonb)
  into v_antes
  from public.tarifas t
  join public.servicios s on s.id = t.servicio_id
  left join public.grupos_raza g on g.id = t.grupo_raza_id
  left join public.tamanos_categoria tc on tc.id = t.tamano_id
  where t.negocio_id = p_negocio_id and s.categoria = 'estetica' and t.deleted_at is null and s.deleted_at is null;

  for v_s in select * from jsonb_array_elements(coalesce(p_config -> 'servicios', '[]'::jsonb)) loop
    update public.servicios set pelajes_excluidos = coalesce(array(select jsonb_array_elements_text(v_s -> 'pelajes_excluidos')), '{}')
    where negocio_id = p_negocio_id and clave = v_s ->> 'clave' and deleted_at is null
      and pelajes_excluidos is distinct from coalesce(array(select jsonb_array_elements_text(v_s -> 'pelajes_excluidos')), '{}');
    if found then v_reglas := v_reglas + 1; end if;
  end loop;
  for v_g in select * from jsonb_array_elements(coalesce(p_config -> 'grupos', '[]'::jsonb)) loop
    update public.grupos_raza set pelajes_permitidos = case when jsonb_typeof(v_g -> 'pelajes_permitidos') = 'array' then array(select jsonb_array_elements_text(v_g -> 'pelajes_permitidos')) else null end
    where negocio_id = p_negocio_id and clave = v_g ->> 'clave' and deleted_at is null
      and pelajes_permitidos is distinct from (case when jsonb_typeof(v_g -> 'pelajes_permitidos') = 'array' then array(select jsonb_array_elements_text(v_g -> 'pelajes_permitidos')) else null end);
    if found then v_reglas := v_reglas + 1; end if;
  end loop;

  for v_t in select * from jsonb_array_elements(coalesce(p_config -> 'tarifas', '[]'::jsonb)) loop
    select id into v_servicio from public.servicios where negocio_id = p_negocio_id and clave = v_t ->> 'servicio' and categoria = 'estetica' and deleted_at is null;
    if v_servicio is null then raise exception 'El servicio «%» no existe en este negocio.', v_t ->> 'servicio'; end if;
    select id into v_grupo from public.grupos_raza where negocio_id = p_negocio_id and clave = v_t ->> 'grupo' and deleted_at is null;
    if v_grupo is null then raise exception 'El grupo «%» no existe en este negocio.', v_t ->> 'grupo'; end if;
    v_tamano := null;
    if coalesce(v_t ->> 'tamano', '') <> '' then
      select id into v_tamano from public.tamanos_categoria where clave = v_t ->> 'tamano' and deleted_at is null;
      if v_tamano is null then raise exception 'La talla «%» no existe.', v_t ->> 'tamano'; end if;
    end if;
    v_na := coalesce((v_t ->> 'no_aplica')::boolean, false);
    v_precio := case when v_na then null else (v_t ->> 'precio')::numeric end;
    v_malt := case when v_na then null else nullif(v_t ->> 'maltratado', '')::numeric end;
    if not v_na and v_precio is null then raise exception 'Falta el precio de %/%.', v_t ->> 'servicio', v_t ->> 'grupo'; end if;

    select * into v_actual from public.tarifas
    where servicio_id = v_servicio and grupo_raza_id = v_grupo and tamano_id is not distinct from v_tamano and pelaje_id is null
      and deleted_at is null and vigencia_desde <= v_hoy
    order by vigencia_desde desc limit 1;

    if found and v_actual.no_aplica = v_na and v_actual.precio is not distinct from v_precio and v_actual.precio_pelo_maltratado is not distinct from v_malt then
      v_iguales := v_iguales + 1;
    elsif found and v_actual.vigencia_desde = v_hoy then
      update public.tarifas set precio = v_precio, precio_pelo_maltratado = v_malt, no_aplica = v_na where id = v_actual.id;
      v_nuevas := v_nuevas + 1;
    else
      insert into public.tarifas (negocio_id, servicio_id, grupo_raza_id, tamano_id, pelaje_id, cantidad_desde, cantidad_hasta, vigencia_desde, precio, precio_pelo_maltratado, no_aplica)
      values (p_negocio_id, v_servicio, v_grupo, v_tamano, null, coalesce(v_actual.cantidad_desde, 1), v_actual.cantidad_hasta, v_hoy, v_precio, v_malt, v_na);
      v_nuevas := v_nuevas + 1;
    end if;
  end loop;

  insert into public.plataforma_eventos (accion, motivo, detalle, created_by)
  values ('cargar_tarifas_estetica', nullif(btrim(coalesce(p_motivo, '')), ''),
          jsonb_build_object('negocio_id', p_negocio_id, 'antes', v_antes, 'config', p_config, 'tarifas_nuevas', v_nuevas, 'tarifas_iguales', v_iguales, 'reglas_cambiadas', v_reglas,
                             'via', case when auth.role() = 'service_role' then 'servicio' else 'sesion' end),
          auth.uid());
  return jsonb_build_object('tarifas_nuevas', v_nuevas, 'tarifas_iguales', v_iguales, 'reglas_cambiadas', v_reglas);
end;
$$;
revoke execute on function public.plataforma_cargar_tarifas_estetica(uuid, jsonb, text) from public, anon;
grant execute on function public.plataforma_cargar_tarifas_estetica(uuid, jsonb, text) to authenticated, service_role;

do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), chr(13), '') into v_def;
  if position('plataforma_cargar_tarifas_estetica' in v_def) = 0 then
    v_def := replace(v_def, $a$('plataforma_agregar_raza')$a$, $b$('plataforma_agregar_raza'), ('plataforma_cargar_tarifas_estetica')$b$);
    if position('plataforma_cargar_tarifas_estetica' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar plataforma_cargar_tarifas_estetica.';
    end if;
    execute v_def;
  end if;
end $$;
