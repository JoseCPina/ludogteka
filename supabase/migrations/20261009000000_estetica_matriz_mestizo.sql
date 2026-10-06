-- Precio de estética para mestizos / sin grupo de raza: matriz TALLA × PELAJE — 9 de octubre de 2026.
--
-- Problema: el grupo «Por talla (perros sin grupo de raza)» solo cobraba a pelo
-- corto. Un mestizo de pelo medio o largo (ej. Osito: mestizo, chico, pelo
-- largo) no tenía precio automático, la pantalla de agendar le tiraba varios
-- avisos y no lo dejaba llegar al cobro.
--
-- Esta migración:
--  · grupos_raza.depende_pelaje: un grupo puede cobrar por talla Y pelaje (la
--    matriz del mestizo). El pelaje del perro entra al precio de ESE grupo sin
--    cambiar los demás grupos ni los demás servicios.
--  · tarifas.calculado: una celda que el sistema calculó por proporción (no la
--    capturó el negocio) lleva la marca «calculado» hasta que el admin la
--    confirma o la edita (guardar una celda inserta una fila nueva sin marca).
--  · El grupo «Por talla» pasa a «Mestizo / sin raza» (clave `mestizo`), sin
--    restricción de pelaje. Sus precios actuales (pelo corto) quedan EXACTAMENTE
--    iguales: solo se les asigna el pelaje «corto» a esas celdas. Medio y largo
--    quedan vacíos (un negocio nuevo lo llena en Servicios y precios; Ludogteka
--    lo carga con scripts/estetica/cargar-tarifas.mjs).
--  · Una celda sin precio ya no es callejón sin salida: la cita acepta una
--    EXCEPCIÓN con grupo y motivo (permiso «excepciones al reservar») también
--    cuando el grupo existe pero esa combinación no tiene precio.
--  · cotizar_cita_estetica(): lo que la pantalla de agendar necesita para dar
--    UN solo aviso accionable (faltan talla/pelaje, sin grupo, sin precio).
--  · confirmar_tarifas_calculadas(): el admin da por buenos los precios
--    calculados de un grupo. Todo queda en tarifas_eventos.
--  · plataforma_cargar_tarifas_estetica soporta pelaje y la marca «calculado» y
--    ahora guarda de forma exacta lo que creó (plataforma_revertir_carga_tarifas
--    lo deshace sin dejar celdas sueltas).
--
-- REVERSA: plataforma_eventos accion 'migracion_matriz_mestizo' guarda el grupo
-- como estaba y los ids de las tarifas tocadas. Para volver: por cada negocio,
-- grupos_raza.nombre/clave/pelajes_permitidos/depende_pelaje de ese evento y
-- tarifas.pelaje_id = null para esos ids (y borrar lo cargado después con
-- plataforma_revertir_carga_tarifas). Las columnas nuevas pueden quedarse.

-- ── 1. Columnas ──────────────────────────────────────────────────────
alter table public.grupos_raza add column depende_pelaje boolean not null default false;
alter table public.tarifas add column calculado boolean not null default false;

create or replace view public.tarifas_vigentes with (security_invoker = true) as
 SELECT DISTINCT ON (t.servicio_id, t.grupo_raza_id, t.tamano_id, t.pelaje_id, t.cantidad_desde, t.cantidad_hasta) t.servicio_id,
    s.nombre AS servicio_nombre,
    s.categoria,
    s.unidad,
    t.grupo_raza_id,
    gr.nombre AS grupo_raza_nombre,
    t.tamano_id,
    t.pelaje_id,
    t.cantidad_desde,
    t.cantidad_hasta,
    t.precio,
    t.precio_pelo_maltratado,
    t.no_aplica,
    t.vigencia_desde,
    t.calculado
   FROM ((tarifas t
     JOIN servicios s ON ((s.id = t.servicio_id)))
     LEFT JOIN grupos_raza gr ON ((gr.id = t.grupo_raza_id)))
  WHERE ((t.vigencia_desde <= fecha_negocio()) AND (t.deleted_at IS NULL) AND (s.deleted_at IS NULL))
  ORDER BY t.servicio_id, t.grupo_raza_id, t.tamano_id, t.pelaje_id, t.cantidad_desde, t.cantidad_hasta, t.vigencia_desde DESC;

alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check
  check (accion in ('crear_negocio', 'actualizar_negocio', 'agregar_admin_negocio', 'restablecer_password', 'editar_catalogo',
                    'cambiar_plan', 'asignar_plan', 'editar_plan', 'resolver_propuesta_raza', 'agregar_raza', 'eliminar_negocio', 'seguimiento_pausa',
                    'cargar_tarifas_estetica', 'sincronizar_tutoriales', 'tutorial_youtube', 'marcar_tutoriales',
                    'migracion_matriz_mestizo', 'revertir_tarifas_estetica'));

-- ── 2. Bitácora de precios por negocio ───────────────────────────────
create table public.tarifas_eventos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  accion text not null check (accion in ('confirmar_calculadas', 'carga_calculada')),
  grupo_raza_id uuid references public.grupos_raza(id),
  detalle jsonb,
  actor uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
do $$
declare
  t text := 'tarifas_eventos';
begin
  execute format('create index %I on public.%I (negocio_id)', t || '_negocio_idx', t);
  execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function public.set_updated_at()', t);
  execute format('alter table public.%I enable row level security', t);
  execute format($f$create policy %I on public.%I as restrictive for all to authenticated
    using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
    with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))$f$, t || '_negocio', t);
  execute format($f$create policy %I on public.%I for all to peludesk_definer
    using (negocio_id = (select public.negocio_actual()))
    with check (negocio_id = (select public.negocio_actual()))$f$, t || '_negocio_definer', t);
  execute format($f$create policy %I on public.%I as restrictive for insert to authenticated, peludesk_definer
    with check ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_ins', t);
  execute format($f$create policy %I on public.%I as restrictive for update to authenticated, peludesk_definer
    using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_upd', t);
  execute format($f$create policy %I on public.%I as restrictive for delete to authenticated, peludesk_definer
    using ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_del', t);
  -- Leer: admin y recepción (los precios internos no los ve estética ni el cliente). Escribir: solo por funciones.
  execute format($f$create policy %I on public.%I for select to authenticated
    using ((select coalesce(public.current_rol() in ('admin', 'recepcion'), false)))$f$, t || '_select', t);
  execute format('revoke all on public.%I from anon, authenticated', t);
  execute format('grant select on public.%I to authenticated', t);
  execute format('grant select, insert, update, delete on public.%I to peludesk_definer', t);
end $$;

-- ── 3. «Por talla» → «Mestizo / sin raza» (con su respaldo) ──────────
do $$
declare
  v_corto uuid;
  v_grupos jsonb;
  v_tarifas jsonb;
begin
  select id into v_corto from public.tipos_pelaje where clave = 'corto' and deleted_at is null;
  if v_corto is null then
    raise exception 'No existe el pelaje «corto».';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'negocio_id', g.negocio_id, 'clave', g.clave, 'nombre', g.nombre,
           'pelajes_permitidos', g.pelajes_permitidos, 'depende_pelaje', g.depende_pelaje)), '[]'::jsonb)
  into v_grupos
  from public.grupos_raza g where g.clave = 'pelo_corto' and g.deleted_at is null;

  select coalesce(jsonb_agg(t.id), '[]'::jsonb)
  into v_tarifas
  from public.tarifas t join public.grupos_raza g on g.id = t.grupo_raza_id
  where g.clave = 'pelo_corto' and t.pelaje_id is null;

  insert into public.plataforma_eventos (accion, motivo, detalle)
  values ('migracion_matriz_mestizo', 'Migración 20261009000000: «Por talla» pasa a «Mestizo / sin raza» (matriz talla × pelaje)',
          jsonb_build_object('grupos', v_grupos, 'tarifas_con_pelaje_asignado', v_tarifas));

  -- Los precios de hoy son de pelo corto: no cambia ni un peso, solo se les
  -- dice a qué pelaje pertenecen.
  update public.tarifas t set pelaje_id = v_corto
  from public.grupos_raza g
  where g.id = t.grupo_raza_id and g.clave = 'pelo_corto' and t.pelaje_id is null;

  update public.grupos_raza
  set nombre = 'Mestizo / sin raza', clave = 'mestizo', depende_pelaje = true, pelajes_permitidos = null
  where clave = 'pelo_corto' and deleted_at is null;
end $$;

-- Un negocio nuevo (crear_negocio copia los grupos del negocio modelo) hereda
-- también la forma del grupo, nunca los precios.
do $$
declare
  v_def text;
begin
  select replace(pg_get_functiondef('public.crear_negocio'::regproc), chr(13), '') into v_def;
  if position('depende_pelaje' in v_def) = 0 then
    v_def := replace(v_def,
      'insert into public.grupos_raza (negocio_id, clave, nombre, depende_tamano, es_predeterminado, orden)
    values (v_id, r.clave, r.nombre, r.depende_tamano, r.es_predeterminado, r.orden)',
      'insert into public.grupos_raza (negocio_id, clave, nombre, depende_tamano, es_predeterminado, orden, depende_pelaje, pelajes_permitidos)
    values (v_id, r.clave, r.nombre, r.depende_tamano, r.es_predeterminado, r.orden, r.depende_pelaje, r.pelajes_permitidos)');
    if position('depende_pelaje' in v_def) = 0 then
      raise exception 'crear_negocio cambió: no se pudo copiar depende_pelaje.';
    end if;
    execute v_def;
  end if;
end $$;

-- ── 4. describir_precio_faltante: el aviso de estética dice qué hacer ──

-- ── 5. cotizar_cita_estetica: UN aviso, accionable ───────────────────
-- Responde lo mismo que validar_cita_estetica va a resolver al guardar, sin
-- escribir nada: estado ok (con precio), faltan_datos (talla y/o pelaje del
-- perro), sin_grupo, sin_precio, no_aplica o pelaje_no_ofrecido.
create or replace function public.cotizar_cita_estetica(
  p_perro_id uuid, p_servicio_id uuid, p_pelo_maltratado boolean default false, p_grupo_excepcion_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_serv record;
  v_perro record;
  v_grupo record;
  v_hay_grupo boolean := false;
  v_g_id uuid;
  v_g_nombre text;
  v_g_dt boolean;
  v_g_dp boolean;
  v_permitidos text[];
  v_necesita_talla boolean;
  v_necesita_pelaje boolean;
  v_pelaje_en_precio boolean;
  v_faltan text[] := '{}';
  v_res record;
  v_ruta text := '/servicios/' || p_servicio_id || '/tarifas';
  v_base jsonb;
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal cotiza una cita.' using errcode = '42501';
  end if;
  select s.id, s.nombre, s.depende_tamano, s.depende_pelaje, s.depende_grupo_raza, coalesce(s.pelajes_excluidos, '{}') as excluidos
  into v_serv from public.servicios s where s.id = p_servicio_id and s.deleted_at is null;
  if not found then
    raise exception 'Ese servicio no existe.';
  end if;
  select p.id, p.nombre, p.tamano_id, p.pelaje_id, pe.clave as pelaje_clave
  into v_perro from public.perros p left join public.tipos_pelaje pe on pe.id = p.pelaje_id
  where p.id = p_perro_id and p.deleted_at is null;
  if not found then
    raise exception 'Ese perro no existe.';
  end if;

  v_base := jsonb_build_object('servicio_id', p_servicio_id, 'ruta_precios', v_ruta,
    'tamano_id', v_perro.tamano_id, 'pelaje_id', v_perro.pelaje_id);

  if v_perro.pelaje_clave is not null and v_perro.pelaje_clave = any (v_serv.excluidos) then
    return v_base || jsonb_build_object('estado', 'pelaje_no_ofrecido', 'pelaje_clave', v_perro.pelaje_clave);
  end if;

  if v_serv.depende_grupo_raza then
    if p_grupo_excepcion_id is not null then
      select g.id, g.nombre, g.depende_tamano, g.depende_pelaje, g.pelajes_permitidos into v_g_id, v_g_nombre, v_g_dt, v_g_dp, v_permitidos
      from public.grupos_raza g where g.id = p_grupo_excepcion_id and g.deleted_at is null;
      if v_g_id is null then
        raise exception 'El grupo de la excepción no existe en este negocio.';
      end if;
      v_hay_grupo := true;
    else
      select * into v_grupo from public.perro_grupo_raza where perro_id = p_perro_id;
      if coalesce(v_grupo.sin_grupo, false) then
        return v_base || jsonb_build_object('estado', 'sin_grupo', 'motivo', v_grupo.sin_grupo_motivo,
          'grupo_nombre', v_grupo.grupo_nombre, 'raza_nombre', v_grupo.raza_nombre);
      end if;
      select g.id, g.nombre, g.depende_tamano, g.depende_pelaje, g.pelajes_permitidos into v_g_id, v_g_nombre, v_g_dt, v_g_dp, v_permitidos
      from public.grupos_raza g where g.id = v_grupo.grupo_raza_id;
      v_hay_grupo := v_g_id is not null;
    end if;
  end if;

  v_necesita_talla := case when v_hay_grupo then coalesce(v_g_dt, false) else v_serv.depende_tamano end;
  v_pelaje_en_precio := coalesce(v_serv.depende_pelaje, false) or (v_hay_grupo and coalesce(v_g_dp, false));
  v_necesita_pelaje := v_pelaje_en_precio or cardinality(v_serv.excluidos) > 0;

  if v_necesita_talla and v_perro.tamano_id is null then v_faltan := array_append(v_faltan, 'tamano'); end if;
  if v_necesita_pelaje and v_perro.pelaje_id is null then v_faltan := array_append(v_faltan, 'pelaje'); end if;
  if cardinality(v_faltan) > 0 then
    return v_base || jsonb_build_object('estado', 'faltan_datos', 'faltan', to_jsonb(v_faltan),
      'grupo_nombre', v_g_nombre, 'depende_pelaje', v_pelaje_en_precio, 'depende_tamano', v_necesita_talla);
  end if;

  if v_permitidos is not null and (v_perro.pelaje_clave is null or not (v_perro.pelaje_clave = any (v_permitidos))) then
    return v_base || jsonb_build_object('estado', 'sin_precio', 'grupo_nombre', v_g_nombre, 'motivo', 'pelaje_fuera_del_grupo');
  end if;

  select * into v_res from public.resolver_precio(
    p_servicio_id,
    case when v_necesita_talla then v_perro.tamano_id else null end,
    case when v_pelaje_en_precio then v_perro.pelaje_id else null end,
    1, public.fecha_negocio(),
    case when v_hay_grupo then v_g_id else null end,
    coalesce(p_pelo_maltratado, false));

  if v_res.estado = 'disponible' then
    return v_base || jsonb_build_object('estado', 'ok', 'precio', v_res.precio, 'grupo_nombre', v_g_nombre,
      'maltratado_aplicado', coalesce(p_pelo_maltratado, false) and v_res.precio_pelo_maltratado is not null);
  elsif v_res.estado = 'no_aplica' then
    return v_base || jsonb_build_object('estado', 'no_aplica', 'grupo_nombre', v_g_nombre);
  end if;
  return v_base || jsonb_build_object('estado', 'sin_precio', 'grupo_nombre', v_g_nombre);
end;
$$;
alter function public.cotizar_cita_estetica(uuid, uuid, boolean, uuid) owner to peludesk_definer;

-- ── 6. El admin confirma los precios calculados de un grupo ──────────
create or replace function public.confirmar_tarifas_calculadas(p_grupo_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
  v_ids jsonb;
begin
  if not coalesce(public.tiene_permiso('tarifas'), false) then
    raise exception 'Confirmar precios es de admin o de quien tenga el permiso «Precios y tarifas».' using errcode = '42501';
  end if;
  if not exists (select 1 from public.grupos_raza where id = p_grupo_id and negocio_id = public.negocio_actual() and deleted_at is null) then
    raise exception 'Ese grupo no existe en este negocio.';
  end if;
  select coalesce(jsonb_agg(t.id), '[]'::jsonb) into v_ids
  from public.tarifas t where t.grupo_raza_id = p_grupo_id and t.calculado and t.deleted_at is null;
  update public.tarifas set calculado = false where grupo_raza_id = p_grupo_id and calculado and deleted_at is null;
  get diagnostics v_n = row_count;
  insert into public.tarifas_eventos (negocio_id, accion, grupo_raza_id, detalle, actor)
  values (public.negocio_actual(), 'confirmar_calculadas', p_grupo_id, jsonb_build_object('tarifas', v_ids, 'cuantas', v_n), auth.uid());
  return v_n;
end;
$$;
alter function public.confirmar_tarifas_calculadas(uuid) owner to peludesk_definer;

-- ── 7. Carga de tablas de precios de estética (plataforma) ───────────
-- Ahora con pelaje y la marca «calculado», y guarda EXACTO lo que creó o cambió
-- (para deshacerlo sin dejar celdas sueltas).
create or replace function public.plataforma_cargar_tarifas_estetica(p_negocio_id uuid, p_config jsonb, p_motivo text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_hoy date;
  v_antes jsonb;
  v_t jsonb;
  v_s jsonb;
  v_g jsonb;
  v_servicio uuid;
  v_grupo uuid;
  v_tamano uuid;
  v_pelaje uuid;
  v_actual record;
  v_precio numeric;
  v_malt numeric;
  v_na boolean;
  v_calc boolean;
  v_id uuid;
  v_nuevas int := 0;
  v_iguales int := 0;
  v_reglas int := 0;
  v_creadas jsonb := '[]'::jsonb;
  v_actualizadas jsonb := '[]'::jsonb;
  v_reglas_antes jsonb := '[]'::jsonb;
  v_evento uuid;
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
      'servicio', s.clave, 'grupo', g.clave, 'tamano', tc.clave, 'pelaje', pl.clave, 'precio', t.precio,
      'maltratado', t.precio_pelo_maltratado, 'no_aplica', t.no_aplica, 'calculado', t.calculado, 'vigencia_desde', t.vigencia_desde)
      order by s.clave, g.orden, tc.orden), '[]'::jsonb)
  into v_antes
  from public.tarifas t
  join public.servicios s on s.id = t.servicio_id
  left join public.grupos_raza g on g.id = t.grupo_raza_id
  left join public.tamanos_categoria tc on tc.id = t.tamano_id
  left join public.tipos_pelaje pl on pl.id = t.pelaje_id
  where t.negocio_id = p_negocio_id and s.categoria = 'estetica' and t.deleted_at is null and s.deleted_at is null;

  for v_s in select * from jsonb_array_elements(coalesce(p_config -> 'servicios', '[]'::jsonb)) loop
    v_reglas_antes := v_reglas_antes || (select coalesce(jsonb_agg(jsonb_build_object('tipo', 'servicio', 'clave', s.clave, 'pelajes_excluidos', s.pelajes_excluidos)), '[]'::jsonb)
      from public.servicios s where s.negocio_id = p_negocio_id and s.clave = v_s ->> 'clave' and s.deleted_at is null);
    update public.servicios set pelajes_excluidos = coalesce(array(select jsonb_array_elements_text(v_s -> 'pelajes_excluidos')), '{}')
    where negocio_id = p_negocio_id and clave = v_s ->> 'clave' and deleted_at is null
      and pelajes_excluidos is distinct from coalesce(array(select jsonb_array_elements_text(v_s -> 'pelajes_excluidos')), '{}');
    if found then v_reglas := v_reglas + 1; end if;
  end loop;
  for v_g in select * from jsonb_array_elements(coalesce(p_config -> 'grupos', '[]'::jsonb)) loop
    v_reglas_antes := v_reglas_antes || (select coalesce(jsonb_agg(jsonb_build_object('tipo', 'grupo', 'clave', g.clave, 'pelajes_permitidos', g.pelajes_permitidos, 'depende_pelaje', g.depende_pelaje)), '[]'::jsonb)
      from public.grupos_raza g where g.negocio_id = p_negocio_id and g.clave = v_g ->> 'clave' and g.deleted_at is null);
    update public.grupos_raza set
      pelajes_permitidos = case when v_g ? 'pelajes_permitidos' then
        (case when jsonb_typeof(v_g -> 'pelajes_permitidos') = 'array' then array(select jsonb_array_elements_text(v_g -> 'pelajes_permitidos')) else null end)
        else pelajes_permitidos end,
      depende_pelaje = case when v_g ? 'depende_pelaje' then coalesce((v_g ->> 'depende_pelaje')::boolean, false) else depende_pelaje end
    where negocio_id = p_negocio_id and clave = v_g ->> 'clave' and deleted_at is null;
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
    v_pelaje := null;
    if coalesce(v_t ->> 'pelaje', '') <> '' then
      select id into v_pelaje from public.tipos_pelaje where clave = v_t ->> 'pelaje' and deleted_at is null;
      if v_pelaje is null then raise exception 'El pelaje «%» no existe.', v_t ->> 'pelaje'; end if;
    end if;
    v_na := coalesce((v_t ->> 'no_aplica')::boolean, false);
    v_calc := coalesce((v_t ->> 'calculado')::boolean, false);
    v_precio := case when v_na then null else (v_t ->> 'precio')::numeric end;
    v_malt := case when v_na then null else nullif(v_t ->> 'maltratado', '')::numeric end;
    if not v_na and v_precio is null then raise exception 'Falta el precio de %/%.', v_t ->> 'servicio', v_t ->> 'grupo'; end if;

    select * into v_actual from public.tarifas
    where servicio_id = v_servicio and grupo_raza_id = v_grupo and tamano_id is not distinct from v_tamano and pelaje_id is not distinct from v_pelaje
      and deleted_at is null and vigencia_desde <= v_hoy
    order by vigencia_desde desc limit 1;

    if found and v_actual.no_aplica = v_na and v_actual.precio is not distinct from v_precio and v_actual.precio_pelo_maltratado is not distinct from v_malt then
      v_iguales := v_iguales + 1;
    elsif found and v_actual.vigencia_desde = v_hoy then
      v_actualizadas := v_actualizadas || jsonb_build_object('id', v_actual.id, 'precio', v_actual.precio, 'maltratado', v_actual.precio_pelo_maltratado,
        'no_aplica', v_actual.no_aplica, 'calculado', v_actual.calculado);
      update public.tarifas set precio = v_precio, precio_pelo_maltratado = v_malt, no_aplica = v_na, calculado = v_calc where id = v_actual.id;
      v_nuevas := v_nuevas + 1;
    else
      insert into public.tarifas (negocio_id, servicio_id, grupo_raza_id, tamano_id, pelaje_id, cantidad_desde, cantidad_hasta, vigencia_desde, precio, precio_pelo_maltratado, no_aplica, calculado)
      values (p_negocio_id, v_servicio, v_grupo, v_tamano, v_pelaje, coalesce(v_actual.cantidad_desde, 1), v_actual.cantidad_hasta, v_hoy, v_precio, v_malt, v_na, v_calc)
      returning id into v_id;
      v_creadas := v_creadas || to_jsonb(v_id);
      v_nuevas := v_nuevas + 1;
    end if;
  end loop;

  insert into public.plataforma_eventos (accion, motivo, detalle, created_by)
  values ('cargar_tarifas_estetica', nullif(btrim(coalesce(p_motivo, '')), ''),
          jsonb_build_object('negocio_id', p_negocio_id, 'antes', v_antes, 'config', p_config, 'tarifas_nuevas', v_nuevas, 'tarifas_iguales', v_iguales, 'reglas_cambiadas', v_reglas,
                             'creadas', v_creadas, 'actualizadas', v_actualizadas, 'reglas_antes', v_reglas_antes,
                             'via', case when auth.role() = 'service_role' then 'servicio' else 'sesion' end),
          auth.uid())
  returning id into v_evento;
  if exists (select 1 from jsonb_array_elements(coalesce(p_config -> 'tarifas', '[]'::jsonb)) x where coalesce((x ->> 'calculado')::boolean, false)) then
    insert into public.tarifas_eventos (negocio_id, accion, detalle, actor)
    values (p_negocio_id, 'carga_calculada', jsonb_build_object('evento_plataforma', v_evento, 'creadas', v_creadas), auth.uid());
  end if;
  return jsonb_build_object('tarifas_nuevas', v_nuevas, 'tarifas_iguales', v_iguales, 'reglas_cambiadas', v_reglas, 'evento', v_evento);
end;
$function$;

-- Deshace una carga: da de baja lo que creó, devuelve lo que cambió y las
-- reglas de pelaje a como estaban. Idempotente por evento (queda anotado).
create or replace function public.plataforma_revertir_carga_tarifas(p_evento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ev record;
  v_neg uuid;
  v_x jsonb;
  v_bajas int := 0;
  v_devueltas int := 0;
begin
  if not (coalesce((select public.es_admin_plataforma()), false) or auth.role() = 'service_role') then
    raise exception 'Solo la administración de la plataforma.' using errcode = '42501';
  end if;
  select * into v_ev from public.plataforma_eventos where id = p_evento_id and accion = 'cargar_tarifas_estetica';
  if not found then raise exception 'Ese evento de carga no existe.'; end if;
  if not (v_ev.detalle ? 'creadas') then
    raise exception 'Ese evento es anterior a la reversa exacta: usa la reversa por valores del script.';
  end if;
  if exists (select 1 from public.plataforma_eventos where accion = 'revertir_tarifas_estetica' and detalle ->> 'evento' = p_evento_id::text) then
    raise exception 'Ese evento ya se revirtió.';
  end if;
  v_neg := (v_ev.detalle ->> 'negocio_id')::uuid;
  perform set_config('app.negocio_id', v_neg::text, true);

  update public.tarifas set deleted_at = now()
  where negocio_id = v_neg and deleted_at is null
    and id in (select (jsonb_array_elements_text(v_ev.detalle -> 'creadas'))::uuid);
  get diagnostics v_bajas = row_count;

  for v_x in select * from jsonb_array_elements(v_ev.detalle -> 'actualizadas') loop
    update public.tarifas set precio = nullif(v_x ->> 'precio', '')::numeric, precio_pelo_maltratado = nullif(v_x ->> 'maltratado', '')::numeric,
      no_aplica = (v_x ->> 'no_aplica')::boolean, calculado = (v_x ->> 'calculado')::boolean
    where id = (v_x ->> 'id')::uuid and negocio_id = v_neg;
    v_devueltas := v_devueltas + 1;
  end loop;

  for v_x in select * from jsonb_array_elements(v_ev.detalle -> 'reglas_antes') loop
    if v_x ->> 'tipo' = 'servicio' then
      update public.servicios set pelajes_excluidos = coalesce(array(select jsonb_array_elements_text(v_x -> 'pelajes_excluidos')), '{}')
      where negocio_id = v_neg and clave = v_x ->> 'clave' and deleted_at is null;
    else
      update public.grupos_raza set
        pelajes_permitidos = case when jsonb_typeof(v_x -> 'pelajes_permitidos') = 'array' then array(select jsonb_array_elements_text(v_x -> 'pelajes_permitidos')) else null end,
        depende_pelaje = coalesce((v_x ->> 'depende_pelaje')::boolean, false)
      where negocio_id = v_neg and clave = v_x ->> 'clave' and deleted_at is null;
    end if;
  end loop;

  insert into public.plataforma_eventos (accion, motivo, detalle, created_by)
  values ('revertir_tarifas_estetica', 'Reversión de la carga ' || p_evento_id,
          jsonb_build_object('evento', p_evento_id, 'negocio_id', v_neg, 'tarifas_dadas_de_baja', v_bajas, 'tarifas_devueltas', v_devueltas), auth.uid());
  return jsonb_build_object('dadas_de_baja', v_bajas, 'devueltas', v_devueltas);
end;
$$;
revoke execute on function public.plataforma_revertir_carga_tarifas(uuid) from public, anon;
grant execute on function public.plataforma_revertir_carga_tarifas(uuid) to authenticated, service_role;

do $$
declare
  f text;
begin
  foreach f in array array['public.cotizar_cita_estetica(uuid, uuid, boolean, uuid)', 'public.confirmar_tarifas_calculadas(uuid)',
                           'public.plataforma_cargar_tarifas_estetica(uuid, jsonb, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

CREATE OR REPLACE FUNCTION public.describir_precio_faltante(p_servicio_id uuid, p_tamano_id uuid, p_pelaje_id uuid, p_cantidad numeric, p_fecha date, p_grupo_raza_id uuid DEFAULT NULL::uuid, p_estado text DEFAULT 'sin_tarifa'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_nombre text;
  v_unidad text;
  v_ruta text := '/servicios/' || p_servicio_id || '/tarifas';
  v_celda text;
  v_min numeric;
  v_hay_vigente boolean;
  v_futura date;
  v_singular text;
  v_plural text;
begin
  select s.nombre, s.unidad into v_nombre, v_unidad from public.servicios s where s.id = p_servicio_id;

  v_celda := concat_ws(', ',
    (select 'talla ' || lower(t.etiqueta) from public.tamanos_categoria t where t.id = p_tamano_id),
    (select 'grupo ' || g.nombre from public.grupos_raza g where g.id = p_grupo_raza_id),
    (select 'pelaje ' || lower(pl.etiqueta) from public.tipos_pelaje pl where pl.id = p_pelaje_id)
  );
  v_celda := case when v_celda = '' then '' else ' para ' || v_celda end;

  if p_estado = 'no_aplica' then
    return format('«%s»%s está marcado como «no aplica». Si sí se ofrece, ponle precio en %s',
      v_nombre, v_celda, v_ruta);
  end if;

  v_singular := case v_unidad when 'noche' then 'noche' when 'dia' then 'día' when 'hora' then 'hora'
    when 'sesion' then 'sesión' when 'km' then 'km' else 'vez' end;
  v_plural := case v_unidad when 'noche' then 'noches' when 'dia' then 'días' when 'hora' then 'horas'
    when 'sesion' then 'sesiones' when 'km' then 'km' else 'veces' end;

  -- 0 noches: la causa más común y la que más confunde.
  if v_unidad = 'noche' and coalesce(p_cantidad, 0) < 1 then
    return format('La salida no es después de la entrada: son 0 noches y «%s» se cobra por noche. '
      || 'Pon la salida al menos un día después de la entrada.', v_nombre);
  end if;

  select min(tr.cantidad_desde), bool_or(tr.vigencia_desde <= p_fecha)
  into v_min, v_hay_vigente
  from public.tarifas tr
  where tr.servicio_id = p_servicio_id
    and tr.grupo_raza_id is not distinct from p_grupo_raza_id
    and tr.tamano_id is not distinct from p_tamano_id
    and tr.pelaje_id is not distinct from p_pelaje_id
    and tr.deleted_at is null;

  if v_min is not null and p_cantidad < v_min then
    return format('«%s»%s tiene precio a partir de %s %s y aquí son %s. Revisa la cantidad, o captura ese tramo en %s',
      v_nombre, v_celda, v_min, case when v_min = 1 then v_singular else v_plural end, p_cantidad, v_ruta);
  end if;

  select min(tr.vigencia_desde) into v_futura
  from public.tarifas tr
  where tr.servicio_id = p_servicio_id
    and tr.grupo_raza_id is not distinct from p_grupo_raza_id
    and tr.tamano_id is not distinct from p_tamano_id
    and tr.pelaje_id is not distinct from p_pelaje_id
    and p_cantidad >= tr.cantidad_desde
    and (tr.cantidad_hasta is null or p_cantidad <= tr.cantidad_hasta)
    and tr.vigencia_desde > p_fecha
    and tr.deleted_at is null;

  if v_futura is not null then
    return format('El precio de «%s»%s empieza a valer el %s y esta fecha es el %s. '
      || 'Revisa la fecha, o captura un precio que valga desde antes en %s',
      v_nombre, v_celda, to_char(v_futura, 'DD/MM/YYYY'), to_char(p_fecha, 'DD/MM/YYYY'), v_ruta);
  end if;

  if v_min is not null then
    return format('«%s»%s no tiene precio para %s %s: ningún tramo capturado cubre esa cantidad. Captúralo en %s',
      v_nombre, v_celda, p_cantidad, case when p_cantidad = 1 then v_singular else v_plural end, v_ruta);
  end if;

  if p_grupo_raza_id is not null and exists (select 1 from public.servicios s where s.id = p_servicio_id and s.categoria = 'estetica') then
    return format('Esta combinación no tiene precio («%s»%s): agrega el precio en Servicios y precios (%s), o registra una excepción con motivo al agendar la cita.',
      v_nombre, v_celda, v_ruta);
  end if;
  return format('Falta el precio de «%s»%s. Captúralo en %s', v_nombre, v_celda, v_ruta);
end;
$function$;

-- ── 8. validar_cita_estetica: pelaje por grupo y excepción también con celda vacía ──
CREATE OR REPLACE FUNCTION public.validar_cita_estetica()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_grupo_dep_pelaje boolean := false;
  v_cambio_recargo boolean;
  v_retirado boolean := false;
begin
  -- Cambiar SOLO la estilista (reasignar_estilista_cita) no vuelve a validar ni
  -- a cotizar: un servicio que ya se retiró del catálogo, o una tarifa que ya
  -- cambió, no pueden impedir corregir quién atendió una cita que ya existe.
  if TG_OP = 'UPDATE' and coalesce(current_setting('app.reasignacion_estilista', true), '') = 'on' then
    return new;
  end if;

  -- Una cita que ya existía y NO cambia de servicio se valida contra su
  -- servicio aunque ya se haya dado de baja del catálogo (cancelarla, cerrarla
  -- o cobrarla no depende de que se siga ofreciendo). Para una cita nueva, o
  -- para cambiarle el servicio, el servicio tiene que estar vivo.
  select categoria, duracion_minutos, depende_tamano, depende_pelaje, depende_grupo_raza, pelajes_excluidos, nombre, deleted_at is not null
    into v_categoria, v_duracion, v_depende_tamano, v_depende_pelaje, v_depende_grupo, v_excluidos, v_nombre_servicio, v_retirado
  from public.servicios
  where id = new.servicio_id
    and (deleted_at is null or (TG_OP = 'UPDATE' and old.servicio_id = new.servicio_id));

  if v_categoria is null then
    raise exception 'El servicio de esta cita ya no se ofrece en el catálogo. Cambia el servicio con «Corregir servicio» en el detalle de la cita.';
  end if;
  if v_retirado and (new.inicio is distinct from old.inicio or new.perro_id is distinct from old.perro_id
      or new.pelo_maltratado is distinct from old.pelo_maltratado or new.recargo is distinct from old.recargo) then
    raise exception 'El servicio «%» ya no se ofrece en el catálogo. Corrige el servicio de esta cita (Corregir servicio) antes de cambiar su fecha, su perro o su recargo.', v_nombre_servicio;
  end if;
  if v_categoria <> 'estetica' then
    raise exception 'Una cita de estética solo puede usar un servicio de categoría estetica.';
  end if;

  -- Iniciar o terminar un servicio pide una estilista: sin ella no hay a
  -- quién atribuirle la comisión ni el trabajo.
  if new.empleado_id is null and new.estado in ('en_curso', 'finalizada') then
    raise exception 'Esta cita no tiene estilista asignada. Asígnale una antes de iniciar o terminar el servicio.';
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
      if coalesce(v_grupo.sin_grupo, false) or new.grupo_raza_excepcion_id is not null then
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

    -- El grupo de raza puede cobrar por pelaje (la matriz del mestizo): ese
    -- pelaje entra al precio de ESE grupo aunque el servicio no dependa de él.
    if v_depende_grupo then
      v_grupo_dep_pelaje := coalesce((select g.depende_pelaje from public.grupos_raza g where g.id = v_grupo.grupo_raza_id), false);
    end if;
    if v_depende_pelaje or v_grupo_dep_pelaje then
      select pelaje_id into new.pelaje_id from public.perros where id = new.perro_id;
      if new.pelaje_id is null then
        raise exception 'Este perro no tiene pelaje registrado. Captúralo en su expediente (/perros/%) antes de reservar.', new.perro_id;
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

    -- Al CORREGIR el servicio de una cita vieja puede no haber tarifa vigente en
    -- la fecha de la cita (se capturó antes de que existiera): se usa la
    -- tarifa de hoy y se marca para decírselo a quien corrige.
    if v_estado_precio = 'sin_tarifa'
       and coalesce(current_setting('app.correccion_servicio', true), '') = 'on'
       and v_fecha_local < public.fecha_negocio() then
      select precio, estado into v_precio, v_estado_precio
      from public.resolver_precio(
        new.servicio_id, new.tamano_id, new.pelaje_id, 1, public.fecha_negocio(),
        case when v_depende_grupo then v_grupo.grupo_raza_id else null end,
        new.pelo_maltratado
      );
      if v_estado_precio not in ('sin_tarifa', 'no_aplica') then
        perform set_config('app.correccion_tarifa_hoy', 'on', true);
      end if;
    end if;

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
$function$;

-- ── 9. Frontera: la reversa de cargas es de la plataforma ──
do $$
declare
  v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), chr(13), '') into v_def;
  if position('plataforma_revertir_carga_tarifas' in v_def) = 0 then
    v_def := replace(v_def, $a$('avisos_marcar')$a$, $b$('avisos_marcar'), ('plataforma_revertir_carga_tarifas')$b$);
    if position('plataforma_revertir_carga_tarifas' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar plataforma_revertir_carga_tarifas.';
    end if;
    execute v_def;
  end if;
end $$;
