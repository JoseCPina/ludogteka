-- Caja: corregir y anular cobros SIN descuentos, y agregar efectivo al turno.
--
-- ANTES: un cobro mal capturado o un monto equivocado se arreglaba con un
-- descuento (ensucia el reporte de descuentos y el ingreso) o, en terminal y
-- tarjeta manual, con «no recibido» (una devolución). No había anulación.
--
-- AHORA (mismo patrón que «Corregir servicio de citas» y «Ajustar días de pases»:
-- una función con permiso, motivo obligatorio e historial inmutable):
--
--   * Un cobro NUNCA se borra ni se reescribe. Anular o corregir su monto agrega
--     renglones COMPENSATORIOS a cobro_metodos (monto/propina negativos, ligados a
--     su fila de cobro_correcciones). Así la suma de siempre (la cuenta, el corte,
--     los reportes, la propina de la nómina) ya da el valor corregido sin tocar la
--     lógica de nadie, y el valor anterior queda en el historial.
--   * Con el turno del cobro ABIERTO, el renglón compensatorio cae en ese turno
--     (el cobro «sale» de los totales). Con el turno CERRADO, el corte ya cerrado
--     no cambia: el renglón cae en el turno abierto y en la fecha de hoy
--     (turno_efecto_id / fecha_efecto) y se ve como un ajuste. Solo con el permiso
--     «Corregir cobros de turnos cerrados».
--   * Solo cobros de efectivo, transferencia y tarjeta manual hechos a mano. Los de
--     la terminal o el link (Mercado Pago, Clip) se devuelven por el flujo de
--     devoluciones, que habla con el proveedor.
--   * Corregir el PRECIO de una cuenta (cuenta_ajustes_precio): un renglón firmado
--     en la cuenta, no un descuento. El reporte de descuentos queda limpio.
--   * Agregar efectivo al turno (movimientos_caja.tipo = 'ingreso'): entra al
--     esperado de efectivo del corte; NO es venta ni ingreso en reportes.
--
-- Permisos nuevos (admin siempre; recepción apagados): anular_cobros,
-- editar_monto_cobros, corregir_turnos_cerrados, agregar_efectivo.
--
-- REVERSA: las columnas y tablas nuevas están vacías hasta que alguien las use;
-- se pueden dejar. Para volver al comportamiento anterior, volver a poner las
-- definiciones de cerrar_turno, resumen_turno, movimientos_turno,
-- reporte_financiero_periodo, reporte_ventas_mostrador_periodo, cobro_grupo_detalle,
-- cuenta_lineas_reserva, cuentas_abiertas, cancelar_retiro y demo_vaciar de
-- 20261010000400 / 20261012000000 (las de la versión anterior de esta rama).
-- Sin datos que respaldar: la migración no cambia ninguna fila existente.

-- ── 0. Permisos ───────────────────────────────────────────────────────

alter table public.permisos_staff drop constraint permisos_staff_permiso_check;
alter table public.permisos_staff add constraint permisos_staff_permiso_check check (permiso in (
  'inventario_costos', 'tarifas', 'reportes_financieros', 'personal',
  'configuracion_negocio', 'excepciones_reserva', 'descuentos_sin_tope',
  'plantillas_contrato', 'nomina', 'gastos', 'reportes_guarderia', 'corregir_estilista',
  'corregir_servicio', 'tarjeta_manual', 'ajustar_pases',
  'anular_cobros', 'editar_monto_cobros', 'corregir_turnos_cerrados', 'agregar_efectivo'
));

create or replace function public.mis_permisos()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select unnest(array[
    'inventario_costos', 'tarifas', 'reportes_financieros', 'personal',
    'configuracion_negocio', 'excepciones_reserva', 'descuentos_sin_tope',
    'plantillas_contrato', 'nomina', 'gastos', 'reportes_guarderia', 'corregir_estilista',
    'corregir_servicio', 'tarjeta_manual', 'ajustar_pases',
    'anular_cobros', 'editar_monto_cobros', 'corregir_turnos_cerrados', 'agregar_efectivo'
  ]) as permiso
  where coalesce(public.is_admin(), false)
  union
  select ps.permiso
  from public.permisos_staff ps
  where ps.profile_id = auth.uid()
    and ps.negocio_id = public.negocio_actual()
    and ps.revocado_at is null
    and ps.deleted_at is null
    and public.current_rol() = 'recepcion';
$$;

-- tiene_permiso no cambia: los permisos nuevos son de caja y siempre aplican
-- (el else true), igual que «tarjeta_manual».

-- ── 1. Esquema ────────────────────────────────────────────────────────

alter table public.cobro_correcciones drop constraint cobro_correcciones_tipo_check;
alter table public.cobro_correcciones add constraint cobro_correcciones_tipo_check
  check (tipo in ('no_recibido', 'tarjeta_manual_no_recibida', 'anulacion', 'edicion_monto'));

alter table public.cobros
  add column anulado_at timestamptz,
  add column anulado_por uuid references auth.users(id) on delete set null,
  add column anulacion_motivo text;
alter table public.cobros add constraint cobros_anulacion_coherente
  check ((anulado_at is null and anulacion_motivo is null)
      or (anulado_at is not null and char_length(btrim(coalesce(anulacion_motivo, ''))) >= 5));
create index cobros_anulados_idx on public.cobros (negocio_id, anulado_at) where anulado_at is not null;

-- Renglones compensatorios: monto/propina firmados, ligados a su corrección.
alter table public.cobro_metodos
  add column ajuste_id uuid references public.cobro_correcciones(id),
  add column turno_efecto_id uuid references public.turnos_caja(id),
  add column fecha_efecto timestamptz;
alter table public.cobro_metodos drop constraint cobro_metodos_monto_check;
alter table public.cobro_metodos drop constraint cobro_metodos_propina_check;
alter table public.cobro_metodos add constraint cobro_metodos_monto_check
  check ((ajuste_id is null and monto > 0) or (ajuste_id is not null and (monto <> 0 or propina <> 0)));
alter table public.cobro_metodos add constraint cobro_metodos_propina_check
  check (ajuste_id is not null or propina >= 0);
create index cobro_metodos_ajuste_idx on public.cobro_metodos (ajuste_id) where ajuste_id is not null;
create index cobro_metodos_turno_efecto_idx on public.cobro_metodos (turno_efecto_id) where turno_efecto_id is not null;

alter table public.tarjetas_manuales drop constraint tarjetas_manuales_estado_check;
alter table public.tarjetas_manuales add constraint tarjetas_manuales_estado_check
  check (estado in ('por_revisar', 'revisada', 'no_recibida', 'anulada'));
alter table public.tarjetas_manuales_eventos drop constraint tarjetas_manuales_eventos_tipo_check;
alter table public.tarjetas_manuales_eventos add constraint tarjetas_manuales_eventos_tipo_check
  check (tipo in ('registrada', 'sobre_tope', 'revisada', 'no_recibida', 'tope_cambiado', 'anulada', 'monto_corregido'));

alter table public.cobros_grupo drop constraint cobros_grupo_monto_total_check;
alter table public.cobros_grupo add constraint cobros_grupo_monto_total_check check (monto_total >= 0);
alter table public.cobros_grupo_eventos drop constraint cobros_grupo_eventos_tipo_check;
alter table public.cobros_grupo_eventos add constraint cobros_grupo_eventos_tipo_check
  check (tipo in ('registrado', 'no_recibido', 'anulado', 'editado'));

-- Efectivo agregado al turno (no es venta): mismo libro que los retiros.
alter table public.movimientos_caja
  add column tipo text not null default 'retiro' check (tipo in ('retiro', 'ingreso')),
  add column origen_ingreso text check (origen_ingreso is null or origen_ingreso in ('cambio', 'prestamo_caja', 'aportacion_dueno', 'otro')),
  add column nota text;
alter table public.movimientos_caja add constraint movimientos_caja_ingreso_coherente
  check ((tipo = 'ingreso') = (origen_ingreso is not null));

-- Corrección del precio de una cuenta (no es un descuento).
create table public.cuenta_ajustes_precio (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  reserva_id uuid not null references public.reservas(id),
  linea_tipo text not null check (linea_tipo in ('estancia', 'cargo', 'estetica', 'venta', 'bono')),
  linea_id uuid not null,
  concepto text not null check (btrim(concepto) <> ''),
  monto numeric(12, 2) not null check (monto <> 0),
  precio_antes numeric(12, 2) not null,
  precio_despues numeric(12, 2) not null check (precio_despues > 0),
  motivo text not null check (char_length(btrim(motivo)) >= 5),
  turno_id uuid references public.turnos_caja(id),
  hecha_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index cuenta_ajustes_precio_negocio_idx on public.cuenta_ajustes_precio (negocio_id);
create index cuenta_ajustes_precio_reserva_idx on public.cuenta_ajustes_precio (reserva_id) where deleted_at is null;
create trigger set_updated_at before insert or update on public.cuenta_ajustes_precio
  for each row execute function public.set_updated_at();
alter table public.cuenta_ajustes_precio enable row level security;
-- Solo admin y recepción lo leen (es dinero: estética y el cliente no).
create policy cuenta_ajustes_precio_select on public.cuenta_ajustes_precio
  for select to authenticated using ((select coalesce(public.current_rol() in ('admin', 'recepcion'), false)));
create policy cuenta_ajustes_precio_negocio on public.cuenta_ajustes_precio
  as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy cuenta_ajustes_precio_negocio_definer on public.cuenta_ajustes_precio
  for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
create policy cuenta_ajustes_precio_escritura_ins on public.cuenta_ajustes_precio
  as restrictive for insert to authenticated, peludesk_definer with check ((select public.exigir_negocio_escribible()));
create policy cuenta_ajustes_precio_escritura_upd on public.cuenta_ajustes_precio
  as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy cuenta_ajustes_precio_escritura_del on public.cuenta_ajustes_precio
  as restrictive for delete to authenticated, peludesk_definer using ((select public.exigir_negocio_escribible()));
grant select on public.cuenta_ajustes_precio to authenticated;
grant select, insert, update, delete on public.cuenta_ajustes_precio to peludesk_definer;

-- ── 2. Lo que comparten anular y corregir el monto ────────────────────

-- Valida y bloquea el cobro. Interna: la llaman anular_cobro y
-- editar_monto_cobro, nadie más (ni authenticated ni anon).
create or replace function public.cobro_correccion_validar(p_cobro_id uuid, p_permiso text, p_acepta_devoluciones boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cobros%rowtype;
  v_turno_estado text;
  v_abierto uuid;
  v_cerrado boolean;
  v_etiqueta text := case p_permiso when 'anular_cobros' then 'Anular cobros' else 'Editar monto de cobros' end;
begin
  if not coalesce(public.tiene_permiso(p_permiso), false) then
    raise exception 'No tienes el permiso «%». Pídeselo a un admin (Administración → Permisos).', v_etiqueta using errcode = '42501';
  end if;
  select * into c from public.cobros
  where id = p_cobro_id and negocio_id = public.negocio_actual() and deleted_at is null for update;
  if not found then
    raise exception 'Cobro no encontrado.';
  end if;
  if c.anulado_at is not null then
    raise exception 'Este cobro ya está anulado.';
  end if;
  if coalesce(c.origen, 'manual') = 'mercadopago_point' or coalesce(c.origen, 'manual') = 'mercadopago_link' then
    raise exception 'Este cobro entró por Mercado Pago: no se anula ni se edita aquí. Devuélvelo con «Devolver con Mercado Pago» (hace el reembolso y lo registra en caja).';
  end if;
  if coalesce(c.origen, 'manual') = 'clip_terminal' then
    raise exception 'Este cobro entró por la terminal de Clip: no se anula ni se edita aquí. Hazle la devolución en Clip y regístrala en la cuenta.';
  end if;
  if exists (select 1 from public.cobro_metodos cm where cm.cobro_id = c.id and cm.metodo = 'terminal') then
    raise exception 'Este cobro trae un renglón «Terminal» capturado a mano: no se anula ni se edita. Si la tarjeta no llegó, un admin lo marca como «no recibido»; si sí llegó, se devuelve.';
  end if;
  if not p_acepta_devoluciones and (
    exists (select 1 from public.devoluciones d where d.cobro_id = c.id and d.deleted_at is null)
    or exists (select 1 from public.reembolsos_cobro rc where rc.cobro_id = c.id and rc.deleted_at is null and rc.estado in ('solicitado', 'hecho'))
  ) then
    raise exception 'Este cobro ya tiene devoluciones: no se puede anular. Si hace falta, corrige su monto o deja la devolución como está.';
  end if;

  select t.estado into v_turno_estado from public.turnos_caja t where t.id = c.turno_id;
  select t.id into v_abierto from public.turnos_caja t where t.estado = 'abierto' limit 1;
  v_cerrado := coalesce(v_turno_estado, 'cerrado') <> 'abierto';
  if v_abierto is null then
    raise exception 'No hay turno de caja abierto. Ábrelo: la corrección se anota en el turno abierto (un turno cerrado nunca cambia).';
  end if;
  if v_cerrado and not coalesce(public.tiene_permiso('corregir_turnos_cerrados'), false) then
    raise exception 'Este cobro es de un turno que ya se cerró. Corregirlo requiere el permiso «Corregir cobros de turnos cerrados» (Administración → Permisos); queda como ajuste en el turno abierto.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'reserva_id', c.reserva_id, 'turno_id', c.turno_id, 'turno_abierto', v_abierto, 'turno_cerrado', v_cerrado,
    'grupo_id', c.grupo_id, 'origen', coalesce(c.origen, 'manual'), 'creado_at', c.created_at, 'creado_por', c.created_by, 'notas', c.notas);
end;
$$;
alter function public.cobro_correccion_validar(uuid, text, boolean) owner to peludesk_definer;
revoke execute on function public.cobro_correccion_validar(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.cobro_correccion_validar(uuid, text, boolean) to service_role;

-- Recalcula el total de un cobro junto con lo que quedó (y deja su evento).
create or replace function public.cobro_grupo_recalcular(p_grupo_id uuid, p_tipo text, p_detalle jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_grupo_id is null then
    return;
  end if;
  update public.cobros_grupo g
  set monto_total = greatest(coalesce((select sum(cm.monto) from public.cobro_metodos cm join public.cobros c on c.id = cm.cobro_id where c.grupo_id = g.id), 0), 0),
      propina_total = greatest(coalesce((select sum(cm.propina) from public.cobro_metodos cm join public.cobros c on c.id = cm.cobro_id where c.grupo_id = g.id), 0), 0)
  where g.id = p_grupo_id and g.negocio_id = public.negocio_actual();
  insert into public.cobros_grupo_eventos (negocio_id, grupo_id, tipo, actor, detalle)
  values (public.negocio_actual(), p_grupo_id, p_tipo, auth.uid(), p_detalle);
end;
$$;
alter function public.cobro_grupo_recalcular(uuid, text, jsonb) owner to peludesk_definer;
revoke execute on function public.cobro_grupo_recalcular(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.cobro_grupo_recalcular(uuid, text, jsonb) to service_role;

-- ── 3. Anular un cobro ────────────────────────────────────────────────

create or replace function public.anular_cobro(p_cobro_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ctx jsonb;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_corr uuid;
  v_cerrado boolean;
  v_turno_efecto uuid;
  v_fecha timestamptz;
  v_linea record;
  v_antes jsonb;
  v_monto_total numeric := 0;
  v_propina_total numeric := 0;
  v_t record;
  v_parte numeric;
  v_parte_propina numeric;
  v_quedan int;
begin
  if char_length(v_motivo) < 5 then
    raise exception 'Escribe el motivo de la anulación (qué pasó).';
  end if;
  v_ctx := public.cobro_correccion_validar(p_cobro_id, 'anular_cobros', false);
  v_cerrado := (v_ctx ->> 'turno_cerrado')::boolean;
  v_turno_efecto := case when v_cerrado then (v_ctx ->> 'turno_abierto')::uuid else (v_ctx ->> 'turno_id')::uuid end;
  v_fecha := case when v_cerrado then now() else (v_ctx ->> 'creado_at')::timestamptz end;

  select coalesce(jsonb_agg(jsonb_build_object('metodo', x.metodo, 'monto', x.monto, 'propina', x.propina) order by x.metodo), '[]'::jsonb),
         coalesce(sum(x.monto), 0), coalesce(sum(x.propina), 0)
  into v_antes, v_monto_total, v_propina_total
  from (
    select cm.metodo, sum(cm.monto) as monto, sum(cm.propina) as propina
    from public.cobro_metodos cm where cm.cobro_id = p_cobro_id group by cm.metodo
  ) x;
  if v_monto_total <= 0 and v_propina_total <= 0 then
    raise exception 'Este cobro ya está en cero: no hay nada que anular.';
  end if;

  insert into public.cobro_correcciones (cobro_id, tipo, motivo, estado_anterior, evidencia, turno_cobro_id, turno_efecto_id, hecha_por, created_by)
  values (p_cobro_id, 'anulacion', v_motivo,
    jsonb_build_object('reserva_id', v_ctx -> 'reserva_id', 'turno_id', v_ctx -> 'turno_id', 'origen', v_ctx -> 'origen', 'notas', v_ctx -> 'notas',
      'cobrado_at', v_ctx -> 'creado_at', 'cobrado_por', v_ctx -> 'creado_por', 'grupo_id', v_ctx -> 'grupo_id', 'metodos', v_antes),
    jsonb_build_object('turno_del_cobro_cerrado', v_cerrado, 'monto', v_monto_total, 'propina', v_propina_total),
    (v_ctx ->> 'turno_id')::uuid, v_turno_efecto, auth.uid(), auth.uid())
  returning id into v_corr;

  for v_linea in
    select cm.metodo, sum(cm.monto) as monto, sum(cm.propina) as propina
    from public.cobro_metodos cm where cm.cobro_id = p_cobro_id group by cm.metodo
    having sum(cm.monto) <> 0 or sum(cm.propina) <> 0
  loop
    insert into public.cobro_metodos (cobro_id, metodo, monto, propina, ajuste_id, turno_efecto_id, fecha_efecto, created_by)
    values (p_cobro_id, v_linea.metodo, -v_linea.monto, -v_linea.propina, v_corr, v_turno_efecto, v_fecha, auth.uid());
  end loop;

  update public.cobros
  set anulado_at = now(), anulado_por = auth.uid(), anulacion_motivo = v_motivo
  where id = p_cobro_id;

  -- Tarjeta manual: el registro (folio) deja de estar «por revisar». En un cobro
  -- junto el folio es de todas las cuentas: solo se quita la parte de esta; si no
  -- quedan partes, el registro queda anulado.
  for v_t in
    select * from public.tarjetas_manuales t
    where t.negocio_id = public.negocio_actual() and t.deleted_at is null and t.estado <> 'anulada'
      and (t.cobro_id = p_cobro_id or (t.grupo_id is not null and t.partes @> jsonb_build_array(jsonb_build_object('cobro_id', p_cobro_id))))
    for update
  loop
    if v_t.grupo_id is null then
      update public.tarjetas_manuales
      set estado = 'anulada', revisada_por = auth.uid(), revisada_at = now(), nota_revision = 'Cobro anulado: ' || v_motivo, correccion_id = v_corr
      where id = v_t.id;
    else
      select coalesce((p ->> 'monto')::numeric, 0), coalesce((p ->> 'propina')::numeric, 0) into v_parte, v_parte_propina
      from jsonb_array_elements(v_t.partes) p where (p ->> 'cobro_id')::uuid = p_cobro_id limit 1;
      select count(*) into v_quedan from jsonb_array_elements(v_t.partes) p where (p ->> 'cobro_id')::uuid <> p_cobro_id;
      if v_quedan = 0 then
        update public.tarjetas_manuales
        set estado = 'anulada', revisada_por = auth.uid(), revisada_at = now(), nota_revision = 'Cobro anulado: ' || v_motivo, correccion_id = v_corr
        where id = v_t.id;
      else
        update public.tarjetas_manuales
        set partes = (select jsonb_agg(p) from jsonb_array_elements(v_t.partes) p where (p ->> 'cobro_id')::uuid <> p_cobro_id),
            monto = greatest(v_t.monto - coalesce(v_parte, 0), 0.01),
            propina = greatest(v_t.propina - coalesce(v_parte_propina, 0), 0)
        where id = v_t.id;
      end if;
    end if;
    insert into public.tarjetas_manuales_eventos (negocio_id, tarjeta_id, tipo, actor, detalle)
    values (public.negocio_actual(), v_t.id, 'anulada', auth.uid(),
      jsonb_build_object('motivo', v_motivo, 'cobro_id', p_cobro_id, 'monto_de_la_parte', v_parte, 'grupo_id', v_t.grupo_id, 'correccion_id', v_corr));
  end loop;

  perform public.cobro_grupo_recalcular((v_ctx ->> 'grupo_id')::uuid, 'anulado',
    jsonb_build_object('motivo', v_motivo, 'cobro_id', p_cobro_id, 'monto', v_monto_total, 'correccion_id', v_corr, 'turno_efecto_id', v_turno_efecto));

  return jsonb_build_object('correccion_id', v_corr, 'cobro_id', p_cobro_id, 'reserva_id', v_ctx -> 'reserva_id',
    'monto', v_monto_total, 'propina', v_propina_total, 'turno_cobro_id', v_ctx -> 'turno_id', 'turno_efecto_id', v_turno_efecto,
    'turno_del_cobro_cerrado', v_cerrado, 'grupo_id', v_ctx -> 'grupo_id');
end;
$$;
alter function public.anular_cobro(uuid, text) owner to peludesk_definer;
revoke execute on function public.anular_cobro(uuid, text) from public, anon;
grant execute on function public.anular_cobro(uuid, text) to authenticated, service_role;

-- Anula un cobro junto completo: todas sus cuentas, o ninguna.
create or replace function public.anular_cobro_grupo(p_grupo_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_res jsonb := '[]'::jsonb;
  v_n int := 0;
begin
  if not coalesce(public.tiene_permiso('anular_cobros'), false) then
    raise exception 'No tienes el permiso «Anular cobros». Pídeselo a un admin (Administración → Permisos).' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cobros_grupo g where g.id = p_grupo_id and g.negocio_id = public.negocio_actual() and g.deleted_at is null) then
    raise exception 'Cobro junto no encontrado.';
  end if;
  for v_c in
    select c.id from public.cobros c
    where c.grupo_id = p_grupo_id and c.negocio_id = public.negocio_actual() and c.deleted_at is null and c.anulado_at is null
    order by c.grupo_orden, c.created_at, c.id
  loop
    v_res := v_res || jsonb_build_array(public.anular_cobro(v_c.id, p_motivo));
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    raise exception 'Este cobro junto ya está anulado.';
  end if;
  return jsonb_build_object('grupo_id', p_grupo_id, 'cobros', v_res);
end;
$$;
alter function public.anular_cobro_grupo(uuid, text) owner to peludesk_definer;
revoke execute on function public.anular_cobro_grupo(uuid, text) from public, anon;
grant execute on function public.anular_cobro_grupo(uuid, text) to authenticated, service_role;

-- ── 4. Corregir el monto cobrado de UN método de un cobro ─────────────

create or replace function public.editar_monto_cobro(p_cobro_id uuid, p_metodo text, p_monto_nuevo numeric, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ctx jsonb;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_corr uuid;
  v_cerrado boolean;
  v_turno_efecto uuid;
  v_fecha timestamptz;
  v_actual numeric;
  v_delta numeric;
  v_devuelto_metodo numeric;
  v_devuelto_total numeric;
  v_total_nuevo numeric;
  v_saldo numeric;
  v_t record;
begin
  if p_metodo is null or p_metodo not in ('efectivo', 'transferencia', 'tarjeta_manual') then
    raise exception 'Solo se corrige el monto de efectivo, transferencia o tarjeta manual.';
  end if;
  if p_monto_nuevo is null or p_monto_nuevo <= 0 then
    raise exception 'El monto nuevo debe ser mayor a cero. Para dejar el cobro en cero, anúlalo.';
  end if;
  if char_length(v_motivo) < 5 then
    raise exception 'Escribe el motivo de la corrección (qué estaba mal).';
  end if;
  v_ctx := public.cobro_correccion_validar(p_cobro_id, 'editar_monto_cobros', true);
  v_cerrado := (v_ctx ->> 'turno_cerrado')::boolean;
  v_turno_efecto := case when v_cerrado then (v_ctx ->> 'turno_abierto')::uuid else (v_ctx ->> 'turno_id')::uuid end;
  v_fecha := case when v_cerrado then now() else (v_ctx ->> 'creado_at')::timestamptz end;

  select coalesce(sum(cm.monto), 0) into v_actual from public.cobro_metodos cm where cm.cobro_id = p_cobro_id and cm.metodo = p_metodo;
  if v_actual <= 0 then
    raise exception 'Este cobro no tiene un pago en %.', p_metodo;
  end if;
  v_delta := round(p_monto_nuevo - v_actual, 2);
  if v_delta = 0 then
    raise exception 'Ese ya es el monto del cobro.';
  end if;

  select coalesce(sum(dm.monto) filter (where dm.metodo = p_metodo), 0), coalesce(sum(dm.monto), 0)
  into v_devuelto_metodo, v_devuelto_total
  from public.devolucion_metodos dm join public.devoluciones d on d.id = dm.devolucion_id
  where d.cobro_id = p_cobro_id and d.deleted_at is null;
  select coalesce(sum(cm.monto), 0) + v_delta into v_total_nuevo from public.cobro_metodos cm where cm.cobro_id = p_cobro_id;
  if p_monto_nuevo < v_devuelto_metodo or v_total_nuevo < v_devuelto_total then
    raise exception 'Este cobro ya tiene devoluciones por $% y el monto nuevo quedaría por debajo de lo devuelto.', v_devuelto_total;
  end if;

  insert into public.cobro_correcciones (cobro_id, tipo, motivo, estado_anterior, evidencia, turno_cobro_id, turno_efecto_id, hecha_por, created_by)
  values (p_cobro_id, 'edicion_monto', v_motivo,
    jsonb_build_object('reserva_id', v_ctx -> 'reserva_id', 'turno_id', v_ctx -> 'turno_id', 'origen', v_ctx -> 'origen', 'grupo_id', v_ctx -> 'grupo_id',
      'cobrado_at', v_ctx -> 'creado_at', 'cobrado_por', v_ctx -> 'creado_por', 'metodo', p_metodo, 'monto', v_actual),
    jsonb_build_object('metodo', p_metodo, 'monto_nuevo', p_monto_nuevo, 'diferencia', v_delta, 'turno_del_cobro_cerrado', v_cerrado),
    (v_ctx ->> 'turno_id')::uuid, v_turno_efecto, auth.uid(), auth.uid())
  returning id into v_corr;

  insert into public.cobro_metodos (cobro_id, metodo, monto, propina, ajuste_id, turno_efecto_id, fecha_efecto, created_by)
  values (p_cobro_id, p_metodo, v_delta, 0, v_corr, v_turno_efecto, v_fecha, auth.uid());

  -- La cuenta no se queda en el limbo: ni debiendo menos de un peso ni con saldo a
  -- favor creado por esta corrección (eso se devuelve, con su devolución).
  select t.saldo into v_saldo from public.cuenta_totales_reserva((v_ctx ->> 'reserva_id')::uuid) t;
  if v_saldo > 0 and v_saldo < 1 then
    raise exception 'Con este monto la cuenta se quedaría debiendo $% (menos de un peso). Ajusta el monto para que la cuenta quede pagada completa o con un saldo de un peso o más.', v_saldo;
  end if;
  if v_delta > 0 and v_saldo < 0 then
    raise exception 'Con este monto el cobro pasaría de lo que vale la cuenta (quedaría un saldo a favor de $%). Baja el monto, o corrige primero el precio de la cuenta.', abs(v_saldo);
  end if;

  for v_t in
    select * from public.tarjetas_manuales t
    where p_metodo = 'tarjeta_manual' and t.negocio_id = public.negocio_actual() and t.deleted_at is null and t.estado <> 'anulada'
      and (t.cobro_id = p_cobro_id or (t.grupo_id is not null and t.partes @> jsonb_build_array(jsonb_build_object('cobro_id', p_cobro_id))))
    for update
  loop
    if v_t.grupo_id is null then
      update public.tarjetas_manuales set monto = p_monto_nuevo where id = v_t.id;
    else
      update public.tarjetas_manuales
      set monto = v_t.monto + v_delta,
          partes = (select jsonb_agg(case when (p ->> 'cobro_id')::uuid = p_cobro_id then jsonb_set(p, '{monto}', to_jsonb(p_monto_nuevo)) else p end)
                    from jsonb_array_elements(v_t.partes) p)
      where id = v_t.id;
    end if;
    insert into public.tarjetas_manuales_eventos (negocio_id, tarjeta_id, tipo, actor, detalle)
    values (public.negocio_actual(), v_t.id, 'monto_corregido', auth.uid(),
      jsonb_build_object('motivo', v_motivo, 'cobro_id', p_cobro_id, 'monto_anterior', v_actual, 'monto_nuevo', p_monto_nuevo, 'correccion_id', v_corr));
  end loop;

  perform public.cobro_grupo_recalcular((v_ctx ->> 'grupo_id')::uuid, 'editado',
    jsonb_build_object('motivo', v_motivo, 'cobro_id', p_cobro_id, 'metodo', p_metodo, 'monto_anterior', v_actual, 'monto_nuevo', p_monto_nuevo, 'correccion_id', v_corr));

  return jsonb_build_object('correccion_id', v_corr, 'cobro_id', p_cobro_id, 'reserva_id', v_ctx -> 'reserva_id', 'metodo', p_metodo,
    'monto_anterior', v_actual, 'monto_nuevo', p_monto_nuevo, 'diferencia', v_delta, 'saldo', v_saldo,
    'turno_cobro_id', v_ctx -> 'turno_id', 'turno_efecto_id', v_turno_efecto, 'turno_del_cobro_cerrado', v_cerrado,
    'grupo_id', v_ctx -> 'grupo_id');
end;
$$;
alter function public.editar_monto_cobro(uuid, text, numeric, text) owner to peludesk_definer;
revoke execute on function public.editar_monto_cobro(uuid, text, numeric, text) from public, anon;
grant execute on function public.editar_monto_cobro(uuid, text, numeric, text) to authenticated, service_role;

-- ── 5. Corregir el PRECIO de una cuenta (sin descuento) ───────────────

create or replace function public.corregir_precio_cuenta(
  p_reserva_id uuid, p_linea_tipo text, p_linea_id uuid, p_precio_nuevo numeric, p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_linea record;
  v_delta numeric;
  v_actual numeric;
  v_saldo numeric;
  v_turno uuid;
  v_id uuid;
begin
  if not coalesce(public.tiene_permiso('editar_monto_cobros'), false) then
    raise exception 'No tienes el permiso «Editar monto de cobros». Pídeselo a un admin (Administración → Permisos).' using errcode = '42501';
  end if;
  if p_linea_tipo is null or p_linea_tipo not in ('estancia', 'cargo', 'estetica', 'venta', 'bono') then
    raise exception 'Esa línea no admite corrección de precio.';
  end if;
  if p_precio_nuevo is null or p_precio_nuevo <= 0 then
    raise exception 'El precio nuevo debe ser mayor a cero. Para cobrar menos a propósito, aplica un descuento.';
  end if;
  if char_length(v_motivo) < 5 then
    raise exception 'Escribe el motivo de la corrección (qué estaba mal).';
  end if;
  if not exists (select 1 from public.reservas r where r.id = p_reserva_id and r.negocio_id = public.negocio_actual() and r.deleted_at is null) then
    raise exception 'Cuenta no encontrada.';
  end if;
  select l.descripcion, l.total into v_linea
  from public.cuenta_lineas_reserva(p_reserva_id) l
  where l.tipo = p_linea_tipo and l.origen_id = p_linea_id;
  if not found then
    raise exception 'No encontramos esa línea en la cuenta.';
  end if;
  -- Lo que ya cubrió un pase se calculó con el precio de la línea: no se cambia.
  if exists (
    select 1 from public.movimientos_bono mb
    where mb.item_id = p_linea_id and mb.tipo in ('consumo', 'devolucion')
    having coalesce(sum(case mb.tipo when 'consumo' then mb.cantidad else -mb.cantidad end), 0) > 0
  ) then
    raise exception 'Esta línea está cubierta con un pase: su precio no se corrige aquí.';
  end if;
  -- Lo que vale la línea HOY: su precio más las correcciones que ya tuvo.
  v_actual := v_linea.total + coalesce((
    select sum(a.monto) from public.cuenta_ajustes_precio a
    where a.reserva_id = p_reserva_id and a.linea_tipo = p_linea_tipo and a.linea_id = p_linea_id and a.deleted_at is null
  ), 0);
  v_delta := round(p_precio_nuevo - v_actual, 2);
  if v_delta = 0 then
    raise exception 'Ese ya es el precio de la línea.';
  end if;

  select t.id into v_turno from public.turnos_caja t where t.estado = 'abierto' limit 1;
  insert into public.cuenta_ajustes_precio (reserva_id, linea_tipo, linea_id, concepto, monto, precio_antes, precio_despues, motivo, turno_id)
  values (p_reserva_id, p_linea_tipo, p_linea_id, v_linea.descripcion, v_delta, v_actual, p_precio_nuevo, v_motivo, v_turno)
  returning id into v_id;

  select t.saldo into v_saldo from public.cuenta_totales_reserva(p_reserva_id) t;
  if v_saldo > 0 and v_saldo < 1 then
    raise exception 'Con ese precio la cuenta se quedaría debiendo $% (menos de un peso). Ajusta el precio para que quede pagada completa o con un saldo de un peso o más.', v_saldo;
  end if;
  return jsonb_build_object('ajuste_id', v_id, 'reserva_id', p_reserva_id, 'linea', v_linea.descripcion,
    'precio_antes', v_actual, 'precio_despues', p_precio_nuevo, 'diferencia', v_delta, 'saldo', v_saldo);
end;
$$;
alter function public.corregir_precio_cuenta(uuid, text, uuid, numeric, text) owner to peludesk_definer;
revoke execute on function public.corregir_precio_cuenta(uuid, text, uuid, numeric, text) from public, anon;
grant execute on function public.corregir_precio_cuenta(uuid, text, uuid, numeric, text) to authenticated, service_role;

-- ── 6. Agregar efectivo al turno ──────────────────────────────────────

create or replace function public.registrar_efectivo_agregado(p_monto numeric, p_origen text, p_nota text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno uuid;
  v_id uuid;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_etiqueta text;
begin
  if not coalesce(public.tiene_permiso('agregar_efectivo'), false) then
    raise exception 'No tienes el permiso «Agregar efectivo a caja». Pídeselo a un admin (Administración → Permisos).' using errcode = '42501';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;
  if p_origen is null or p_origen not in ('cambio', 'prestamo_caja', 'aportacion_dueno', 'otro') then
    raise exception 'Elige de dónde viene el efectivo.';
  end if;
  if p_origen = 'otro' and char_length(coalesce(v_nota, '')) < 3 then
    raise exception 'Con «Otro», cuenta de dónde viene el efectivo en la nota.';
  end if;
  select t.id into v_turno from public.turnos_caja t where t.estado = 'abierto' limit 1;
  if v_turno is null then
    raise exception 'No hay turno de caja abierto.';
  end if;
  v_etiqueta := case p_origen when 'cambio' then 'Cambio' when 'prestamo_caja' then 'Préstamo de otra caja' when 'aportacion_dueno' then 'Aportación del dueño' else 'Otro' end;
  insert into public.movimientos_caja (turno_id, monto, motivo, tipo, origen_ingreso, nota, created_by)
  values (v_turno, round(p_monto, 2), v_etiqueta, 'ingreso', p_origen, v_nota, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
alter function public.registrar_efectivo_agregado(numeric, text, text) owner to peludesk_definer;
revoke execute on function public.registrar_efectivo_agregado(numeric, text, text) from public, anon;
grant execute on function public.registrar_efectivo_agregado(numeric, text, text) to authenticated, service_role;

create or replace function public.cancelar_efectivo_agregado(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.movimientos_caja%rowtype;
  v_estado text;
begin
  if not coalesce(public.tiene_permiso('agregar_efectivo'), false) then
    raise exception 'No tienes el permiso «Agregar efectivo a caja». Pídeselo a un admin (Administración → Permisos).' using errcode = '42501';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe por qué se cancela el efectivo agregado.';
  end if;
  select * into v from public.movimientos_caja where id = p_id and negocio_id = public.negocio_actual() and tipo = 'ingreso';
  if not found then
    raise exception 'Ese efectivo agregado no existe.';
  end if;
  if v.deleted_at is not null then
    raise exception 'Ese efectivo agregado ya estaba cancelado.';
  end if;
  select t.estado into v_estado from public.turnos_caja t where t.id = v.turno_id;
  if v_estado <> 'abierto' then
    raise exception 'El turno de este efectivo ya se cerró: el corte ya lo tomó en cuenta. Anótalo en el siguiente corte.';
  end if;
  if not coalesce(public.is_admin(), false) and v.created_by is distinct from auth.uid() then
    raise exception 'Solo quien lo registró, o un admin, puede cancelarlo.';
  end if;
  update public.movimientos_caja
  set deleted_at = now(), cancelado_por = auth.uid(), cancelado_at = now(), motivo_cancelacion = btrim(p_motivo)
  where id = v.id;
end;
$$;
alter function public.cancelar_efectivo_agregado(uuid, text) owner to peludesk_definer;
revoke execute on function public.cancelar_efectivo_agregado(uuid, text) from public, anon;
grant execute on function public.cancelar_efectivo_agregado(uuid, text) to authenticated, service_role;

-- ── 7. Los totales leen los renglones compensatorios ─────────────────

CREATE OR REPLACE FUNCTION public.cerrar_turno(p_turno_id uuid, p_conteo_efectivo numeric, p_conteo_terminal numeric, p_conteo_transferencia numeric, p_explicacion_diferencias text, p_notas_cierre text)
 RETURNS TABLE(cerrado boolean, corte_id uuid, esperado_efectivo numeric, esperado_terminal numeric, esperado_transferencia numeric, diferencia_efectivo numeric, diferencia_terminal numeric, diferencia_transferencia numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_turno public.turnos_caja%rowtype;
  v_esperado_efectivo numeric;
  v_esperado_terminal numeric;
  v_esperado_transferencia numeric;
  v_esperado_tarjeta_manual numeric;
  v_diferencia_efectivo numeric;
  v_diferencia_terminal numeric;
  v_diferencia_transferencia numeric;
  v_hay_diferencia boolean;
  v_corte_id uuid;
begin
  select * into v_turno from public.turnos_caja where id = p_turno_id;
  if not found then
    raise exception 'Turno no encontrado.';
  end if;
  if v_turno.estado <> 'abierto' then
    raise exception 'Este turno ya está cerrado.';
  end if;

  if public.is_admin() then
    null;
  elsif public.current_rol() = 'recepcion' then
    if v_turno.abierto_por <> auth.uid() then
      raise exception 'Solo puedes cerrar el turno que tú abriste.';
    end if;
  else
    raise exception 'Solo admin o recepción pueden cerrar un turno.';
  end if;

  if p_conteo_efectivo is null or p_conteo_terminal is null or p_conteo_transferencia is null then
    raise exception 'Captura el conteo de los tres métodos.';
  end if;
  if p_conteo_efectivo < 0 or p_conteo_terminal < 0 or p_conteo_transferencia < 0 then
    raise exception 'El conteo no puede ser negativo.';
  end if;

  v_esperado_efectivo := v_turno.fondo_inicial
    + coalesce((
      select sum(cm.monto + cm.propina) from public.cobro_metodos cm
      join public.cobros c on c.id = cm.cobro_id
      where coalesce(cm.turno_efecto_id, c.turno_id) = p_turno_id and cm.metodo = 'efectivo'
    ), 0)
    - coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm
      join public.devoluciones d on d.id = dm.devolucion_id
      where d.turno_id = p_turno_id and dm.metodo = 'efectivo'
    ), 0)
    -- Efectivo agregado al turno (no es venta) menos retiros.
    + coalesce((select sum(monto) from public.movimientos_caja where turno_id = p_turno_id and deleted_at is null and tipo = 'ingreso'), 0)
    - coalesce((select sum(monto) from public.movimientos_caja where turno_id = p_turno_id and deleted_at is null and tipo = 'retiro'), 0);

  v_esperado_terminal := coalesce((
      select sum(cm.monto + cm.propina) from public.cobro_metodos cm
      join public.cobros c on c.id = cm.cobro_id
      where coalesce(cm.turno_efecto_id, c.turno_id) = p_turno_id and cm.metodo = 'terminal'
    ), 0)
    - coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm
      join public.devoluciones d on d.id = dm.devolucion_id
      where d.turno_id = p_turno_id and dm.metodo = 'terminal'
    ), 0);

  v_esperado_transferencia := coalesce((
      select sum(cm.monto + cm.propina) from public.cobro_metodos cm
      join public.cobros c on c.id = cm.cobro_id
      where coalesce(cm.turno_efecto_id, c.turno_id) = p_turno_id and cm.metodo = 'transferencia'
    ), 0)
    - coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm
      join public.devoluciones d on d.id = dm.devolucion_id
      where d.turno_id = p_turno_id and dm.metodo = 'transferencia'
    ), 0);

  -- Tarjeta manual (sin verificar): línea aparte, sin conteo propio. Se anota con
  -- conteo = esperado (los vouchers se revisan en Conciliación) y nunca entra a la
  -- diferencia del corte.
  v_esperado_tarjeta_manual := coalesce((
      select sum(cm.monto + cm.propina) from public.cobro_metodos cm
      join public.cobros c on c.id = cm.cobro_id
      where coalesce(cm.turno_efecto_id, c.turno_id) = p_turno_id and cm.metodo = 'tarjeta_manual'
    ), 0)
    - coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm
      join public.devoluciones d on d.id = dm.devolucion_id
      where d.turno_id = p_turno_id and dm.metodo = 'tarjeta_manual'
    ), 0);

  v_diferencia_efectivo := p_conteo_efectivo - v_esperado_efectivo;
  v_diferencia_terminal := p_conteo_terminal - v_esperado_terminal;
  v_diferencia_transferencia := p_conteo_transferencia - v_esperado_transferencia;

  v_hay_diferencia := v_diferencia_efectivo <> 0 or v_diferencia_terminal <> 0 or v_diferencia_transferencia <> 0;

  if v_hay_diferencia and (p_explicacion_diferencias is null or btrim(p_explicacion_diferencias) = '') then
    -- Fase 1 con diferencia: no se escribe nada todavía, solo se revela
    -- lo que el sistema esperaba para que la pantalla pida el motivo.
    cerrado := false;
    corte_id := null;
    esperado_efectivo := v_esperado_efectivo;
    esperado_terminal := v_esperado_terminal;
    esperado_transferencia := v_esperado_transferencia;
    diferencia_efectivo := v_diferencia_efectivo;
    diferencia_terminal := v_diferencia_terminal;
    diferencia_transferencia := v_diferencia_transferencia;
    return next;
    return;
  end if;

  insert into public.cortes_caja (turno_id, explicacion_diferencias, created_by)
  values (p_turno_id, nullif(btrim(p_explicacion_diferencias), ''), auth.uid())
  returning id into v_corte_id;

  insert into public.corte_metodos (corte_id, metodo, conteo, esperado, diferencia, created_by)
  values
    (v_corte_id, 'efectivo', p_conteo_efectivo, v_esperado_efectivo, v_diferencia_efectivo, auth.uid()),
    (v_corte_id, 'terminal', p_conteo_terminal, v_esperado_terminal, v_diferencia_terminal, auth.uid()),
    (v_corte_id, 'transferencia', p_conteo_transferencia, v_esperado_transferencia, v_diferencia_transferencia, auth.uid()),
    (v_corte_id, 'tarjeta_manual', greatest(v_esperado_tarjeta_manual, 0), v_esperado_tarjeta_manual, 0, auth.uid());

  update public.turnos_caja
  set estado = 'cerrado', cerrado_at = now(), cerrado_por = auth.uid(), notas_cierre = nullif(btrim(p_notas_cierre), '')
  where id = p_turno_id;

  cerrado := true;
  corte_id := v_corte_id;
  esperado_efectivo := v_esperado_efectivo;
  esperado_terminal := v_esperado_terminal;
  esperado_transferencia := v_esperado_transferencia;
  diferencia_efectivo := v_diferencia_efectivo;
  diferencia_terminal := v_diferencia_terminal;
  diferencia_transferencia := v_diferencia_transferencia;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.resumen_turno(p_turno_id uuid)
 RETURNS TABLE(metodo text, origen text, cobrado numeric, propinas numeric, devuelto numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with cobros_t as (
    select cm.metodo, coalesce(c.origen, 'manual') as origen, sum(cm.monto) as cobrado, sum(cm.propina) as propinas
    from public.cobro_metodos cm
    join public.cobros c on c.id = cm.cobro_id
    where coalesce(cm.turno_efecto_id, c.turno_id) = p_turno_id
    group by cm.metodo, coalesce(c.origen, 'manual')
  ),
  devol_t as (
    select dm.metodo, d.origen, sum(dm.monto) as devuelto
    from public.devolucion_metodos dm
    join public.devoluciones d on d.id = dm.devolucion_id
    where d.turno_id = p_turno_id
    group by dm.metodo, d.origen
  )
  select
    m.metodo,
    m.origen,
    coalesce(ct.cobrado, 0),
    coalesce(ct.propinas, 0),
    coalesce(dv.devuelto, 0)
  from (
    select unnest(array['efectivo', 'terminal', 'transferencia', 'tarjeta_manual']) as metodo,
           unnest(array['manual', 'manual', 'manual', 'manual']) as origen
    union
    select 'terminal', 'mercadopago_point'
    union
    select 'transferencia', 'mercadopago_link'
    union
    select 'terminal', 'clip_terminal'
  ) m
  left join cobros_t ct on ct.metodo = m.metodo and ct.origen = m.origen
  left join devol_t dv on dv.metodo = m.metodo and dv.origen = m.origen
  order by 1, 2;
$function$;

CREATE OR REPLACE FUNCTION public.cuenta_lineas_reserva(p_reserva_id uuid)
 RETURNS TABLE(tipo text, origen_id uuid, servicio_id uuid, descripcion text, cantidad numeric, precio_unitario numeric, total numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    'estancia'::text,
    e.id,
    e.servicio_id,
    p.nombre || ' — ' || s.nombre,
    (case when s.unidad = 'hora' then coalesce(e.horas, 1) else (e.fecha_salida - e.fecha_entrada) end)::numeric,
    e.precio_unitario,
    e.precio_unitario * (case when s.unidad = 'hora' then coalesce(e.horas, 1) else (e.fecha_salida - e.fecha_entrada) end)::numeric
  from public.estancias e
  join public.perros p on p.id = e.perro_id
  join public.servicios s on s.id = e.servicio_id
  where e.reserva_id = p_reserva_id
    and e.deleted_at is null
    and e.estado not in ('cancelada', 'no_llego')

  union all

  select
    'cargo'::text,
    c.id,
    c.servicio_id,
    coalesce(p.nombre || ' — ', '') || s.nombre
      || case when c.descripcion is not null and btrim(c.descripcion) <> '' then ' (' || c.descripcion || ')' else '' end,
    c.cantidad::numeric,
    c.precio,
    c.precio * c.cantidad
  from public.cargos_aplicados c
  join public.servicios s on s.id = c.servicio_id
  left join public.perros p on p.id = c.perro_id
  where c.reserva_id = p_reserva_id
    and c.deleted_at is null
    and c.cancelado = false

  union all

  select
    'estetica'::text,
    ce.id,
    ce.servicio_id,
    p.nombre || ' — ' || s.nombre,
    1::numeric,
    ce.precio,
    ce.precio
  from public.citas_estetica ce
  join public.perros p on p.id = ce.perro_id
  join public.servicios s on s.id = ce.servicio_id
  left join public.estancias e on e.id = ce.estancia_id
  where (ce.reserva_id = p_reserva_id or e.reserva_id = p_reserva_id)
    and ce.deleted_at is null
    and ce.estado not in ('cancelada', 'no_llego')

  union all

  select
    'bono'::text,
    bc.id,
    bc.servicio_id,
    s.nombre,
    1::numeric,
    bc.precio_pagado,
    bc.precio_pagado
  from public.bonos_clientes bc
  join public.servicios s on s.id = bc.servicio_id
  where bc.reserva_id = p_reserva_id
    and bc.deleted_at is null

  union all

  select
    'venta'::text,
    v.id,
    null::uuid,
    v.concepto,
    v.cantidad,
    v.precio_unitario,
    round(v.precio_unitario * v.cantidad, 2)
  from public.ventas_mostrador v
  where v.reserva_id = p_reserva_id
    and v.deleted_at is null
    and not v.cancelado

  union all

  -- Corrección de precio de la cuenta (no es un descuento).
  select
    'ajuste'::text,
    a.id,
    null::uuid,
    'Corrección de precio: ' || a.concepto,
    1::numeric,
    a.monto,
    a.monto
  from public.cuenta_ajustes_precio a
  where a.reserva_id = p_reserva_id
    and a.deleted_at is null;
$function$;

CREATE OR REPLACE FUNCTION public.cuentas_abiertas(p_dias integer DEFAULT 30)
 RETURNS TABLE(reserva_id uuid, cliente_id uuid, cliente_nombre text, cliente_telefono text, perros text, descripcion text, fecha_actividad date, total_cuenta numeric, saldo numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with hoy as (
    select public.fecha_negocio() as d, public.zona_negocio() as z
  ),
  actividad as (
    select e.reserva_id, e.fecha_entrada as fecha
    from public.estancias e
    where e.deleted_at is null and e.estado not in ('cancelada', 'no_llego')
    union all
    select ce.reserva_id, (ce.inicio at time zone (select z from hoy))::date
    from public.citas_estetica ce
    where ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
  ),
  -- La fecha de actividad manda: la estancia o cita más cercana a hoy, y
  -- solo si no hay ninguna, el día en que se creó la cuenta (un cargo suelto).
  mas_cercana as (
    select distinct on (a.reserva_id) a.reserva_id, a.fecha
    from actividad a
    order by a.reserva_id, abs(a.fecha - (select d from hoy))
  ),
  candidatas as (
    select r.id, r.cliente_id, r.notas,
      coalesce(mc.fecha, (r.created_at at time zone (select z from hoy))::date) as fecha_actividad
    from public.reservas r
    left join mas_cercana mc on mc.reserva_id = r.id
    where r.deleted_at is null
      and coalesce(mc.fecha, (r.created_at at time zone (select z from hoy))::date)
          between (select d from hoy) - p_dias and (select d from hoy) + p_dias
  ),
  -- Las líneas de la cuenta (cuenta_lineas_reserva). Una cita cuenta en su
  -- reserva y, si va ligada a una estancia de otra reserva, también en esa.
  lineas as (
    select e.reserva_id,
      e.precio_unitario * (case when s.unidad = 'hora' then coalesce(e.horas, 1) else (e.fecha_salida - e.fecha_entrada) end)::numeric as total
    from public.estancias e
    join public.perros p on p.id = e.perro_id
    join public.servicios s on s.id = e.servicio_id
    where e.deleted_at is null and e.estado not in ('cancelada', 'no_llego')
      and e.reserva_id in (select id from candidatas)
    union all
    select c.reserva_id, c.precio * c.cantidad
    from public.cargos_aplicados c
    join public.servicios s on s.id = c.servicio_id
    where c.deleted_at is null and c.cancelado = false
      and c.reserva_id in (select id from candidatas)
    union all
    select x.reserva_id, x.precio
    from (
      select ce.reserva_id, ce.precio
      from public.citas_estetica ce
      join public.perros p on p.id = ce.perro_id
      join public.servicios s on s.id = ce.servicio_id
      where ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
      union all
      select e.reserva_id, ce.precio
      from public.citas_estetica ce
      join public.perros p on p.id = ce.perro_id
      join public.servicios s on s.id = ce.servicio_id
      join public.estancias e on e.id = ce.estancia_id
      where ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
        and e.reserva_id is distinct from ce.reserva_id
    ) x
    where x.reserva_id in (select id from candidatas)
    union all
    select bc.reserva_id, bc.precio_pagado
    from public.bonos_clientes bc
    join public.servicios s on s.id = bc.servicio_id
    where bc.deleted_at is null
      and bc.reserva_id in (select id from candidatas)
    union all
    select v.reserva_id, round(v.precio_unitario * v.cantidad, 2)
    from public.ventas_mostrador v
    where v.deleted_at is null and not v.cancelado
      and v.reserva_id in (select id from candidatas)
    union all
    select a.reserva_id, a.monto
    from public.cuenta_ajustes_precio a
    where a.deleted_at is null
      and a.reserva_id in (select id from candidatas)
  ),
  -- Lo cubierto con pases (cuenta_totales_reserva): consumos − devoluciones,
  -- al precio unitario de la línea, en la reserva de la línea.
  cobertura as (
    select x.reserva_id, sum(x.signo * x.cantidad * x.precio) as total
    from (
      select e.reserva_id, mb.cantidad, e.precio_unitario as precio,
        case mb.tipo when 'consumo' then 1 else -1 end as signo
      from public.movimientos_bono mb
      join public.estancias e on e.id = mb.item_id
      where mb.tipo in ('consumo', 'devolucion') and mb.item_tipo = 'estancia'
      union all
      select c.reserva_id, mb.cantidad, c.precio, case mb.tipo when 'consumo' then 1 else -1 end
      from public.movimientos_bono mb
      join public.cargos_aplicados c on c.id = mb.item_id
      where mb.tipo in ('consumo', 'devolucion') and mb.item_tipo = 'cargo'
      union all
      select r.reserva_id, mb.cantidad, ce.precio, case mb.tipo when 'consumo' then 1 else -1 end
      from public.movimientos_bono mb
      join public.citas_estetica ce on ce.id = mb.item_id
      left join public.estancias e on e.id = ce.estancia_id
      cross join lateral (
        select ce.reserva_id
        union
        select e.reserva_id where e.reserva_id is not null
      ) r
      where mb.tipo in ('consumo', 'devolucion') and mb.item_tipo = 'estetica'
    ) x
    where x.reserva_id in (select id from candidatas)
    group by x.reserva_id
  ),
  cobrado as (
    select c.reserva_id, sum(cm.monto) as monto
    from public.cobro_metodos cm
    join public.cobros c on c.id = cm.cobro_id
    where c.reserva_id in (select id from candidatas)
    group by c.reserva_id
  ),
  devuelto as (
    select c.reserva_id, sum(dm.monto) as monto
    from public.devolucion_metodos dm
    join public.devoluciones d on d.id = dm.devolucion_id
    join public.cobros c on c.id = d.cobro_id
    where c.reserva_id in (select id from candidatas)
    group by c.reserva_id
  ),
  descuento as (
    select da.reserva_id, sum(da.monto_aplicado) as monto
    from public.descuentos_aplicados da
    where da.cancelado = false and da.reserva_id in (select id from candidatas)
    group by da.reserva_id
  ),
  totales as (
    select l.reserva_id, sum(l.total) as total
    from lineas l
    group by l.reserva_id
  ),
  con_totales as (
    select c.*,
      coalesce(t.total, 0) as total_cuenta,
      coalesce(t.total, 0) - coalesce(co.monto, 0) - coalesce(cb.total, 0) - coalesce(de.monto, 0) + coalesce(dv.monto, 0) as saldo
    from candidatas c
    left join totales t on t.reserva_id = c.id
    left join cobrado co on co.reserva_id = c.id
    left join cobertura cb on cb.reserva_id = c.id
    left join descuento de on de.reserva_id = c.id
    left join devuelto dv on dv.reserva_id = c.id
  )
  select
    c.id,
    c.cliente_id,
    cl.nombre,
    cl.telefono,
    coalesce((
      select string_agg(distinct p.nombre, ', ' order by p.nombre)
      from (
        select p1.nombre from public.estancias e join public.perros p1 on p1.id = e.perro_id
        where e.reserva_id = c.id and e.deleted_at is null and e.estado not in ('cancelada', 'no_llego')
        union
        select p2.nombre from public.citas_estetica ce join public.perros p2 on p2.id = ce.perro_id
        where ce.reserva_id = c.id and ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
        union
        select p3.nombre from public.cargos_aplicados ca join public.perros p3 on p3.id = ca.perro_id
        where ca.reserva_id = c.id and ca.deleted_at is null and not ca.cancelado
      ) p
    ), ''),
    coalesce((
      select string_agg(l.descripcion, ' · ' order by l.descripcion)
      from public.cuenta_lineas_reserva(c.id) l
    ), coalesce(c.notas, 'Cuenta')),
    c.fecha_actividad,
    c.total_cuenta,
    c.saldo
  from con_totales c
  join public.clientes cl on cl.id = c.cliente_id
  where c.saldo > 0
  order by 7 desc, 9 desc;
$function$;

drop function public.reporte_financiero_periodo(date, date);
CREATE OR REPLACE FUNCTION public.reporte_financiero_periodo(p_desde date, p_hasta date)
 RETURNS TABLE(cobros_efectivo numeric, cobros_terminal numeric, cobros_transferencia numeric, propinas_efectivo numeric, propinas_terminal numeric, propinas_transferencia numeric, devoluciones_efectivo numeric, devoluciones_terminal numeric, devoluciones_transferencia numeric, retiros_efectivo numeric, bonos_vendidos numeric, bonos_consumidos numeric, descuentos_otorgados numeric, ingreso_caja_neto numeric, ingreso_reconocido numeric, cobros_tarjeta_manual numeric, propinas_tarjeta_manual numeric, devoluciones_tarjeta_manual numeric, efectivo_agregado numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.tiene_permiso('reportes_financieros') then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes financieros», puede ver reportes.';
  end if;

  return query
  with cobros_periodo as (
    select cm.metodo, cm.monto, cm.propina
    from public.cobro_metodos cm
    join public.cobros c on c.id = cm.cobro_id
    where public.fecha_negocio(coalesce(cm.fecha_efecto, c.created_at)) between p_desde and p_hasta
  ),
  devoluciones_periodo as (
    select dm.metodo, dm.monto
    from public.devolucion_metodos dm
    join public.devoluciones d on d.id = dm.devolucion_id
    where public.fecha_negocio(d.created_at) between p_desde and p_hasta
  ),
  retiros_periodo as (
    select coalesce(sum(monto), 0) as total
    from public.movimientos_caja
    where deleted_at is null and tipo = 'retiro'
      and public.fecha_negocio(created_at) between p_desde and p_hasta
  ),
  ingresos_efectivo_periodo as (
    -- Efectivo que se agregó al cajón (cambio, préstamo, aportación): es movimiento
    -- de caja, NO una venta ni un ingreso.
    select coalesce(sum(monto), 0) as total
    from public.movimientos_caja
    where deleted_at is null and tipo = 'ingreso'
      and public.fecha_negocio(created_at) between p_desde and p_hasta
  ),
  bonos_periodo as (
    select
      coalesce(sum(monto) filter (where tipo = 'venta'), 0) as vendidos,
      coalesce(sum(monto) filter (where tipo = 'consumo'), 0)
        - coalesce(sum(monto) filter (where tipo = 'devolucion'), 0) as consumidos
    from public.movimientos_bono
    where public.fecha_negocio(created_at) between p_desde and p_hasta
  ),
  descuentos_periodo as (
    select coalesce(sum(monto_aplicado), 0) as total
    from public.descuentos_aplicados
    where not cancelado
      and public.fecha_negocio(created_at) between p_desde and p_hasta
  )
  select
    coalesce(sum(monto) filter (where metodo = 'efectivo'), 0),
    coalesce(sum(monto) filter (where metodo = 'terminal'), 0),
    coalesce(sum(monto) filter (where metodo = 'transferencia'), 0),
    coalesce(sum(propina) filter (where metodo = 'efectivo'), 0),
    coalesce(sum(propina) filter (where metodo = 'terminal'), 0),
    coalesce(sum(propina) filter (where metodo = 'transferencia'), 0),
    (select coalesce(sum(monto) filter (where metodo = 'efectivo'), 0) from devoluciones_periodo),
    (select coalesce(sum(monto) filter (where metodo = 'terminal'), 0) from devoluciones_periodo),
    (select coalesce(sum(monto) filter (where metodo = 'transferencia'), 0) from devoluciones_periodo),
    (select total from retiros_periodo),
    (select vendidos from bonos_periodo),
    (select consumidos from bonos_periodo),
    (select total from descuentos_periodo),
    (coalesce(sum(monto), 0) + coalesce(sum(propina), 0))
      - (select coalesce(sum(monto), 0) from devoluciones_periodo)
      - (select total from retiros_periodo),
    coalesce(sum(monto), 0)
      - (select coalesce(sum(monto), 0) from devoluciones_periodo)
      - (select vendidos from bonos_periodo)
      + (select consumidos from bonos_periodo),
    coalesce(sum(monto) filter (where metodo = 'tarjeta_manual'), 0),
    coalesce(sum(propina) filter (where metodo = 'tarjeta_manual'), 0),
    (select coalesce(sum(monto) filter (where metodo = 'tarjeta_manual'), 0) from devoluciones_periodo),
    (select total from ingresos_efectivo_periodo)
  from cobros_periodo;
end;
$function$;
alter function public.reporte_financiero_periodo(date, date) owner to peludesk_definer;
revoke execute on function public.reporte_financiero_periodo(date, date) from public, anon;
grant execute on function public.reporte_financiero_periodo(date, date) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancelar_retiro(p_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.movimientos_caja%rowtype;
  v_estado text;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden cancelar un retiro.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe por qué se cancela el retiro.';
  end if;
  select * into v from public.movimientos_caja where id = p_id;
  if not found then
    raise exception 'Ese retiro no existe.';
  end if;
  if v.tipo = 'ingreso' then
    raise exception 'Eso es efectivo agregado al turno, no un retiro: se cancela con «Cancelar este efectivo agregado».';
  end if;
  if v.deleted_at is not null then
    raise exception 'Ese retiro ya estaba cancelado.';
  end if;
  if exists (select 1 from public.gastos g where g.movimiento_caja_id = v.id) then
    raise exception 'Este retiro es de un gasto pagado del cajón: cancela el gasto en Gastos y el retiro se quita solo.';
  end if;
  select t.estado into v_estado from public.turnos_caja t where t.id = v.turno_id;
  if v_estado <> 'abierto' then
    raise exception 'El turno de este retiro ya se cerró: el corte ya lo tomó en cuenta. Anótalo en el siguiente corte.';
  end if;
  if not public.is_admin() and v.created_by is distinct from auth.uid() then
    raise exception 'Solo quien registró el retiro, o un admin, puede cancelarlo.';
  end if;
  update public.movimientos_caja
  set deleted_at = now(), cancelado_por = auth.uid(), cancelado_at = now(), motivo_cancelacion = btrim(p_motivo)
  where id = v.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_devolucion(p_cobro_id uuid, p_motivo text, p_metodos jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_turno_id uuid;
  v_devolucion_id uuid;
  v_metodo jsonb;
  v_monto numeric;
  v_nombre_metodo text;
  v_origen text;
  v_total_nuevo numeric;
  v_disponible numeric;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede registrar una devolución.';
  end if;

  select coalesce(origen, 'manual') into v_origen from public.cobros where id = p_cobro_id and deleted_at is null;
  if not found then
    raise exception 'Cobro no encontrado.';
  end if;
  if exists (select 1 from public.cobros where id = p_cobro_id and anulado_at is not null) then
    raise exception 'Este cobro está anulado: ya no hay nada cobrado que devolver.';
  end if;
  if v_origen in ('mercadopago_point', 'mercadopago_link') then
    raise exception 'Este cobro entró por Mercado Pago: devuélvelo con «Devolver con Mercado Pago», que hace el reembolso y lo registra en caja.';
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe el motivo de la devolución.';
  end if;

  if p_metodos is null or jsonb_typeof(p_metodos) <> 'array' or jsonb_array_length(p_metodos) = 0 then
    raise exception 'Agrega al menos un método a devolver.';
  end if;

  v_total_nuevo := (
    select coalesce(sum((m ->> 'monto')::numeric), 0)
    from jsonb_array_elements(p_metodos) m
  );
  v_disponible := public.cobro_disponible_para_devolver(p_cobro_id);
  if v_total_nuevo > v_disponible then
    raise exception 'No se puede devolver más de lo que sigue cobrado en este cobro (queda por devolver: %).', v_disponible;
  end if;

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto. Ábrelo antes de registrar la devolución.';
  end if;

  insert into public.devoluciones (cobro_id, turno_id, motivo, autorizado_por, created_by, origen)
  values (p_cobro_id, v_turno_id, btrim(p_motivo), auth.uid(), auth.uid(), 'manual')
  returning id into v_devolucion_id;

  for v_metodo in select * from jsonb_array_elements(p_metodos)
  loop
    v_nombre_metodo := v_metodo ->> 'metodo';
    v_monto := (v_metodo ->> 'monto')::numeric;

    if v_nombre_metodo is null or v_nombre_metodo not in ('efectivo', 'terminal', 'transferencia', 'tarjeta_manual') then
      raise exception 'Método de pago inválido: %', v_nombre_metodo;
    end if;
    if v_monto is null or v_monto <= 0 then
      raise exception 'Cada método debe tener un monto mayor a cero.';
    end if;

    -- Una tarjeta manual solo se devuelve hasta lo que ese cobro pasó por tarjeta manual:
    -- es una devolución manual (el reembolso integrado de Mercado Pago no aplica).
    if v_nombre_metodo = 'tarjeta_manual' and v_monto > (
      coalesce((select sum(cm.monto) from public.cobro_metodos cm where cm.cobro_id = p_cobro_id and cm.metodo = 'tarjeta_manual'), 0)
      - coalesce((select sum(dm.monto) from public.devolucion_metodos dm join public.devoluciones d on d.id = dm.devolucion_id
          where d.cobro_id = p_cobro_id and d.deleted_at is null and dm.metodo = 'tarjeta_manual' and d.id <> v_devolucion_id), 0)
    ) then
      raise exception 'No se puede devolver por tarjeta manual más de lo que este cobro pasó por tarjeta manual.';
    end if;

    insert into public.devolucion_metodos (devolucion_id, metodo, monto, created_by)
    values (v_devolucion_id, v_nombre_metodo, v_monto, auth.uid());
  end loop;

  return v_devolucion_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.demo_vaciar(p_negocio_id uuid)
 RETURNS TABLE(tabla text, borradas bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_plan text;
  v_tabla text;
  v_n bigint;
  v_pendientes text[];
  v_siguen text[];
  v_pasada int := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and nullif(current_setting('request.jwt.claims', true), '') is not null then
    raise exception 'Solo el servidor vacía el demo.';
  end if;
  select n.plan into v_plan from public.negocios n where n.id = p_negocio_id and n.deleted_at is null;
  if v_plan is distinct from 'demo' then
    raise exception 'Solo se vacía un negocio con plan demo.';
  end if;
  delete from public.membresias m where m.negocio_id = p_negocio_id and m.rol = 'cliente';
  tabla := 'membresias (clientes)'; get diagnostics borradas = row_count; return next;

  v_pendientes := array[
    'adelantos', 'asistencia_correcciones', 'asistencias', 'ausencias', 'bitacora_entradas', 'bonos_ajustes', 'bonos_clientes',
    'cargos_aplicados', 'categorias_insumo', 'citas_estetica', 'clientes', 'cobro_metodos', 'cobro_correcciones', 'cuenta_ajustes_precio', 'cobros',
    'comisiones_servicio', 'compras_insumos', 'contratos', 'corte_metodos', 'cortes_caja', 'descuentos_aplicados',
    'devolucion_metodos', 'devoluciones', 'empleados', 'empleados_horario', 'equipo_eventos', 'equipos',
    'esquemas_pago', 'estancia_pertenencias', 'estancias', 'gastos', 'gastos_recurrentes', 'insumos',
    'insumos_costos', 'invitaciones_cliente', 'medicamentos_administrados', 'movimientos_bono', 'movimientos_caja',
    'movimientos_inventario', 'mp_ordenes', 'nomina_pagos', 'perro_accesos_compartidos', 'perro_alergias',
    'perro_alertas', 'perro_historial_dueno', 'perro_medicamentos', 'perros', 'pesos_registrados',
    'plantillas_contrato', 'proveedores', 'recetas_consumo', 'requisitos_sanitarios_aplicados',
    'requisitos_sanitarios_propuestos', 'reservas', 'series_pausas', 'series_recurrentes', 'tarifas',
    'tarifas_dia_semana', 'turnos_caja', 'vacaciones_movimientos', 'vinculacion_eventos', 'ventas_mostrador', 'reembolsos_cobro', 'cobros_grupo_eventos', 'cobros_grupo', 'tarjetas_manuales_eventos', 'tarjetas_manuales', 'soporte_ticket_mensajes', 'soporte_tickets', 'soporte_mensajes_asistente', 'soporte_conversaciones'
  ];
  while cardinality(v_pendientes) > 0 loop
    v_pasada := v_pasada + 1;
    if v_pasada > 30 then
      raise exception 'No se pudo vaciar el demo: siguen con filas %.', v_pendientes;
    end if;
    v_siguen := array[]::text[];
    foreach v_tabla in array v_pendientes loop
      begin
        execute format('delete from public.%I where negocio_id = $1', v_tabla) using p_negocio_id;
        get diagnostics v_n = row_count;
        if v_n > 0 then
          tabla := v_tabla; borradas := v_n; return next;
        end if;
      exception when foreign_key_violation then
        v_siguen := array_append(v_siguen, v_tabla);
      end;
    end loop;
    v_pendientes := v_siguen;
  end loop;
  -- Lo que sembró el script en el catálogo copiado (los paquetes) se queda:
  -- el script los reconoce por su clave.
end;
$function$;

CREATE OR REPLACE FUNCTION public.cobro_grupo_detalle(p_grupo_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'grupo_id', g.id,
    'recibo', upper(left(g.id::text, 8)),
    'fecha', g.created_at,
    'turno_id', g.turno_id,
    'cliente_id', g.cliente_id,
    'cliente_nombre', cl.nombre,
    'origen', g.origen,
    'total', g.monto_total,
    'propina', g.propina_total,
    'notas', g.notas,
    'anulado', not exists (select 1 from public.cobros c2 where c2.grupo_id = g.id and c2.deleted_at is null and c2.anulado_at is null),
    'correcciones', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', cc.tipo, 'motivo', cc.motivo, 'fecha', cc.created_at, 'cobro_id', cc.cobro_id,
        'estado_anterior', cc.estado_anterior, 'evidencia', cc.evidencia) order by cc.created_at)
      from public.cobro_correcciones cc join public.cobros c3 on c3.id = cc.cobro_id
      where c3.grupo_id = g.id and cc.tipo in ('anulacion', 'edicion_monto')), '[]'::jsonb),
    'tarjeta', (select jsonb_build_object('id', t.id, 'folio', t.folio, 'estado', t.estado, 'monto', t.monto)
                from public.tarjetas_manuales t where t.grupo_id = g.id and t.deleted_at is null order by t.created_at limit 1),
    'metodos', coalesce((
      select jsonb_agg(jsonb_build_object('metodo', x.metodo, 'monto', x.monto, 'propina', x.propina) order by x.metodo)
      from (
        select cm.metodo, sum(cm.monto) as monto, sum(cm.propina) as propina
        from public.cobro_metodos cm join public.cobros c on c.id = cm.cobro_id
        where c.grupo_id = g.id group by cm.metodo
      ) x), '[]'::jsonb),
    'cuentas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'reserva_id', c.reserva_id,
        'cobro_id', c.id,
        'anulado', c.anulado_at is not null,
        'anulacion_motivo', c.anulacion_motivo,
        'editado', exists (select 1 from public.cobro_correcciones cc where cc.cobro_id = c.id and cc.tipo = 'edicion_monto'),
        'monto', coalesce((select sum(cm.monto) from public.cobro_metodos cm where cm.cobro_id = c.id), 0),
        'propina', coalesce((select sum(cm.propina) from public.cobro_metodos cm where cm.cobro_id = c.id), 0),
        'devuelto', coalesce((select sum(dm.monto) from public.devolucion_metodos dm join public.devoluciones d on d.id = dm.devolucion_id
                              where d.cobro_id = c.id and d.deleted_at is null), 0),
        'descripcion', coalesce((select string_agg(l.descripcion, ' · ' order by l.descripcion) from public.cuenta_lineas_reserva(c.reserva_id) l), coalesce(r.notas, 'Cuenta')),
        'perros', coalesce((
          select string_agg(distinct p.nombre, ', ' order by p.nombre) from (
            select p1.nombre from public.estancias e join public.perros p1 on p1.id = e.perro_id
              where e.reserva_id = c.reserva_id and e.deleted_at is null and e.estado not in ('cancelada', 'no_llego')
            union
            select p2.nombre from public.citas_estetica ce join public.perros p2 on p2.id = ce.perro_id
              where ce.reserva_id = c.reserva_id and ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
            union
            select p3.nombre from public.cargos_aplicados ca join public.perros p3 on p3.id = ca.perro_id
              where ca.reserva_id = c.reserva_id and ca.deleted_at is null and not ca.cancelado
          ) p), '')
      ) order by c.grupo_orden, c.created_at, c.id)
      from public.cobros c join public.reservas r on r.id = c.reserva_id
      where c.grupo_id = g.id and c.deleted_at is null), '[]'::jsonb)
  )
  from public.cobros_grupo g
  join public.clientes cl on cl.id = g.cliente_id
  where g.id = p_grupo_id and g.negocio_id = public.negocio_actual() and g.deleted_at is null
    and coalesce(public.current_rol() in ('admin', 'recepcion'), false);
$function$;

drop function public.movimientos_turno(uuid);
create function public.movimientos_turno(p_turno_id uuid)
 returns table(id uuid, tipo text, fecha timestamptz, reserva_id uuid, cliente_nombre text, descripcion text, metodo text,
   monto numeric, propina numeric, origen text, hecho_por uuid, grupo_id uuid, ajuste_id uuid, ajuste_tipo text)
 language sql
 stable
 set search_path to ''
as $function$
  select
    cm.id,
    case
      when exists (select 1 from public.ventas_mostrador v where v.reserva_id = c.reserva_id) then 'venta_mostrador'
      when exists (select 1 from public.bonos_clientes bc where bc.reserva_id = c.reserva_id) then 'venta_bono'
      else 'cobro' end,
    case when cm.ajuste_id is not null then cm.created_at else c.created_at end,
    c.reserva_id,
    cl.nombre,
    case when cm.ajuste_id is not null
      then (case co.tipo when 'anulacion' then 'Anulación: ' else 'Corrección de monto: ' end) || co.motivo
      else coalesce(c.notas, '') end,
    cm.metodo,
    cm.monto,
    cm.propina,
    coalesce(c.origen, 'manual'),
    coalesce(co.hecha_por, c.created_by),
    c.grupo_id,
    cm.ajuste_id,
    case when cm.ajuste_id is not null then co.tipo
         when c.anulado_at is not null then 'original_anulado'
         else null end
  from public.cobro_metodos cm
  join public.cobros c on c.id = cm.cobro_id
  join public.reservas r on r.id = c.reserva_id
  join public.clientes cl on cl.id = r.cliente_id
  left join public.cobro_correcciones co on co.id = cm.ajuste_id
  where coalesce(cm.turno_efecto_id, c.turno_id) = p_turno_id

  union all

  select
    dm.id,
    'devolucion',
    d.created_at,
    c.reserva_id,
    cl.nombre,
    d.motivo,
    dm.metodo,
    -dm.monto,
    0,
    d.origen,
    d.autorizado_por,
    c.grupo_id,
    null::uuid,
    null::text
  from public.devolucion_metodos dm
  join public.devoluciones d on d.id = dm.devolucion_id
  join public.cobros c on c.id = d.cobro_id
  join public.reservas r on r.id = c.reserva_id
  join public.clientes cl on cl.id = r.cliente_id
  where d.turno_id = p_turno_id

  union all

  select
    mc.id,
    case mc.tipo when 'ingreso' then 'ingreso_efectivo' else 'retiro' end,
    mc.created_at,
    null,
    null,
    case when mc.tipo = 'ingreso' then mc.motivo || coalesce(' — ' || mc.nota, '') else mc.motivo end,
    'efectivo',
    case mc.tipo when 'ingreso' then mc.monto else -mc.monto end,
    0,
    'manual',
    mc.created_by,
    null::uuid,
    null::uuid,
    null::text
  from public.movimientos_caja mc
  where mc.turno_id = p_turno_id and mc.deleted_at is null

  order by 3 desc;
$function$;
revoke execute on function public.movimientos_turno(uuid) from public, anon;
grant execute on function public.movimientos_turno(uuid) to authenticated, service_role, peludesk_definer;
