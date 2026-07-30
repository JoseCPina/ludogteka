-- Única función para cerrar un turno — dos fases con la MISMA llamada,
-- para que el conteo ciego sea real y no solo un detalle de la pantalla:
--
--   Fase 1 (sin explicación): el cajero manda su conteo de los tres
--   métodos. La función calcula esperado/diferencia del ledger de ESTE
--   turno, pero si hay alguna diferencia y no vino explicación, NO
--   escribe nada — regresa cerrado=false junto con esperado/diferencia
--   para que la pantalla los muestre recién AHORA (después de que el
--   conteo ya quedó fijo) y pida el motivo.
--
--   Fase 2 (con explicación): la pantalla vuelve a llamar con el MISMO
--   conteo más la explicación ya escrita. Como ya hay explicación,
--   procede a insertar el corte y cerrar el turno de verdad.
--
-- Si las tres diferencias dan cero, cierra directo en la fase 1 — no
-- tiene sentido pedir explicación de una diferencia que no existe.
--
-- esperado_efectivo incluye fondo_inicial y resta los retiros del turno
-- (movimientos_caja) — es la única bolsa con dinero físico. Terminal y
-- transferencia no tienen fondo ni retiros: su "esperado" es
-- estrictamente lo que pasó por cobros/devoluciones de este turno,
-- reconciliable contra el reporte de la terminal o el estado de cuenta.
-- Propina cuenta en los tres: es dinero real que de verdad se movió por
-- ese método (efectivo en el cajón, terminal en el lote de la terminal).
create or replace function public.cerrar_turno(
  p_turno_id uuid,
  p_conteo_efectivo numeric,
  p_conteo_terminal numeric,
  p_conteo_transferencia numeric,
  p_explicacion_diferencias text,
  p_notas_cierre text
)
returns table (
  cerrado boolean,
  corte_id uuid,
  esperado_efectivo numeric,
  esperado_terminal numeric,
  esperado_transferencia numeric,
  diferencia_efectivo numeric,
  diferencia_terminal numeric,
  diferencia_transferencia numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja%rowtype;
  v_esperado_efectivo numeric;
  v_esperado_terminal numeric;
  v_esperado_transferencia numeric;
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
      where c.turno_id = p_turno_id and cm.metodo = 'efectivo'
    ), 0)
    - coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm
      join public.devoluciones d on d.id = dm.devolucion_id
      where d.turno_id = p_turno_id and dm.metodo = 'efectivo'
    ), 0)
    - coalesce((select sum(monto) from public.movimientos_caja where turno_id = p_turno_id), 0);

  v_esperado_terminal := coalesce((
      select sum(cm.monto + cm.propina) from public.cobro_metodos cm
      join public.cobros c on c.id = cm.cobro_id
      where c.turno_id = p_turno_id and cm.metodo = 'terminal'
    ), 0)
    - coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm
      join public.devoluciones d on d.id = dm.devolucion_id
      where d.turno_id = p_turno_id and dm.metodo = 'terminal'
    ), 0);

  v_esperado_transferencia := coalesce((
      select sum(cm.monto + cm.propina) from public.cobro_metodos cm
      join public.cobros c on c.id = cm.cobro_id
      where c.turno_id = p_turno_id and cm.metodo = 'transferencia'
    ), 0)
    - coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm
      join public.devoluciones d on d.id = dm.devolucion_id
      where d.turno_id = p_turno_id and dm.metodo = 'transferencia'
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
    (v_corte_id, 'transferencia', p_conteo_transferencia, v_esperado_transferencia, v_diferencia_transferencia, auth.uid());

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
$$;

revoke execute on function public.cerrar_turno(uuid, numeric, numeric, numeric, text, text) from public;
grant execute on function public.cerrar_turno(uuid, numeric, numeric, numeric, text, text) to authenticated;
