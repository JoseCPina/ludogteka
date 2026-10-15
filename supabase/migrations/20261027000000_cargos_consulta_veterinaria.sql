-- Cobro de la consulta veterinaria (27 de octubre de 2026, carril A).
--
-- Antes: firmar una consulta no generaba ningún cargo y Caja no tenía un servicio
-- de consulta. Ahora:
--  * categoría de servicio «veterinaria» (Servicios y precios) con cuatro conceptos
--    base por negocio: consulta general, consulta de urgencia, revisión o seguimiento
--    y aplicación de vacuna. Se siembran al prender Veterinaria y se capturan sus precios
--    en la matriz de siempre (una sola celda cada uno).
--  * vet_consulta_cargos: las líneas de cobro de UNA consulta. Mientras es borrador son
--    una propuesta que el médico ve y puede quitar o ajustar; al firmar pasan a la cuenta
--    (reservas + cargos_aplicados de monto libre: Caja, cobro junto, descuentos,
--    devoluciones y facturación no cambian).
--  * Cuenta: la de la hospitalización si la mascota está internada; la de un estimado
--    aceptado ligado a la consulta (sin duplicar lo que el estimado ya cubre); si no, una
--    cuenta nueva.
--  * Permiso nuevo «ajustar_cargos_consulta» (quitar o cambiar precio/cantidad).
--
-- REVERSA: quitar las funciones vet_consulta_cargo*, _vet_cargo_*; restaurar
-- vet_consulta_firmar / vet_consulta_anular de 20261016000100; la tabla puede quedarse.

-- Ayudante temporal de redes (se borra al final, como en las demás migraciones del módulo).
create or replace function public._vet_redes(p_tabla text, p_lectura text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('create index %I on public.%I (negocio_id)', p_tabla || '_negocio_idx', p_tabla);
  execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function public.set_updated_at()', p_tabla);
  execute format('alter table public.%I enable row level security', p_tabla);
  execute format('create policy %I on public.%I as restrictive for all to authenticated using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro())) with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))', p_tabla || '_negocio', p_tabla);
  execute format('create policy %I on public.%I for all to peludesk_definer using (negocio_id = (select public.negocio_actual())) with check (negocio_id = (select public.negocio_actual()))', p_tabla || '_negocio_definer', p_tabla);
  execute format('create policy %I on public.%I as restrictive for insert to authenticated, peludesk_definer with check ((select public.exigir_negocio_escribible()))', p_tabla || '_escritura_ins', p_tabla);
  execute format('create policy %I on public.%I as restrictive for update to authenticated, peludesk_definer using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()))', p_tabla || '_escritura_upd', p_tabla);
  execute format('create policy %I on public.%I as restrictive for delete to authenticated, peludesk_definer using ((select public.exigir_negocio_escribible()))', p_tabla || '_escritura_del', p_tabla);
  execute format('create policy %I on public.%I for select to authenticated using (%s)', p_tabla || '_select', p_tabla, p_lectura);
  execute format('revoke all on public.%I from anon, authenticated', p_tabla);
  execute format('grant select on public.%I to authenticated', p_tabla);
  execute format('grant select, insert, update, delete on public.%I to peludesk_definer', p_tabla);
  execute format('create trigger exigir_modulo before insert or update on public.%I for each row execute function public.exigir_modulo_tabla(%L)', p_tabla, 'veterinaria');
end;
$$;
revoke execute on function public._vet_redes(text, text) from public, anon, authenticated;

-- ── 1. Categoría ─────────────────────────────────────────────────────
alter table public.servicios drop constraint servicios_categoria_check;
alter table public.servicios add constraint servicios_categoria_check
  check (categoria in ('guarderia', 'hotel', 'estetica', 'cargo', 'bono', 'veterinaria'));

insert into public.permisos_catalogo (clave, etiqueta, modulos, orden, updated_at)
values ('ajustar_cargos_consulta', 'Quitar o ajustar cargos de la consulta', '{veterinaria}',
        coalesce((select max(orden) from public.permisos_catalogo), 0) + 1, now())
on conflict (clave) do nothing;

-- ── 2. Catálogo base por negocio ─────────────────────────────────────
-- Interna: siembra para un negocio dado (la migración corre como postgres; las funciones
-- de peludesk_definer solo ven el negocio de la petición).
create or replace function public._vet_sembrar_servicios(p_negocio uuid)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_n int := 0;
  v_fila record;
begin
  for v_fila in
    select * from (values
      ('vet_consulta_general', 'Consulta general', 800),
      ('vet_consulta_urgencia', 'Consulta de urgencia', 801),
      ('vet_revision_seguimiento', 'Revisión o seguimiento', 802),
      ('vet_aplicacion_vacuna', 'Aplicación de vacuna', 803)
    ) as t(clave, nombre, orden)
  loop
    if not exists (select 1 from public.servicios s where s.negocio_id = p_negocio and s.clave = v_fila.clave) then
      insert into public.servicios (negocio_id, clave, nombre, categoria, unidad, orden, updated_at)
      values (p_negocio, v_fila.clave, v_fila.nombre, 'veterinaria', 'evento', v_fila.orden, now());
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
alter function public._vet_sembrar_servicios(uuid) owner to peludesk_definer;
revoke execute on function public._vet_sembrar_servicios(uuid) from public, anon, authenticated;

-- Quien captura precios o atiende consultas la llama (al abrir Servicios o una consulta):
-- solo escribe si Veterinaria está prendida y el negocio puede escribir.
create or replace function public.vet_asegurar_servicios()
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.modulo_activo('veterinaria'), false) or not coalesce(public.negocio_escribible(), false) then
    return 0;
  end if;
  if not (coalesce(public.is_admin(), false) or coalesce(public.tiene_permiso('tarifas'), false) or public.vet_puede('atender_consultas')) then
    return 0;
  end if;
  return public._vet_sembrar_servicios(public.negocio_actual());
end;
$$;
alter function public.vet_asegurar_servicios() owner to peludesk_definer;
revoke execute on function public.vet_asegurar_servicios() from public, anon;
grant execute on function public.vet_asegurar_servicios() to authenticated, service_role;

-- Los negocios que ya tienen Veterinaria prendida.
insert into public.servicios (negocio_id, clave, nombre, categoria, unidad, orden, updated_at)
select n.negocio_id, t.clave, t.nombre, 'veterinaria', 'evento', t.orden, now()
  from (select distinct nm.negocio_id from public.negocio_modulos nm
         where nm.modulo = 'veterinaria' and nm.activo and nm.deleted_at is null) n
 cross join (values
   ('vet_consulta_general', 'Consulta general', 800),
   ('vet_consulta_urgencia', 'Consulta de urgencia', 801),
   ('vet_revision_seguimiento', 'Revisión o seguimiento', 802),
   ('vet_aplicacion_vacuna', 'Aplicación de vacuna', 803)) as t(clave, nombre, orden)
 where not exists (select 1 from public.servicios s where s.negocio_id = n.negocio_id and s.clave = t.clave);

-- Al prender Veterinaria se siembran (el trigger corre con el negocio de la petición).
create or replace function public.vet_sembrar_al_prender()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.modulo = 'veterinaria' and new.activo and new.deleted_at is null then
    begin
      perform public._vet_sembrar_servicios(new.negocio_id);
    exception when others then
      null; -- prender el módulo nunca falla por esto; se siembran al abrir Servicios o una consulta
    end;
  end if;
  return new;
end;
$$;
revoke execute on function public.vet_sembrar_al_prender() from public, anon;
create trigger vet_sembrar_servicios after insert or update on public.negocio_modulos
  for each row execute function public.vet_sembrar_al_prender();

-- Los conceptos de monto libre con que la consulta entra a la cuenta.
create or replace function public.vet_servicio_cargo_consulta(p_tipo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clave text := 'vet_cons_' || p_tipo;
  v_nombre text := case p_tipo
    when 'consulta' then 'Consulta veterinaria'
    when 'vacuna' then 'Vacunas aplicadas'
    when 'medicamento' then 'Medicamentos y productos'
    else 'Procedimientos veterinarios' end;
  v_id uuid;
begin
  select s.id into v_id from public.servicios s where s.negocio_id = public.negocio_actual() and s.clave = v_clave and s.deleted_at is null;
  if v_id is null then
    insert into public.servicios (clave, nombre, categoria, unidad, monto_libre, orden)
    values (v_clave, v_nombre, 'cargo', 'evento', true, 920)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
alter function public.vet_servicio_cargo_consulta(text) owner to peludesk_definer;
revoke execute on function public.vet_servicio_cargo_consulta(text) from public, anon, authenticated;

-- ── 3. Las líneas de cobro de la consulta ────────────────────────────
create table public.vet_consulta_cargos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  consulta_id uuid not null references public.vet_consultas(id),
  tipo text not null check (tipo in ('consulta', 'vacuna', 'medicamento', 'procedimiento')),
  origen text not null check (origen in ('catalogo', 'carnet', 'inventario', 'manual')),
  concepto text not null check (btrim(concepto) <> ''),
  servicio_id uuid references public.servicios(id),
  insumo_id uuid references public.insumos(id),
  vacuna_id uuid references public.carnet_vacunas(id),
  evento_surtido uuid,
  cantidad numeric(12,2) not null default 1 check (cantidad > 0),
  -- Vacío = el catálogo o el inventario no tienen precio: no se cobra hasta que se capture.
  precio_unitario numeric(12,2) check (precio_unitario is null or precio_unitario >= 0),
  precio_original numeric(12,2),
  estado text not null default 'propuesto' check (estado in ('propuesto', 'quitado', 'cubierto', 'cobrado')),
  cubierto_por text check (cubierto_por is null or cubierto_por in ('estimado', 'teleconsulta')),
  cobrar_aparte boolean not null default false,
  motivo_quitado text,
  quitado_por uuid references auth.users(id) on delete set null,
  quitado_at timestamptz,
  ajuste_motivo text,
  ajustado_por uuid references auth.users(id) on delete set null,
  ajustado_at timestamptz,
  cargo_id uuid references public.cargos_aplicados(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (estado <> 'quitado' or motivo_quitado is not null),
  check (estado <> 'cobrado' or cargo_id is not null)
);
create index vet_consulta_cargos_consulta_idx on public.vet_consulta_cargos (consulta_id) where deleted_at is null;
create unique index vet_consulta_cargos_vacuna_uq on public.vet_consulta_cargos (vacuna_id) where vacuna_id is not null and deleted_at is null;
create unique index vet_consulta_cargos_evento_uq on public.vet_consulta_cargos (consulta_id, evento_surtido) where evento_surtido is not null and deleted_at is null;
create unique index vet_consulta_cargos_base_uq on public.vet_consulta_cargos (consulta_id) where origen = 'catalogo' and tipo = 'consulta' and deleted_at is null;
select public._vet_redes('vet_consulta_cargos', 'false');

-- ── 4. Precio de un producto por unidad de CONSUMO ───────────────────
-- precio_venta está por unidad de compra (como en la venta de mostrador).
create or replace function public._vet_precio_consumo(p_insumo uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case when i.se_vende and i.precio_venta is not null and uc.equivalencia_en_base > 0
              then round(i.precio_venta * ucons.equivalencia_en_base / uc.equivalencia_en_base, 2) end
  from public.insumos i
  join public.unidades_medida uc on uc.id = i.unidad_compra_id
  join public.unidades_medida ucons on ucons.id = i.unidad_consumo_id
  where i.id = p_insumo and i.deleted_at is null;
$$;
revoke execute on function public._vet_precio_consumo(uuid) from public, anon;
grant execute on function public._vet_precio_consumo(uuid) to authenticated, service_role;

create or replace function public._vet_precio_servicio(p_clave text)
returns numeric
language sql
stable
set search_path = ''
as $$
  select t.precio from public.tarifas_vigentes t
  join public.servicios s on s.id = t.servicio_id
  where s.clave = p_clave and s.deleted_at is null
    and t.grupo_raza_id is null and t.tamano_id is null and t.pelaje_id is null and not t.no_aplica
  order by t.vigencia_desde desc limit 1;
$$;
revoke execute on function public._vet_precio_servicio(text) from public, anon;
grant execute on function public._vet_precio_servicio(text) to authenticated, service_role;

-- ── 5. Propuesta: arma (o completa) las líneas de una consulta en borrador ──
create or replace function public._vet_cargos_sincronizar(p_consulta uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_c record;
  v_clave text;
  v_serv uuid;
  v_precio numeric;
  v_fee numeric;
  v_prod numeric;
  v_vac record;
  v_mov record;
  v_tele boolean;
  v_est record;
  v_fecha date;
  v_zona text := public.zona_negocio();
begin
  select c.id, c.perro_id, c.tipo_clave, c.cita_id, c.atendida_at, c.estado into v_c
    from public.vet_consultas c where c.id = p_consulta and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_c.id is null or v_c.estado <> 'borrador' then return; end if;
  v_fecha := (v_c.atendida_at at time zone v_zona)::date;

  -- La línea del tipo de consulta.
  v_clave := case v_c.tipo_clave when 'consulta' then 'vet_consulta_general' when 'urgencia' then 'vet_consulta_urgencia'
                                 when 'seguimiento' then 'vet_revision_seguimiento' else null end;
  if v_clave is not null then
    select s.id into v_serv from public.servicios s where s.clave = v_clave and s.deleted_at is null;
    if v_serv is not null then
      v_precio := public._vet_precio_servicio(v_clave);
      select exists (select 1 from public.vet_telemedicina t where t.cita_id = v_c.cita_id and t.deleted_at is null and coalesce(t.monto, 0) > 0) into v_tele;
      if not exists (select 1 from public.vet_consulta_cargos x where x.consulta_id = p_consulta and x.origen = 'catalogo' and x.tipo = 'consulta' and x.deleted_at is null) then
        insert into public.vet_consulta_cargos (consulta_id, tipo, origen, concepto, servicio_id, cantidad, precio_unitario, precio_original, estado, cubierto_por, updated_at)
        select p_consulta, 'consulta', 'catalogo', s.nombre, s.id, 1, v_precio, v_precio,
               case when coalesce(v_tele, false) then 'cubierto' else 'propuesto' end,
               case when coalesce(v_tele, false) then 'teleconsulta' end, now()
          from public.servicios s where s.id = v_serv;
      else
        -- Si el precio se capturó después, la propuesta lo toma (salvo que ya lo hayan ajustado).
        update public.vet_consulta_cargos set precio_unitario = v_precio, precio_original = v_precio, updated_at = now()
         where consulta_id = p_consulta and origen = 'catalogo' and tipo = 'consulta' and deleted_at is null
           and estado = 'propuesto' and ajustado_at is null and precio_unitario is distinct from v_precio;
      end if;
    end if;
  end if;

  -- Vacunas aplicadas a la mascota ese día que ninguna consulta ha cobrado.
  v_fee := public._vet_precio_servicio('vet_aplicacion_vacuna');
  select s.id into v_serv from public.servicios s where s.clave = 'vet_aplicacion_vacuna' and s.deleted_at is null;
  for v_vac in
    select cv.id, cv.biologico, cv.insumo_id from public.carnet_vacunas cv
     where cv.perro_id = v_c.perro_id and cv.fecha_aplicacion = v_fecha and cv.anulada_at is null and cv.deleted_at is null
       and not exists (select 1 from public.vet_consulta_cargos x where x.vacuna_id = cv.id and x.deleted_at is null)
  loop
    v_prod := case when v_vac.insumo_id is not null then public._vet_precio_consumo(v_vac.insumo_id) end;
    insert into public.vet_consulta_cargos (consulta_id, tipo, origen, concepto, servicio_id, insumo_id, vacuna_id, cantidad, precio_unitario, precio_original, updated_at)
    values (p_consulta, 'vacuna', 'carnet', 'Vacuna: ' || v_vac.biologico, v_serv, v_vac.insumo_id, v_vac.id, 1,
            case when v_fee is null and v_prod is null then null else coalesce(v_fee, 0) + coalesce(v_prod, 0) end,
            case when v_fee is null and v_prod is null then null else coalesce(v_fee, 0) + coalesce(v_prod, 0) end, now());
  end loop;

  -- Medicamentos surtidos con esta consulta (un surtido repartido entre lotes es UNA línea).
  for v_mov in
    select coalesce(m.evento_surtido, m.id) as evento, m.insumo_id, sum(m.cantidad_base) as base, i.nombre,
           ucons.equivalencia_en_base as eq_cons
      from public.lotes_movimientos m
      join public.insumos i on i.id = m.insumo_id
      join public.unidades_medida ucons on ucons.id = i.unidad_consumo_id
     where m.consulta_id = p_consulta and m.tipo = 'salida_surtido' and m.deleted_at is null and not m.uso_hospitalario
     group by coalesce(m.evento_surtido, m.id), m.insumo_id, i.nombre, ucons.equivalencia_en_base
  loop
    if not exists (select 1 from public.vet_consulta_cargos x where x.consulta_id = p_consulta and x.evento_surtido = v_mov.evento and x.deleted_at is null) then
      v_prod := public._vet_precio_consumo(v_mov.insumo_id);
      insert into public.vet_consulta_cargos (consulta_id, tipo, origen, concepto, insumo_id, evento_surtido, cantidad, precio_unitario, precio_original, updated_at)
      values (p_consulta, 'medicamento', 'inventario', v_mov.nombre, v_mov.insumo_id, v_mov.evento,
              round(v_mov.base / nullif(v_mov.eq_cons, 0), 2), v_prod, v_prod, now());
    end if;
  end loop;

  -- Lo que un estimado aceptado de esta consulta ya cubre no se cobra otra vez.
  select e.id, e.reserva_id into v_est from public.vet_estimados e
   where e.consulta_id = p_consulta and e.estado = 'aceptado' and e.reserva_id is not null and e.deleted_at is null
   order by e.aceptado_at desc limit 1;
  if v_est.id is not null then
    update public.vet_consulta_cargos x set estado = 'cubierto', cubierto_por = 'estimado', updated_at = now()
     where x.consulta_id = p_consulta and x.estado = 'propuesto' and not x.cobrar_aparte and x.deleted_at is null
       and exists (select 1 from public.vet_estimado_lineas l
                    where l.estimado_id = v_est.id and l.deleted_at is null
                      and l.tipo = case x.tipo when 'procedimiento' then 'procedimiento' when 'medicamento' then 'insumo' else 'servicio' end);
  end if;
end;
$$;
alter function public._vet_cargos_sincronizar(uuid) owner to peludesk_definer;
revoke execute on function public._vet_cargos_sincronizar(uuid) from public, anon, authenticated;

-- ── 6. Lectura para la pantalla ──────────────────────────────────────
create or replace function public.vet_consulta_cargos(p_consulta uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_lineas jsonb;
  v_total numeric;
  v_reserva uuid;
  v_pagada boolean := false;
begin
  if not (public.vet_puede('atender_consultas') or public.vet_puede('firmar_expediente')) then
    raise exception 'Ver los cargos de una consulta es de quien atiende consultas o de un médico veterinario.' using errcode = '42501';
  end if;
  select c.id, c.estado, c.perro_id into v_c from public.vet_consultas c
   where c.id = p_consulta and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_c.id is null then raise exception 'Esa consulta no existe.'; end if;
  if v_c.estado = 'borrador' and coalesce(public.negocio_escribible(), false) then
    perform public.vet_asegurar_servicios();
    perform public._vet_cargos_sincronizar(p_consulta);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'tipo', x.tipo, 'origen', x.origen, 'concepto', x.concepto, 'cantidad', x.cantidad,
           'precio_unitario', x.precio_unitario, 'precio_original', x.precio_original,
           'importe', case when x.precio_unitario is null then null else round(x.cantidad * x.precio_unitario, 2) end,
           'estado', x.estado, 'cubierto_por', x.cubierto_por, 'motivo_quitado', x.motivo_quitado,
           'ajustado', x.ajustado_at is not null, 'ajuste_motivo', x.ajuste_motivo, 'cargo_id', x.cargo_id
         ) order by x.created_at, x.id), '[]'::jsonb),
         coalesce(sum(case when x.estado in ('propuesto', 'cobrado') and x.precio_unitario is not null then round(x.cantidad * x.precio_unitario, 2) end), 0)
    into v_lineas, v_total
    from public.vet_consulta_cargos x where x.consulta_id = p_consulta and x.deleted_at is null;
  select c.reserva_id into v_reserva from public.vet_consulta_cargos x join public.cargos_aplicados c on c.id = x.cargo_id
   where x.consulta_id = p_consulta and x.deleted_at is null limit 1;
  if v_reserva is not null then
    v_pagada := exists (select 1 from public.cobros b where b.reserva_id = v_reserva and b.deleted_at is null);
  end if;
  return jsonb_build_object(
    'estado_consulta', v_c.estado,
    'lineas', v_lineas,
    'total', v_total,
    'sin_precio', (select count(*) from public.vet_consulta_cargos x where x.consulta_id = p_consulta and x.deleted_at is null and x.estado = 'propuesto' and x.precio_unitario is null),
    'reserva_id', v_reserva,
    'cuenta_con_cobros', v_pagada,
    'puede_ajustar', public.vet_puede('ajustar_cargos_consulta'),
    'catalogo', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'precio', public._vet_precio_servicio(s.clave)) order by s.orden, s.nombre)
        from public.servicios s where s.categoria = 'veterinaria' and s.deleted_at is null
         and s.clave not in ('vet_consulta_general', 'vet_consulta_urgencia', 'vet_revision_seguimiento', 'vet_aplicacion_vacuna')), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'precio', public._vet_precio_consumo(i.id), 'unidad', uc.etiqueta, 'controlado', coalesce(i.exige_folio_receta, false)) order by i.nombre)
        from (select * from public.insumos where deleted_at is null and se_vende and precio_venta is not null order by nombre limit 300) i
        join public.unidades_medida uc on uc.id = i.unidad_consumo_id), '[]'::jsonb)
  );
end;
$$;
alter function public.vet_consulta_cargos(uuid) owner to peludesk_definer;
revoke execute on function public.vet_consulta_cargos(uuid) from public, anon;
grant execute on function public.vet_consulta_cargos(uuid) to authenticated;

-- ── 7. Agregar, quitar, restaurar y ajustar ──────────────────────────
create or replace function public.vet_consulta_cargo_agregar(
  p_consulta uuid, p_tipo text, p_concepto text, p_cantidad numeric, p_precio numeric, p_servicio uuid default null, p_insumo uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_id uuid := gen_random_uuid();
  v_concepto text := btrim(coalesce(p_concepto, ''));
  v_precio numeric := p_precio;
  v_cant numeric := coalesce(p_cantidad, 1);
begin
  if not public.vet_puede('atender_consultas') then
    raise exception 'Agregar cargos a una consulta es de quien atiende consultas.' using errcode = '42501';
  end if;
  if p_tipo not in ('procedimiento', 'medicamento') then raise exception 'Solo se agregan procedimientos o medicamentos.'; end if;
  if v_cant <= 0 then raise exception 'La cantidad debe ser mayor a cero.'; end if;
  select c.id, c.estado into v_c from public.vet_consultas c where c.id = p_consulta and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_c.id is null then raise exception 'Esa consulta no existe.'; end if;
  if v_c.estado <> 'borrador' then raise exception 'Los cargos se arman antes de firmar. Esta consulta ya no es un borrador.'; end if;
  if p_tipo = 'medicamento' and p_insumo is not null then
    select i.nombre, public._vet_precio_consumo(i.id) into v_concepto, v_precio from public.insumos i where i.id = p_insumo and i.deleted_at is null;
    if v_concepto is null then raise exception 'Ese producto no existe en el inventario.'; end if;
    if v_precio is null then raise exception '«%» no tiene precio de venta. Captúralo en Inventario.', v_concepto; end if;
  elsif p_servicio is not null then
    select s.nombre, public._vet_precio_servicio(s.clave) into v_concepto, v_precio from public.servicios s
     where s.id = p_servicio and s.categoria = 'veterinaria' and s.deleted_at is null;
    if v_concepto is null then raise exception 'Ese servicio no existe en el catálogo veterinario.'; end if;
  end if;
  if v_concepto = '' then raise exception 'Escribe el concepto.'; end if;
  if v_precio is not null and v_precio < 0 then raise exception 'El precio no puede ser negativo.'; end if;
  insert into public.vet_consulta_cargos (id, consulta_id, tipo, origen, concepto, servicio_id, insumo_id, cantidad, precio_unitario, precio_original, updated_at)
  values (v_id, p_consulta, p_tipo,
          case when p_insumo is not null then 'inventario' when p_servicio is not null then 'catalogo' else 'manual' end,
          v_concepto, p_servicio, p_insumo, v_cant, v_precio, v_precio, now());
  return v_id;
end;
$$;
alter function public.vet_consulta_cargo_agregar(uuid, text, text, numeric, numeric, uuid, uuid) owner to peludesk_definer;
revoke execute on function public.vet_consulta_cargo_agregar(uuid, text, text, numeric, numeric, uuid, uuid) from public, anon;
grant execute on function public.vet_consulta_cargo_agregar(uuid, text, text, numeric, numeric, uuid, uuid) to authenticated;

-- Una línea de borrador: la de la consulta que el negocio negocio_actual() tiene.
create or replace function public._vet_cargo_borrador(p_id uuid)
returns public.vet_consulta_cargos
language plpgsql
set search_path = ''
as $$
declare
  v public.vet_consulta_cargos;
begin
  select x.* into v from public.vet_consulta_cargos x
   join public.vet_consultas c on c.id = x.consulta_id
   where x.id = p_id and x.negocio_id = public.negocio_actual() and x.deleted_at is null and c.estado = 'borrador' for update of x;
  if v.id is null then raise exception 'Esa línea no existe o su consulta ya está firmada.'; end if;
  return v;
end;
$$;
alter function public._vet_cargo_borrador(uuid) owner to peludesk_definer;
revoke execute on function public._vet_cargo_borrador(uuid) from public, anon, authenticated;

create or replace function public.vet_consulta_cargo_quitar(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vet_consulta_cargos;
begin
  v := public._vet_cargo_borrador(p_id);
  -- Quien agregó una línea a mano la puede quitar; el resto pide el permiso.
  if not (public.vet_puede('ajustar_cargos_consulta') or (v.origen = 'manual' and public.vet_puede('atender_consultas'))) then
    raise exception 'Quitar un cargo de la consulta es de un médico veterinario, de admin o de quien tenga «Quitar o ajustar cargos de la consulta».' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escribe por qué se quita el cargo.'; end if;
  update public.vet_consulta_cargos set estado = 'quitado', motivo_quitado = btrim(p_motivo), quitado_por = auth.uid(), quitado_at = now() where id = p_id;
end;
$$;
alter function public.vet_consulta_cargo_quitar(uuid, text) owner to peludesk_definer;
revoke execute on function public.vet_consulta_cargo_quitar(uuid, text) from public, anon;
grant execute on function public.vet_consulta_cargo_quitar(uuid, text) to authenticated;

create or replace function public.vet_consulta_cargo_restaurar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vet_consulta_cargos;
begin
  v := public._vet_cargo_borrador(p_id);
  if not public.vet_puede('ajustar_cargos_consulta') then
    raise exception 'Restaurar un cargo es de un médico veterinario, de admin o de quien tenga «Quitar o ajustar cargos de la consulta».' using errcode = '42501';
  end if;
  if v.estado = 'cubierto' and v.cubierto_por = 'teleconsulta' then
    raise exception 'Esa consulta ya se cobró por adelantado con la teleconsulta.';
  end if;
  if v.estado not in ('quitado', 'cubierto') then raise exception 'Esa línea ya está en el cobro.'; end if;
  update public.vet_consulta_cargos
     set estado = 'propuesto', motivo_quitado = null, quitado_por = null, quitado_at = null,
         cubierto_por = null, cobrar_aparte = (v.estado = 'cubierto')
   where id = p_id;
end;
$$;
alter function public.vet_consulta_cargo_restaurar(uuid) owner to peludesk_definer;
revoke execute on function public.vet_consulta_cargo_restaurar(uuid) from public, anon;
grant execute on function public.vet_consulta_cargo_restaurar(uuid) to authenticated;

create or replace function public.vet_consulta_cargo_ajustar(p_id uuid, p_cantidad numeric, p_precio numeric, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vet_consulta_cargos;
begin
  v := public._vet_cargo_borrador(p_id);
  if not public.vet_puede('ajustar_cargos_consulta') then
    raise exception 'Cambiar un cargo de la consulta es de un médico veterinario, de admin o de quien tenga «Quitar o ajustar cargos de la consulta».' using errcode = '42501';
  end if;
  if v.estado <> 'propuesto' then raise exception 'Solo se ajusta una línea que va al cobro.'; end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'La cantidad debe ser mayor a cero.'; end if;
  if p_precio is null or p_precio < 0 then raise exception 'Escribe el precio (cero si es cortesía).'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 and (p_precio is distinct from v.precio_unitario or p_cantidad is distinct from v.cantidad) and v.precio_original is not null then
    raise exception 'Escribe el motivo del ajuste.';
  end if;
  update public.vet_consulta_cargos
     set cantidad = p_cantidad, precio_unitario = p_precio, ajuste_motivo = nullif(btrim(coalesce(p_motivo, '')), ''),
         ajustado_por = auth.uid(), ajustado_at = now()
   where id = p_id;
end;
$$;
alter function public.vet_consulta_cargo_ajustar(uuid, numeric, numeric, text) owner to peludesk_definer;
revoke execute on function public.vet_consulta_cargo_ajustar(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.vet_consulta_cargo_ajustar(uuid, numeric, numeric, text) to authenticated;

-- ── 8. Pasar la consulta a la cuenta ─────────────────────────────────
create or replace function public._vet_consulta_cobrar(p_consulta uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_c record;
  v_perro record;
  v_reserva uuid;
  v_est uuid;
  v_x record;
  v_cargo uuid;
  v_importe numeric;
  v_n int := 0;
  v_total numeric := 0;
  v_avisos text[] := array[]::text[];
  v_eq numeric;
  v_mov uuid;
begin
  select c.id, c.perro_id, c.cliente_id, c.estado into v_c from public.vet_consultas c
   where c.id = p_consulta and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  select p.nombre into v_perro from public.perros p where p.id = v_c.perro_id;

  -- Solo lo que tiene precio y todavía no está en una cuenta.
  if not exists (select 1 from public.vet_consulta_cargos x where x.consulta_id = p_consulta and x.estado = 'propuesto' and x.deleted_at is null and x.precio_unitario is not null) then
    return jsonb_build_object('reserva_id', null, 'cargos', 0, 'total', 0, 'avisos', v_avisos);
  end if;

  -- La cuenta: la del estimado aceptado, la de la hospitalización, o una nueva.
  select e.reserva_id into v_est from public.vet_estimados e
   where e.consulta_id = p_consulta and e.estado = 'aceptado' and e.reserva_id is not null and e.deleted_at is null order by e.aceptado_at desc limit 1;
  v_reserva := v_est;
  if v_reserva is null then
    select h.reserva_id into v_reserva from public.hospitalizaciones h
     where h.perro_id = v_c.perro_id and h.estado = 'ingresado' and h.deleted_at is null and h.negocio_id = public.negocio_actual() limit 1;
  end if;
  if v_reserva is not null and exists (select 1 from public.cuentas_canceladas cc where cc.reserva_id = v_reserva) then
    v_reserva := null;
  end if;
  if v_reserva is null then
    insert into public.reservas (cliente_id, notas) values (v_c.cliente_id, 'Consulta veterinaria — ' || v_perro.nombre) returning id into v_reserva;
  end if;

  for v_x in select * from public.vet_consulta_cargos x
              where x.consulta_id = p_consulta and x.estado = 'propuesto' and x.deleted_at is null and x.precio_unitario is not null order by x.created_at, x.id
  loop
    v_importe := round(v_x.cantidad * v_x.precio_unitario, 2);
    if v_importe > 0 then
      insert into public.cargos_aplicados (reserva_id, perro_id, servicio_id, cantidad, precio, descripcion)
      values (v_reserva, v_c.perro_id, public.vet_servicio_cargo_consulta(v_x.tipo), 1, v_importe,
              case when v_x.cantidad = 1 then v_x.concepto
                   else trim(trailing '.' from trim(trailing '0' from v_x.cantidad::text)) || ' × ' || v_x.concepto end)
      returning id into v_cargo;
      update public.vet_consulta_cargos set estado = 'cobrado', cargo_id = v_cargo where id = v_x.id;
      v_n := v_n + 1;
      v_total := v_total + v_importe;
      -- Un medicamento agregado a mano descuenta del inventario (el que ya salió con la consulta no).
      if v_x.tipo = 'medicamento' and v_x.insumo_id is not null and v_x.evento_surtido is null then
        select ucons.equivalencia_en_base into v_eq from public.insumos i join public.unidades_medida ucons on ucons.id = i.unidad_consumo_id where i.id = v_x.insumo_id;
        if v_x.cantidad * v_eq > public.existencia_actual_insumo(v_x.insumo_id) then
          v_avisos := v_avisos || ('No hay existencia registrada de «' || v_x.concepto || '»: descuéntala del inventario cuando la registres.');
        else
          begin
            insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, motivo)
            values (v_x.insumo_id, 'salida_consumo', v_x.cantidad * v_eq, 'Consulta veterinaria — ' || v_perro.nombre)
            returning id into v_mov;
          exception when others then
            v_avisos := v_avisos || ('«' || v_x.concepto || '» no descontó inventario: ' || sqlerrm);
          end;
        end if;
      end if;
    else
      -- Una cortesía ($0): queda registrada, sin línea en la cuenta.
      update public.vet_consulta_cargos set estado = 'quitado', motivo_quitado = 'Cortesía (sin cobro)', quitado_at = now() where id = v_x.id;
    end if;
  end loop;
  return jsonb_build_object('reserva_id', v_reserva, 'cargos', v_n, 'total', v_total, 'avisos', to_jsonb(v_avisos));
end;
$$;
alter function public._vet_consulta_cobrar(uuid) owner to peludesk_definer;
revoke execute on function public._vet_consulta_cobrar(uuid) from public, anon, authenticated;

-- Una consulta firmada con líneas sin precio: cuando el precio ya se capturó, pasa a Caja lo que falta.
create or replace function public.vet_consulta_cobrar_pendientes(p_consulta uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_fee numeric;
  v_prod numeric;
begin
  if not (public.vet_puede('atender_consultas') or public.vet_puede('firmar_expediente') or coalesce(public.current_rol() in ('admin', 'recepcion'), false)) then
    raise exception 'Pasar los cargos a Caja es de quien atiende consultas, de recepción o de admin.' using errcode = '42501';
  end if;
  select c.id, c.estado, c.tipo_clave into v_c from public.vet_consultas c where c.id = p_consulta and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_c.id is null then raise exception 'Esa consulta no existe.'; end if;
  if v_c.estado <> 'firmada' then raise exception 'Solo una consulta firmada pasa sus cargos a Caja.'; end if;
  -- Vuelve a leer los precios del catálogo y del inventario de las líneas que no tenían.
  update public.vet_consulta_cargos x set
      precio_unitario = n.precio, precio_original = n.precio, updated_at = now()
    from (
      select y.id, case y.tipo
               when 'consulta' then public._vet_precio_servicio(s.clave)
               when 'vacuna' then case when public._vet_precio_servicio('vet_aplicacion_vacuna') is null and public._vet_precio_consumo(y.insumo_id) is null then null
                                       else coalesce(public._vet_precio_servicio('vet_aplicacion_vacuna'), 0) + coalesce(public._vet_precio_consumo(y.insumo_id), 0) end
               when 'medicamento' then public._vet_precio_consumo(y.insumo_id)
               else public._vet_precio_servicio(s.clave) end as precio
        from public.vet_consulta_cargos y left join public.servicios s on s.id = y.servicio_id
       where y.consulta_id = p_consulta and y.estado = 'propuesto' and y.precio_unitario is null and y.deleted_at is null) n
   where x.id = n.id and n.precio is not null;
  return public._vet_consulta_cobrar(p_consulta);
end;
$$;
alter function public.vet_consulta_cobrar_pendientes(uuid) owner to peludesk_definer;
revoke execute on function public.vet_consulta_cobrar_pendientes(uuid) from public, anon;
grant execute on function public.vet_consulta_cobrar_pendientes(uuid) to authenticated;

-- ── 9. Firmar cobra; anular deshace lo que aún no se cobró ───────────
create or replace function public.vet_consulta_firmar(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_m record;
  v_nombre text;
  v_hash text;
  v_hay_dx boolean;
  v_cobro jsonb;
begin
  if not public.vet_puede('firmar_expediente') then
    raise exception 'Firmar el expediente es de un médico veterinario designado.' using errcode = '42501';
  end if;
  select m.id, m.cedula_profesional, m.cpa_sitpv, m.profile_id into v_m from public.medicos_veterinarios m
   where m.profile_id = auth.uid() and m.negocio_id = public.negocio_actual() and m.deleted_at is null;
  if v_m.id is null then
    raise exception 'Solo un médico veterinario designado firma el expediente (con su cédula).' using errcode = '42501';
  end if;
  select c.* into v_c from public.vet_consultas c where c.id = p_id and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_c.id is null then
    raise exception 'Esa consulta no existe.';
  end if;
  if v_c.estado <> 'borrador' then
    raise exception 'Esa consulta ya está firmada.';
  end if;
  if v_c.medico_id <> v_m.id then
    raise exception 'Esta consulta está a cargo de otro médico: solo él la firma. Si cambió el médico, reasígnala antes.' using errcode = '42501';
  end if;
  if btrim(coalesce(v_c.motivo, '')) = '' then
    raise exception 'Escribe el motivo de la consulta antes de firmar.';
  end if;
  v_hay_dx := jsonb_array_length(v_c.diagnosticos) > 0;
  if not v_hay_dx and v_c.tipo_clave in ('consulta', 'cirugia', 'urgencia') then
    raise exception 'Agrega al menos un diagnóstico (presuntivo o definitivo) antes de firmar.';
  end if;
  select coalesce(p.nombre_completo, 'Médico veterinario') into v_nombre from public.profiles p where p.id = v_m.profile_id;
  v_hash := encode(sha256(convert_to(jsonb_build_object(
      'id', v_c.id, 'perro', v_c.perro_id, 'tipo', v_c.tipo_clave, 'atendida_at', v_c.atendida_at, 'motivo', v_c.motivo, 'anamnesis', v_c.anamnesis,
      'examen_fisico', v_c.examen_fisico, 'hallazgos', v_c.hallazgos, 'peso_kg', v_c.peso_kg, 'temperatura_c', v_c.temperatura_c,
      'fc', v_c.frecuencia_cardiaca, 'fr', v_c.frecuencia_respiratoria, 'cc', v_c.condicion_corporal, 'mucosas', v_c.mucosas, 'tllc', v_c.tllc_seg,
      'hidratacion', v_c.hidratacion, 'diagnosticos', v_c.diagnosticos, 'plan', v_c.plan, 'tratamiento', v_c.tratamiento,
      'notas_internas', v_c.notas_internas, 'medico', v_m.id, 'cedula', v_m.cedula_profesional)::text, 'UTF8')), 'hex');
  -- Los cargos pasan a la cuenta ANTES de cerrar el borrador (la propuesta se arma sobre un borrador).
  -- Un problema de cobro (cuenta cancelada, precio faltante) nunca impide firmar el expediente:
  -- la consulta se firma y los cargos quedan pendientes para pasarlos a Caja.
  begin
    perform public._vet_cargos_sincronizar(p_id);
    v_cobro := public._vet_consulta_cobrar(p_id);
  exception when others then
    v_cobro := jsonb_build_object('reserva_id', null, 'cargos', 0, 'total', 0, 'error', sqlerrm);
  end;
  update public.vet_consultas set
    estado = 'firmada', firmada_at = now(), firmada_por = auth.uid(), firma_medico_id = v_m.id, firma_nombre = v_nombre,
    firma_cedula = v_m.cedula_profesional, firma_cpa = v_m.cpa_sitpv, firma_hash = v_hash
  where id = p_id;
  if v_c.peso_kg is not null and not exists (
    select 1 from public.pesos_registrados w
    where w.perro_id = v_c.perro_id and w.fecha = public.fecha_negocio() and w.peso_kg = v_c.peso_kg and w.deleted_at is null
  ) then
    insert into public.pesos_registrados (perro_id, peso_kg, fecha, notas)
    values (v_c.perro_id, v_c.peso_kg, public.fecha_negocio(), 'Consulta veterinaria');
  end if;
  if v_c.cita_id is not null then
    update public.vet_citas set estado = 'finalizada' where id = v_c.cita_id and estado in ('en_curso', 'confirmada', 'programada');
  end if;
  return jsonb_build_object('id', p_id, 'firma_hash', v_hash, 'medico', v_nombre, 'cedula', v_m.cedula_profesional, 'cobro', v_cobro);
end;
$$;

create or replace function public.vet_consulta_anular(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_x record;
begin
  if not public.vet_puede('firmar_expediente') then
    raise exception 'Anular una consulta es de un médico veterinario designado o de admin.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo de la anulación.';
  end if;
  select c.id, c.estado, c.firma_medico_id, c.cita_id into v_c from public.vet_consultas c where c.id = p_id and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_c.id is null then
    raise exception 'Esa consulta no existe.';
  end if;
  if v_c.estado <> 'firmada' then
    raise exception 'Solo se anula una consulta firmada (un borrador se descarta).';
  end if;
  if not coalesce(public.is_admin(), false) and v_c.firma_medico_id is distinct from public.vet_mi_medico() then
    raise exception 'Solo el médico que firmó (o admin) anula la consulta.' using errcode = '42501';
  end if;
  update public.vet_consultas set estado = 'anulada', anulada_at = now(), anulada_por = auth.uid(), anulada_motivo = btrim(p_motivo) where id = p_id;
  -- Lo que se cargó a una cuenta que todavía no tiene cobros se cancela; si ya hay cobros, se queda
  -- (se devuelve en Caja con la devolución de siempre) y la pantalla lo avisa.
  for v_x in select x.id, x.cargo_id, c.reserva_id from public.vet_consulta_cargos x join public.cargos_aplicados c on c.id = x.cargo_id
              where x.consulta_id = p_id and x.estado = 'cobrado' and x.deleted_at is null
  loop
    if not exists (select 1 from public.cobros b where b.reserva_id = v_x.reserva_id and b.deleted_at is null) then
      update public.cargos_aplicados set cancelado = true, motivo_cancelacion = 'Consulta veterinaria anulada: ' || btrim(p_motivo) where id = v_x.cargo_id;
      update public.vet_consulta_cargos set estado = 'quitado', motivo_quitado = 'Consulta anulada', quitado_por = auth.uid(), quitado_at = now() where id = v_x.id;
    end if;
  end loop;
end;
$$;

drop function public._vet_redes(text, text);
