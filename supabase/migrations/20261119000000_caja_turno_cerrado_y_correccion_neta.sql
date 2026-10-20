-- Caja (QA S17, 19 de octubre de 2026): N81 y N48.
--
-- N81 — Anular (o corregir el monto de) un cobro de un turno YA CERRADO restaba
-- ese dinero del turno ABIERTO: el renglón compensatorio caía en el turno abierto
-- y su efectivo esperado quedaba en negativo aunque del cajón no salió nada.
-- AHORA el renglón compensatorio queda ligado al TURNO ORIGINAL como ajuste
-- posterior al corte (turno_efecto_id = el turno del cobro, fecha_efecto = hoy,
-- con quién y cuándo en cobro_correcciones). El corte guardado de ese turno no
-- cambia y el esperado del turno abierto tampoco. Ya no hace falta un turno
-- abierto para anular un cobro de un turno cerrado. Si de verdad se devuelve
-- efectivo del cajón, la pantalla lo pregunta y registra un RETIRO con motivo en
-- el turno abierto (registrar_retiro, que ya existía).
--
-- N48 — Cada corrección de precio agregaba una línea más («Corrección de precio»)
-- que nunca se podía quitar. AHORA una línea tiene a lo más UNA corrección
-- vigente, con el ajuste NETO contra su precio original: corregir otra vez
-- reemplaza la anterior (queda en el historial con `reemplazada_por`), volver al
-- precio original solo da de baja la vigente, y una corrección se anula con
-- motivo (anular_correccion_precio). Las correcciones que ya se habían
-- acumulado se consolidan en una sola por línea con la MISMA suma (el total y el
-- saldo de cada cuenta no cambian).
--
-- REVERSA: volver a poner cobro_correccion_validar, anular_cobro,
-- editar_monto_cobro y corregir_precio_cuenta de 20261013000000; las columnas
-- nuevas pueden quedarse. La consolidación se deshace con las filas dadas de
-- baja con motivo «Consolidada…» (deleted_at y reemplazada_por).

-- ── 1. Columnas de la corrección de precio ───────────────────────────────
alter table public.cuenta_ajustes_precio
  add column precio_original numeric(12, 2),
  add column reemplazada_por uuid references public.cuenta_ajustes_precio(id),
  add column anulada_por uuid references auth.users(id) on delete set null,
  add column anulada_motivo text;

update public.cuenta_ajustes_precio a set precio_original = a.precio_antes where a.precio_original is null;

-- Consolidación: una sola corrección vigente por línea, con la suma de todas.
do $$
declare
  g record;
  v_ultimo uuid;
  v_primera numeric;
begin
  for g in
    select a.negocio_id, a.reserva_id, a.linea_tipo, a.linea_id, sum(a.monto) as neto, count(*) as n
    from public.cuenta_ajustes_precio a
    where a.deleted_at is null
    group by 1, 2, 3, 4
    having count(*) > 1
  loop
    select a.id into v_ultimo from public.cuenta_ajustes_precio a
    where a.reserva_id = g.reserva_id and a.linea_tipo = g.linea_tipo and a.linea_id = g.linea_id and a.deleted_at is null
    order by a.created_at desc, a.id desc limit 1;
    select a.precio_antes into v_primera from public.cuenta_ajustes_precio a
    where a.reserva_id = g.reserva_id and a.linea_tipo = g.linea_tipo and a.linea_id = g.linea_id and a.deleted_at is null
    order by a.created_at, a.id limit 1;
    update public.cuenta_ajustes_precio a
    set deleted_at = now(), reemplazada_por = case when g.neto = 0 then null else v_ultimo end,
        anulada_motivo = case when g.neto = 0 then 'Consolidada: la corrección neta de la línea quedó en cero.' else 'Consolidada en la corrección vigente de la línea.' end
    where a.reserva_id = g.reserva_id and a.linea_tipo = g.linea_tipo and a.linea_id = g.linea_id and a.deleted_at is null
      and (g.neto = 0 or a.id <> v_ultimo);
    if g.neto <> 0 then
      update public.cuenta_ajustes_precio a
      set monto = g.neto, precio_original = v_primera, precio_antes = v_primera
      where a.id = v_ultimo;
    end if;
  end loop;
end $$;

create unique index cuenta_ajustes_precio_una_vigente
  on public.cuenta_ajustes_precio (reserva_id, linea_tipo, linea_id) where deleted_at is null;

-- ── 2. N81: la corrección de un turno cerrado se queda en ese turno ─────
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
  if v_cerrado and not coalesce(public.tiene_permiso('corregir_turnos_cerrados'), false) then
    raise exception 'Este cobro es de un turno que ya se cerró. Corregirlo requiere el permiso «Corregir cobros de turnos cerrados» (Administración → Permisos); queda como ajuste posterior al corte de ese turno.' using errcode = '42501';
  end if;
  if not v_cerrado and v_abierto is null then
    raise exception 'No hay turno de caja abierto.';
  end if;
  -- `turno_abierto` es donde cae el renglón compensatorio: el mismo turno del
  -- cobro, abierto o cerrado (ajuste posterior al corte). El turno abierto de hoy
  -- no cambia: si se devuelve efectivo del cajón, eso es un retiro aparte.
  return jsonb_build_object(
    'reserva_id', c.reserva_id, 'turno_id', c.turno_id, 'turno_abierto', c.turno_id, 'turno_cerrado', v_cerrado,
    'turno_hoy', v_abierto,
    'grupo_id', c.grupo_id, 'origen', coalesce(c.origen, 'manual'), 'creado_at', c.created_at, 'creado_por', c.created_by, 'notas', c.notas);
end;
$$;
alter function public.cobro_correccion_validar(uuid, text, boolean) owner to peludesk_definer;
revoke execute on function public.cobro_correccion_validar(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.cobro_correccion_validar(uuid, text, boolean) to service_role;

-- ── 3. N48: corrección de precio neta, reemplazable y anulable ───────────
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
  v_vigente public.cuenta_ajustes_precio%rowtype;
  v_hay boolean;
  v_original numeric;
  v_actual numeric;
  v_neto numeric;
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
  perform 1 from public.reservas r where r.id = p_reserva_id and r.negocio_id = public.negocio_actual() and r.deleted_at is null for update;
  if not found then
    raise exception 'Cuenta no encontrada.';
  end if;
  select l.descripcion, l.total into v_linea
  from public.cuenta_lineas_reserva(p_reserva_id) l
  where l.tipo = p_linea_tipo and l.origen_id = p_linea_id;
  if not found then
    raise exception 'No encontramos esa línea en la cuenta.';
  end if;
  if exists (
    select 1 from public.movimientos_bono mb
    where mb.item_id = p_linea_id and mb.tipo in ('consumo', 'devolucion')
    having coalesce(sum(case mb.tipo when 'consumo' then mb.cantidad else -mb.cantidad end), 0) > 0
  ) then
    raise exception 'Esta línea está cubierta con un pase: su precio no se corrige aquí.';
  end if;

  select * into v_vigente from public.cuenta_ajustes_precio a
  where a.reserva_id = p_reserva_id and a.linea_tipo = p_linea_tipo and a.linea_id = p_linea_id and a.deleted_at is null
  for update;
  v_hay := found;
  v_original := v_linea.total;
  v_actual := v_original + case when v_hay then v_vigente.monto else 0 end;
  if round(p_precio_nuevo - v_actual, 2) = 0 then
    raise exception 'Ese ya es el precio de la línea.';
  end if;
  v_neto := round(p_precio_nuevo - v_original, 2);

  select t.id into v_turno from public.turnos_caja t where t.estado = 'abierto' limit 1;
  if v_neto <> 0 then
    if v_hay then
      update public.cuenta_ajustes_precio set deleted_at = now(), anulada_por = auth.uid(), anulada_motivo = 'Reemplazada por otra corrección: ' || v_motivo
      where id = v_vigente.id;
    end if;
    insert into public.cuenta_ajustes_precio (reserva_id, linea_tipo, linea_id, concepto, monto, precio_antes, precio_despues, precio_original, motivo, turno_id)
    values (p_reserva_id, p_linea_tipo, p_linea_id, v_linea.descripcion, v_neto, v_actual, p_precio_nuevo, v_original, v_motivo, v_turno)
    returning id into v_id;
    if v_hay then
      update public.cuenta_ajustes_precio set reemplazada_por = v_id where id = v_vigente.id;
    end if;
  else
    -- De vuelta al precio original: la corrección vigente se da de baja con este motivo.
    update public.cuenta_ajustes_precio set deleted_at = now(), anulada_por = auth.uid(), anulada_motivo = 'Regresó al precio original: ' || v_motivo
    where id = v_vigente.id;
  end if;

  select t.saldo into v_saldo from public.cuenta_totales_reserva(p_reserva_id) t;
  if v_saldo > 0 and v_saldo < 1 then
    raise exception 'Con ese precio la cuenta se quedaría debiendo $% (menos de un peso). Ajusta el precio para que quede pagada completa o con un saldo de un peso o más.', v_saldo;
  end if;
  return jsonb_build_object('ajuste_id', v_id, 'reserva_id', p_reserva_id, 'linea', v_linea.descripcion,
    'precio_antes', v_actual, 'precio_despues', p_precio_nuevo, 'precio_original', v_original, 'diferencia', p_precio_nuevo - v_actual, 'saldo', v_saldo);
end;
$$;
alter function public.corregir_precio_cuenta(uuid, text, uuid, numeric, text) owner to peludesk_definer;
revoke execute on function public.corregir_precio_cuenta(uuid, text, uuid, numeric, text) from public, anon;
grant execute on function public.corregir_precio_cuenta(uuid, text, uuid, numeric, text) to authenticated, service_role;

-- Anular la corrección vigente de una línea: la línea vuelve a su precio original.
create or replace function public.anular_correccion_precio(p_ajuste_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := btrim(coalesce(p_motivo, ''));
  a public.cuenta_ajustes_precio%rowtype;
  v_saldo numeric;
begin
  if not coalesce(public.tiene_permiso('editar_monto_cobros'), false) then
    raise exception 'No tienes el permiso «Editar monto de cobros». Pídeselo a un admin (Administración → Permisos).' using errcode = '42501';
  end if;
  if char_length(v_motivo) < 5 then
    raise exception 'Escribe el motivo de la anulación (qué pasó).';
  end if;
  select * into a from public.cuenta_ajustes_precio x
  where x.id = p_ajuste_id and x.negocio_id = public.negocio_actual() for update;
  if not found then
    raise exception 'Corrección no encontrada.';
  end if;
  if a.deleted_at is not null then
    raise exception 'Esta corrección ya no está vigente.';
  end if;
  update public.cuenta_ajustes_precio set deleted_at = now(), anulada_por = auth.uid(), anulada_motivo = v_motivo where id = a.id;
  select t.saldo into v_saldo from public.cuenta_totales_reserva(a.reserva_id) t;
  if v_saldo > 0 and v_saldo < 1 then
    raise exception 'Al anularla la cuenta se quedaría debiendo $% (menos de un peso).', v_saldo;
  end if;
  return jsonb_build_object('ajuste_id', a.id, 'reserva_id', a.reserva_id, 'precio_original', coalesce(a.precio_original, a.precio_antes), 'saldo', v_saldo);
end;
$$;
alter function public.anular_correccion_precio(uuid, text) owner to peludesk_definer;
revoke execute on function public.anular_correccion_precio(uuid, text) from public, anon;
grant execute on function public.anular_correccion_precio(uuid, text) to authenticated, service_role;
