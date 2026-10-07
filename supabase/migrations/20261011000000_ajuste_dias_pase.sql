-- Ajustar a mano los días usados de un pase de guardería (day pass /
-- mensualidad), con trazabilidad. 11 de octubre de 2026.
--
-- Qué resuelve: un pase se vende por N días y cada check-in descuenta uno,
-- pero no había forma de (a) dar de alta un pase que ya llevaba días usados
-- (se empezó a usar antes de registrarlo en PeluDesk) ni de (b) corregir
-- después los días usados cuando un check-in se marcó de más, de menos o por
-- error.
--
-- Diseño:
--   * «Días usados» = cantidad_total − cantidad_disponible (ya era así en
--     toda la app: describirBono). Un ajuste mueve cantidad_disponible y deja
--     una fila INMUTABLE en bonos_ajustes (antes/después, fechas, motivo,
--     quién, cuándo). Un ajuste se corrige con otro ajuste.
--   * Un ajuste NO escribe en movimientos_bono (el libro de consumos que
--     alimenta el ingreso reconocido), ni en cobros, caja, cortes, comisiones
--     ni reportes de ingresos: solo mueve el saldo de días. Por eso los
--     reportes pueden distinguir días reales (movimientos_bono) de días
--     ajustados a mano (bonos_ajustes): reporte_dias_pase_periodo.
--   * Alta con días ya usados: comprar_bono(…, p_dias_usados, p_fechas_usados,
--     p_nota_usados). La venta y su cobro son los de siempre; los días usados
--     solo bajan el saldo. Exige el permiso solo si p_dias_usados > 0.
--   * Permiso nuevo «ajustar_pases» (admin siempre; recepción apagado por
--     omisión, por persona). Extender la vigencia de un pase es solo de admin.
--   * Deshacer un check-in (deshacer_checkin_estancia): la estancia vuelve a
--     «reservada», el check-in queda guardado en el ajuste (snapshot) y el día
--     vuelve al pase por el mismo camino de devolución que ya usa cancelar una
--     estancia (devolver_bono_de_item: fila 'devolucion' en el libro, porque
--     la línea estaba cubierta por el pase y deja de estarlo), más la fila de
--     bonos_ajustes con motivo.
--
-- REVERSA (antes de que se use): drop de ajustar_dias_pase,
-- deshacer_checkin_estancia, historial_ajustes_pase, reporte_dias_pase_periodo,
-- pase_fechas_validas y de la tabla bonos_ajustes; volver a poner comprar_bono
-- de 20260923192442 (4 parámetros), tiene_permiso/mis_permisos y el check de
-- permisos_staff sin 'ajustar_pases'; demo_vaciar sin 'bonos_ajustes'. Los
-- pases con saldo ajustado conservan su saldo (no se «des-ajusta» solo): cada
-- fila de bonos_ajustes trae el antes para revertir a mano si hiciera falta.
-- Sin datos que respaldar: la migración no cambia ninguna fila existente.

-- ── 0. Permiso «ajustar_pases» ──────────────────────────────────────

alter table public.permisos_staff drop constraint permisos_staff_permiso_check;
alter table public.permisos_staff add constraint permisos_staff_permiso_check check (permiso in (
  'inventario_costos', 'tarifas', 'reportes_financieros', 'personal',
  'configuracion_negocio', 'excepciones_reserva', 'descuentos_sin_tope',
  'plantillas_contrato', 'nomina', 'gastos', 'reportes_guarderia', 'corregir_estilista',
  'corregir_servicio', 'tarjeta_manual', 'ajustar_pases'
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
    'corregir_servicio', 'tarjeta_manual', 'ajustar_pases'
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

create or replace function public.tiene_permiso(p_permiso text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Nunca NULL: un anónimo o alguien sin membresía da false, no NULL.
  select (
    coalesce(public.is_admin(), false)
    or (
      public.current_rol() = 'recepcion'
      and exists (
        select 1 from public.permisos_staff ps
        where ps.profile_id = auth.uid()
          and ps.negocio_id = public.negocio_actual()
          and ps.permiso = p_permiso
          and ps.revocado_at is null
          and ps.deleted_at is null
      )
    )
  ) and (
    case p_permiso
      when 'reportes_financieros' then public.modulo_activo('reportes')
      when 'nomina' then public.modulo_activo('empleados')
      when 'gastos' then public.modulo_activo('gastos')
      when 'inventario_costos' then public.modulo_activo('inventario')
      when 'plantillas_contrato' then public.modulo_activo('contratos')
      when 'reportes_guarderia' then public.modulo_activo('guarderia') or public.modulo_activo('hotel')
      when 'corregir_estilista' then public.modulo_activo('estetica')
      when 'corregir_servicio' then public.modulo_activo('estetica')
      when 'ajustar_pases' then public.modulo_activo('bonos')
      else true
    end
  );
$$;

-- ── 1. Historial inmutable de ajustes ───────────────────────────────

create table public.bonos_ajustes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  bono_cliente_id uuid not null references public.bonos_clientes(id),
  perro_id uuid not null references public.perros(id),
  origen text not null check (origen in ('alta', 'ajuste', 'deshacer_checkin', 'vigencia')),
  motivo text not null check (motivo in ('checkin_por_error', 'dia_no_registrado', 'uso_previo', 'otro')),
  motivo_texto text,
  usados_antes int not null check (usados_antes >= 0),
  usados_despues int not null check (usados_despues >= 0),
  total int not null check (total >= 1),
  disponibles_antes int not null check (disponibles_antes >= 0),
  disponibles_despues int not null check (disponibles_despues >= 0),
  vencimiento_antes date,
  vencimiento_despues date,
  estado_antes text not null,
  estado_despues text not null,
  -- Los días afectados (los que se agregan o se quitan), si se conocen.
  fechas date[] not null default '{}',
  -- Solo al deshacer un check-in: la estancia y lo que había capturado.
  estancia_id uuid references public.estancias(id),
  checkin_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (motivo <> 'otro' or btrim(coalesce(motivo_texto, '')) <> '')
);

create index bonos_ajustes_negocio_idx on public.bonos_ajustes (negocio_id);
create index bonos_ajustes_bono_idx on public.bonos_ajustes (bono_cliente_id, created_at desc);
create index bonos_ajustes_perro_idx on public.bonos_ajustes (perro_id);
create trigger set_updated_at before insert or update on public.bonos_ajustes
  for each row execute function public.set_updated_at();

create or replace function public.bonos_ajustes_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'El historial de ajustes de pases no se edita: se corrige con otro ajuste.' using errcode = '42501';
end;
$$;
revoke execute on function public.bonos_ajustes_inmutable() from public, anon;
create trigger bonos_ajustes_inmutable before update on public.bonos_ajustes
  for each row execute function public.bonos_ajustes_inmutable();

alter table public.bonos_ajustes enable row level security;
create policy bonos_ajustes_negocio on public.bonos_ajustes
  as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy bonos_ajustes_negocio_definer on public.bonos_ajustes
  for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
create policy bonos_ajustes_escritura_ins on public.bonos_ajustes
  as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.exigir_negocio_escribible()));
create policy bonos_ajustes_escritura_upd on public.bonos_ajustes
  as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy bonos_ajustes_escritura_del on public.bonos_ajustes
  as restrictive for delete to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible()));
-- Leer: el personal (nunca el cliente). Escribir: solo por las funciones de abajo.
create policy bonos_ajustes_select on public.bonos_ajustes
  for select to authenticated using ((select public.is_staff()));
revoke all on public.bonos_ajustes from anon, authenticated;
grant select on public.bonos_ajustes to authenticated;
grant select, insert, update, delete on public.bonos_ajustes to peludesk_definer;

create trigger exigir_modulo before insert or update on public.bonos_ajustes
  for each row execute function public.exigir_modulo_tabla('bonos');

-- ── 2. Validar las fechas de un ajuste ──────────────────────────────
-- Devuelve las fechas sin repetir y ordenadas. Si se dan, tienen que ser
-- tantas como días cambian. Al agregar días usados no pueden ser futuras.

create or replace function public.pase_fechas_validas(p_fechas date[], p_cantidad int, p_no_futuras boolean)
returns date[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_fechas date[];
begin
  select coalesce(array_agg(distinct f order by f), '{}') into v_fechas
  from unnest(coalesce(p_fechas, '{}')) as f
  where f is not null;
  if cardinality(v_fechas) = 0 then
    return v_fechas;
  end if;
  if cardinality(v_fechas) <> p_cantidad then
    raise exception 'Marcaste % fecha(s) pero el ajuste es de % día(s). Deja las fechas vacías o pon exactamente una por día.',
      cardinality(v_fechas), p_cantidad;
  end if;
  if p_no_futuras and v_fechas[cardinality(v_fechas)] > public.fecha_negocio() then
    raise exception 'Un día que ya se usó no puede tener una fecha futura.';
  end if;
  return v_fechas;
end;
$$;
revoke execute on function public.pase_fechas_validas(date[], int, boolean) from public, anon;
grant execute on function public.pase_fechas_validas(date[], int, boolean) to authenticated, service_role;
alter function public.pase_fechas_validas(date[], int, boolean) owner to peludesk_definer;

-- ── 3. Ajustar los días usados de un pase ───────────────────────────

create or replace function public.ajustar_dias_pase(
  p_bono_id uuid,
  p_usados int,
  p_fechas date[],
  p_motivo text,
  p_motivo_texto text default null,
  p_nueva_vigencia date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b record;
  v_hoy date := public.fecha_negocio();
  v_antes int;
  v_disp int;
  v_delta int;
  v_fechas date[];
  v_venc date;
  v_estado_antes text;
  v_estado_despues text;
  v_id uuid;
  v_origen text;
begin
  if not coalesce(public.tiene_permiso('ajustar_pases'), false) then
    raise exception 'No tienes el permiso «Ajustar días de pases». Pídeselo a un admin.' using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in ('checkin_por_error', 'dia_no_registrado', 'uso_previo', 'otro') then
    raise exception 'Elige el motivo del ajuste.';
  end if;
  if p_motivo = 'otro' and btrim(coalesce(p_motivo_texto, '')) = '' then
    raise exception 'Con «Otro», escribe el motivo.';
  end if;
  if p_usados is null then
    raise exception 'Indica cuántos días usados debe llevar el pase.';
  end if;

  select bc.id, bc.perro_id, bc.cantidad_total, bc.cantidad_disponible, bc.fecha_vencimiento
    into v_b
  from public.bonos_clientes bc
  where bc.id = p_bono_id and bc.deleted_at is null
  for update;
  if not found then
    raise exception 'Pase no encontrado.';
  end if;

  v_antes := greatest(v_b.cantidad_total - v_b.cantidad_disponible, 0);
  if p_usados < 0 then
    raise exception 'Los días usados no pueden ser menos de 0.';
  end if;
  if p_usados > v_b.cantidad_total then
    raise exception 'Este pase es de % días: no puede llevar % usados.', v_b.cantidad_total, p_usados;
  end if;

  v_venc := v_b.fecha_vencimiento;
  if p_nueva_vigencia is not null and p_nueva_vigencia is distinct from v_b.fecha_vencimiento then
    if not coalesce(public.is_admin(), false) then
      raise exception 'Solo un admin puede cambiar la vigencia de un pase.' using errcode = '42501';
    end if;
    if p_nueva_vigencia < v_hoy then
      raise exception 'La nueva vigencia no puede ser una fecha pasada.';
    end if;
    v_venc := p_nueva_vigencia;
  end if;

  v_delta := p_usados - v_antes;
  if v_delta = 0 and v_venc is not distinct from v_b.fecha_vencimiento then
    raise exception 'El pase ya lleva % día(s) usados: no hay nada que cambiar.', v_antes;
  end if;
  v_fechas := public.pase_fechas_validas(p_fechas, abs(v_delta), v_delta > 0);
  if v_delta = 0 and cardinality(v_fechas) > 0 then
    raise exception 'Solo cambia la vigencia: no hay fechas de días que marcar.';
  end if;

  v_disp := v_b.cantidad_total - p_usados;
  v_estado_antes := case
    when v_b.cantidad_disponible = 0 then 'agotado'
    when v_b.fecha_vencimiento is not null and v_b.fecha_vencimiento < v_hoy then 'vencido'
    else 'activo' end;
  v_estado_despues := case
    when v_disp = 0 then 'agotado'
    when v_venc is not null and v_venc < v_hoy then 'vencido'
    else 'activo' end;

  update public.bonos_clientes
  set cantidad_disponible = v_disp, fecha_vencimiento = v_venc
  where id = p_bono_id;

  v_origen := case when v_delta = 0 then 'vigencia' else 'ajuste' end;
  insert into public.bonos_ajustes (
    bono_cliente_id, perro_id, origen, motivo, motivo_texto,
    usados_antes, usados_despues, total, disponibles_antes, disponibles_despues,
    vencimiento_antes, vencimiento_despues, estado_antes, estado_despues, fechas
  ) values (
    p_bono_id, v_b.perro_id, v_origen, p_motivo, nullif(btrim(coalesce(p_motivo_texto, '')), ''),
    v_antes, p_usados, v_b.cantidad_total, v_b.cantidad_disponible, v_disp,
    v_b.fecha_vencimiento, v_venc, v_estado_antes, v_estado_despues, v_fechas
  ) returning id into v_id;

  return jsonb_build_object(
    'ajuste_id', v_id,
    'usados_antes', v_antes, 'usados_despues', p_usados,
    'disponibles_antes', v_b.cantidad_disponible, 'disponibles_despues', v_disp,
    'total', v_b.cantidad_total,
    'vencimiento_antes', v_b.fecha_vencimiento, 'vencimiento_despues', v_venc,
    'estado_antes', v_estado_antes, 'estado_despues', v_estado_despues,
    'reabre', (v_estado_antes = 'agotado' and v_disp > 0),
    'sigue_vencido', (v_disp > 0 and v_venc is not null and v_venc < v_hoy)
  );
end;
$$;
alter function public.ajustar_dias_pase(uuid, int, date[], text, text, date) owner to peludesk_definer;
revoke execute on function public.ajustar_dias_pase(uuid, int, date[], text, text, date) from public, anon;
grant execute on function public.ajustar_dias_pase(uuid, int, date[], text, text, date) to authenticated, service_role;

-- ── 4. Vender un pase que ya lleva días usados ──────────────────────
-- Misma venta y mismo cobro de siempre; los días usados solo bajan el saldo.

drop function if exists public.comprar_bono(uuid, uuid, text, jsonb);

create function public.comprar_bono(
  p_perro_id uuid,
  p_servicio_id uuid,
  p_notas text,
  p_metodos jsonb,
  p_dias_usados int default 0,
  p_fechas_usados date[] default null,
  p_nota_usados text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_servicio public.servicios%rowtype;
  v_perro record;
  v_precio numeric;
  v_estado_precio text;
  v_turno_id uuid;
  v_reserva_id uuid;
  v_bono_id uuid;
  v_fecha_compra date;
  v_fecha_vencimiento date;
  v_cantidad int;
  v_usados int := coalesce(p_dias_usados, 0);
  v_fechas date[];
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden vender un bono.';
  end if;

  select * into v_servicio from public.servicios
  where id = p_servicio_id and categoria = 'bono' and deleted_at is null;
  if not found then
    raise exception 'Bono no encontrado en el catálogo.';
  end if;

  select p.id, p.nombre, p.cliente_id, coalesce(p.fallecido, false) as fallecido
    into v_perro
  from public.perros p
  join public.clientes c on c.id = p.cliente_id and c.deleted_at is null
  where p.id = p_perro_id and p.deleted_at is null;
  if not found then
    raise exception 'Elige el perro para el que es el paquete.';
  end if;
  if v_perro.fallecido then
    raise exception 'Este perro está marcado como fallecido: no se le puede vender un paquete.';
  end if;

  if v_usados < 0 then
    raise exception 'Los días que ya lleva usados no pueden ser menos de 0.';
  end if;
  if v_usados > 0 and not coalesce(public.tiene_permiso('ajustar_pases'), false) then
    raise exception 'Registrar un pase con días ya usados requiere el permiso «Ajustar días de pases». Pídeselo a un admin.' using errcode = '42501';
  end if;

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto. Ábrelo antes de vender un bono.';
  end if;

  v_fecha_compra := public.fecha_negocio();

  select precio, estado into v_precio, v_estado_precio
  from public.resolver_precio(p_servicio_id, null, null, 1, v_fecha_compra);

  if v_estado_precio = 'sin_tarifa' then
    raise exception '%', public.describir_precio_faltante(p_servicio_id, null, null, 1, v_fecha_compra);
  elsif v_estado_precio = 'no_aplica' then
    raise exception '%', public.describir_precio_faltante(p_servicio_id, null, null, 1, v_fecha_compra, null, 'no_aplica');
  end if;

  v_fecha_vencimiento := case
    when v_servicio.vigencia_dias is not null then v_fecha_compra + v_servicio.vigencia_dias
    else null
  end;

  if v_servicio.ilimitado then
    -- Días que abre guardería en la vigencia (horario_semana): el máximo
    -- de veces que físicamente se puede consumir.
    v_cantidad := greatest(1, public.dias_que_abre_guarderia(v_fecha_compra, v_fecha_vencimiento));
  else
    v_cantidad := v_servicio.cantidad_incluida;
  end if;

  if v_usados > v_cantidad then
    raise exception 'Este paquete es de % días: no puede empezar con % ya usados.', v_cantidad, v_usados;
  end if;
  v_fechas := public.pase_fechas_validas(p_fechas_usados, v_usados, true);
  if v_usados = 0 and cardinality(v_fechas) > 0 then
    raise exception 'Pusiste fechas de días usados pero indicaste 0 días.';
  end if;

  insert into public.reservas (cliente_id, notas)
  values (v_perro.cliente_id, 'Compra de bono: ' || v_servicio.nombre || ' para ' || v_perro.nombre)
  returning id into v_reserva_id;

  insert into public.bonos_clientes (
    cliente_id, perro_id, servicio_id, reserva_id, cantidad_total, cantidad_disponible,
    precio_pagado, fecha_compra, fecha_vencimiento, ilimitado
  )
  values (
    v_perro.cliente_id, v_perro.id, p_servicio_id, v_reserva_id, v_cantidad, v_cantidad - v_usados,
    v_precio, v_fecha_compra, v_fecha_vencimiento, v_servicio.ilimitado
  )
  returning id into v_bono_id;

  insert into public.movimientos_bono (bono_cliente_id, tipo, cantidad, monto, turno_id, created_by)
  values (v_bono_id, 'venta', v_cantidad, v_precio, v_turno_id, auth.uid());

  if v_usados > 0 then
    insert into public.bonos_ajustes (
      bono_cliente_id, perro_id, origen, motivo, motivo_texto,
      usados_antes, usados_despues, total, disponibles_antes, disponibles_despues,
      vencimiento_antes, vencimiento_despues, estado_antes, estado_despues, fechas
    ) values (
      v_bono_id, v_perro.id, 'alta', 'uso_previo', nullif(btrim(coalesce(p_nota_usados, '')), ''),
      0, v_usados, v_cantidad, v_cantidad, v_cantidad - v_usados,
      v_fecha_vencimiento, v_fecha_vencimiento, 'activo',
      case when v_usados = v_cantidad then 'agotado' else 'activo' end, v_fechas
    );
  end if;

  perform public.registrar_cobro(v_reserva_id, p_notas, p_metodos);

  return v_bono_id;
end;
$$;
alter function public.comprar_bono(uuid, uuid, text, jsonb, int, date[], text) owner to peludesk_definer;
revoke execute on function public.comprar_bono(uuid, uuid, text, jsonb, int, date[], text) from public, anon;
grant execute on function public.comprar_bono(uuid, uuid, text, jsonb, int, date[], text) to authenticated, service_role;

-- ── 5. Deshacer un check-in hecho por error ─────────────────────────

create or replace function public.deshacer_checkin_estancia(
  p_estancia_id uuid,
  p_motivo text,
  p_motivo_texto text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e record;
  v_b record;
  v_ids uuid[] := '{}';
  v_snapshot jsonb;
  v_hoy date := public.fecha_negocio();
  v_disp_despues int;
  v_devolucion jsonb;
  v_devueltos int := 0;
begin
  if not coalesce(public.tiene_permiso('ajustar_pases'), false) then
    raise exception 'No tienes el permiso «Ajustar días de pases». Pídeselo a un admin.' using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in ('checkin_por_error', 'dia_no_registrado', 'uso_previo', 'otro') then
    raise exception 'Elige el motivo.';
  end if;
  if p_motivo = 'otro' and btrim(coalesce(p_motivo_texto, '')) = '' then
    raise exception 'Con «Otro», escribe el motivo.';
  end if;

  select e.id, e.perro_id, e.estado, e.fecha_entrada, e.hora_entrada_real, e.entregado_por_nombre,
         e.entregado_por_telefono, e.estado_llegada, e.foto_llegada_path
    into v_e
  from public.estancias e
  where e.id = p_estancia_id and e.deleted_at is null
  for update;
  if not found then
    raise exception 'Estancia no encontrada.';
  end if;
  if v_e.estado <> 'en_curso' then
    raise exception 'Solo se deshace el check-in de un perro que está adentro (en curso).';
  end if;

  -- Los pases que cubren esta estancia (consumos menos devoluciones).
  for v_b in
    select mb.bono_cliente_id as id,
           sum(case mb.tipo when 'consumo' then mb.cantidad else -mb.cantidad end)::int as neto
    from public.movimientos_bono mb
    where mb.item_tipo = 'estancia' and mb.item_id = p_estancia_id and mb.tipo in ('consumo', 'devolucion')
    group by mb.bono_cliente_id
    having sum(case mb.tipo when 'consumo' then mb.cantidad else -mb.cantidad end) > 0
  loop
    v_ids := array_append(v_ids, v_b.id);
  end loop;
  if cardinality(v_ids) = 0 then
    raise exception 'Este check-in no usó un pase, así que no hay un día que devolver. Si fue por error, cancela la estancia o márcala «no llegó».';
  end if;

  v_snapshot := jsonb_build_object(
    'estado_anterior', v_e.estado,
    'hora_entrada_real', v_e.hora_entrada_real,
    'entregado_por_nombre', v_e.entregado_por_nombre,
    'entregado_por_telefono', v_e.entregado_por_telefono,
    'estado_llegada', v_e.estado_llegada,
    'foto_llegada_path', v_e.foto_llegada_path,
    'fecha_entrada', v_e.fecha_entrada
  );

  -- Antes de devolver: no se devuelve a un pase vencido (la devolución se
  -- salta sola; aquí se avisa antes de tocar nada).
  for v_b in
    select bc.id, bc.fecha_vencimiento from public.bonos_clientes bc where bc.id = any (v_ids)
  loop
    if v_b.fecha_vencimiento is not null and v_b.fecha_vencimiento < v_hoy then
      raise exception 'El pase venció el %: el día no se puede devolver. Un admin puede extender su vigencia con «Ajustar días usados» y luego repetir esto.', v_b.fecha_vencimiento;
    end if;
  end loop;

  declare
    v_pase record;
    v_antes jsonb := '[]'::jsonb;
  begin
    for v_pase in
      select bc.id, bc.perro_id, bc.cantidad_total, bc.cantidad_disponible, bc.fecha_vencimiento
      from public.bonos_clientes bc where bc.id = any (v_ids) for update
    loop
      v_antes := v_antes || jsonb_build_object(
        'id', v_pase.id, 'perro_id', v_pase.perro_id, 'total', v_pase.cantidad_total,
        'disp', v_pase.cantidad_disponible, 'venc', v_pase.fecha_vencimiento);
    end loop;

    -- El día vuelve al pase por el camino que ya usa cancelar una estancia.
    v_devolucion := public.devolver_bono_de_item(
      'estancia', p_estancia_id, 'Check-in deshecho: ' ||
      case p_motivo when 'checkin_por_error' then 'check-in marcado por error'
                    when 'dia_no_registrado' then 'día no registrado'
                    when 'uso_previo' then 'uso previo a PeluDesk'
                    else btrim(p_motivo_texto) end);
    v_devueltos := coalesce((v_devolucion ->> 'devueltos')::int, 0);

    for v_pase in
      select (x ->> 'id')::uuid as id, (x ->> 'perro_id')::uuid as perro_id, (x ->> 'total')::int as total,
             (x ->> 'disp')::int as disp, (x ->> 'venc')::date as venc
      from jsonb_array_elements(v_antes) x
    loop
      select cantidad_disponible into v_disp_despues from public.bonos_clientes where id = v_pase.id;
      insert into public.bonos_ajustes (
        bono_cliente_id, perro_id, origen, motivo, motivo_texto,
        usados_antes, usados_despues, total, disponibles_antes, disponibles_despues,
        vencimiento_antes, vencimiento_despues, estado_antes, estado_despues, fechas,
        estancia_id, checkin_snapshot
      ) values (
        v_pase.id, v_pase.perro_id, 'deshacer_checkin', p_motivo, nullif(btrim(coalesce(p_motivo_texto, '')), ''),
        greatest(v_pase.total - v_pase.disp, 0), greatest(v_pase.total - v_disp_despues, 0), v_pase.total,
        v_pase.disp, v_disp_despues, v_pase.venc, v_pase.venc,
        case when v_pase.disp = 0 then 'agotado' else 'activo' end,
        case when v_disp_despues = 0 then 'agotado' else 'activo' end,
        array[v_e.fecha_entrada], p_estancia_id, v_snapshot
      );
    end loop;
  end;

  -- El check-in vuelve a empezar; lo que se capturó queda en el snapshot.
  update public.estancias
  set estado = 'reservada', hora_entrada_real = null
  where id = p_estancia_id;

  return jsonb_build_object('devueltos', v_devueltos, 'estancia_id', p_estancia_id, 'devolucion', v_devolucion);
end;
$$;
alter function public.deshacer_checkin_estancia(uuid, text, text) owner to peludesk_definer;
revoke execute on function public.deshacer_checkin_estancia(uuid, text, text) from public, anon;
grant execute on function public.deshacer_checkin_estancia(uuid, text, text) to authenticated, service_role;

-- ── 6. Historial de un pase ─────────────────────────────────────────

create or replace function public.historial_ajustes_pase(p_bono_id uuid)
returns table (
  id uuid, cuando timestamptz, origen text, motivo text, motivo_texto text,
  usados_antes int, usados_despues int, total int,
  disponibles_antes int, disponibles_despues int,
  vencimiento_antes date, vencimiento_despues date,
  fechas date[], estancia_id uuid, por_nombre text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.created_at, a.origen, a.motivo, a.motivo_texto,
    a.usados_antes, a.usados_despues, a.total, a.disponibles_antes, a.disponibles_despues,
    a.vencimiento_antes, a.vencimiento_despues, a.fechas, a.estancia_id,
    coalesce(nullif(btrim(h.nombre_completo), ''), 'Alguien del equipo')
  from public.bonos_ajustes a
  left join public.profiles h on h.id = a.created_by
  where a.bono_cliente_id = p_bono_id and a.deleted_at is null
    and a.negocio_id = public.negocio_actual()
    and coalesce(public.is_staff(), false)
  order by a.created_at desc;
$$;
alter function public.historial_ajustes_pase(uuid) owner to peludesk_definer;
revoke execute on function public.historial_ajustes_pase(uuid) from public, anon;
grant execute on function public.historial_ajustes_pase(uuid) to authenticated, service_role;

-- ── 7. Reporte: días reales vs ajustados a mano ─────────────────────
-- Reales = lo que cubrieron las estancias (libro de consumos, neto de
-- devoluciones). Ajustados = lo que se movió a mano (bonos_ajustes), aparte.

create or replace function public.reporte_dias_pase_periodo(p_desde date, p_hasta date)
returns table (
  dias_reales bigint,
  dias_ajustados_mas bigint,
  dias_ajustados_menos bigint,
  dias_uso_previo bigint,
  ajustes bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.tiene_permiso('reportes_financieros'), false) then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes financieros», puede ver reportes.';
  end if;
  return query
  select
    (select coalesce(sum(case mb.tipo when 'consumo' then mb.cantidad when 'devolucion' then -mb.cantidad else 0 end), 0)
       from public.movimientos_bono mb
      where mb.tipo in ('consumo', 'devolucion') and mb.item_tipo = 'estancia'
        and public.fecha_negocio(mb.created_at) between p_desde and p_hasta)::bigint,
    (select coalesce(sum(a.usados_despues - a.usados_antes) filter (where a.origen <> 'alta' and a.usados_despues > a.usados_antes), 0)
       from public.bonos_ajustes a
      where a.deleted_at is null and public.fecha_negocio(a.created_at) between p_desde and p_hasta)::bigint,
    (select coalesce(sum(a.usados_antes - a.usados_despues) filter (where a.usados_despues < a.usados_antes), 0)
       from public.bonos_ajustes a
      where a.deleted_at is null and public.fecha_negocio(a.created_at) between p_desde and p_hasta)::bigint,
    (select coalesce(sum(a.usados_despues - a.usados_antes) filter (where a.origen = 'alta'), 0)
       from public.bonos_ajustes a
      where a.deleted_at is null and public.fecha_negocio(a.created_at) between p_desde and p_hasta)::bigint,
    (select count(*) from public.bonos_ajustes a
      where a.deleted_at is null and public.fecha_negocio(a.created_at) between p_desde and p_hasta)::bigint;
end;
$$;
alter function public.reporte_dias_pase_periodo(date, date) owner to peludesk_definer;
revoke execute on function public.reporte_dias_pase_periodo(date, date) from public, anon;
grant execute on function public.reporte_dias_pase_periodo(date, date) to authenticated, service_role;

-- ── 8. El demo se vacía también con la tabla nueva ──────────────────
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
    'cargos_aplicados', 'categorias_insumo', 'citas_estetica', 'clientes', 'cobro_metodos', 'cobros',
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
