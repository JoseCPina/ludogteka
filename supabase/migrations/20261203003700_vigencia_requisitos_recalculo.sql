-- Vigencia de un requisito sanitario: el vencimiento de cada aplicación sale SIEMPRE de la vigencia vigente del negocio
-- (4 de noviembre de 2026; operación A4 en Ludogteka, docs/OPERACIONES-PRODUCCION.md).
-- Antes, cada aplicación guardaba la vigencia con la que se capturó (vigencia_meses_aplicado) y fecha_vencimiento es una
-- columna generada de ahí: al subir Bordetella de 6 a 12 meses, las cartillas ya registradas seguían venciendo a 6 y los
-- perros aparecían como «no se puede agendar». Ahora:
--   1. al cambiar vigencia_meses de un tipo, un disparador recalcula sus aplicaciones vivas (del mismo negocio);
--   2. guardar_requisitos_estancia devuelve cuántas cartillas cambiaron, para decirlo en pantalla;
--   3. una pasada única empareja lo que ya estaba desfasado en TODOS los negocios (misma regla, sin excepciones).
-- Solo agrega y corrige datos derivados; la fecha de aplicación y el comprobante no se tocan.

-- ── 1. Disparador: cambia la vigencia del tipo → cambian sus aplicaciones ───────────────────────────────────────────
create or replace function public.requisito_vigencia_recalcular()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.vigencia_meses is distinct from old.vigencia_meses then
    update public.requisitos_sanitarios_aplicados a
    set vigencia_meses_aplicado = new.vigencia_meses
    where a.tipo_requisito_id = new.id
      and a.negocio_id = new.negocio_id
      and a.deleted_at is null
      and a.anulado_at is null
      and a.vigencia_meses_aplicado is distinct from new.vigencia_meses;
  end if;
  return new;
end;
$$;
alter function public.requisito_vigencia_recalcular() owner to peludesk_definer;
revoke execute on function public.requisito_vigencia_recalcular() from public, anon, authenticated;
drop trigger if exists tipos_requisito_vigencia_recalcular on public.tipos_requisito_sanitario;
create trigger tipos_requisito_vigencia_recalcular
  after update of vigencia_meses on public.tipos_requisito_sanitario
  for each row execute function public.requisito_vigencia_recalcular();
comment on function public.requisito_vigencia_recalcular() is
  'Al cambiar la vigencia de un requisito sanitario, el vencimiento de sus aplicaciones vivas se recalcula con la vigencia nueva (fecha de aplicación + vigencia).';

-- ── 2. guardar_requisitos_estancia dice cuántas cartillas cambiaron ───────────────────────────────────────────────
drop function if exists public.guardar_requisitos_estancia(boolean, uuid[], jsonb);
create or replace function public.guardar_requisitos_estancia(
  p_exige_evaluacion boolean,
  p_obligatorias uuid[],
  p_vigencias jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_tipo record;
  v_meses int;
  v_recalculadas int := 0;
  v_n int;
  v_detalle jsonb := '[]'::jsonb;
begin
  if not coalesce(public.tiene_permiso('configuracion_negocio'), false) then
    raise exception 'Solo un admin, o quien tenga el permiso «Configuración del negocio», cambia los requisitos para hospedar.' using errcode = '42501';
  end if;
  if p_exige_evaluacion is null then
    raise exception 'Indica si la evaluación de comportamiento es requisito.';
  end if;
  for v_tipo in
    select t.id, t.etiqueta, t.vigencia_meses from public.tipos_requisito_sanitario t
    where t.negocio_id = public.negocio_actual() and t.deleted_at is null
  loop
    v_meses := v_tipo.vigencia_meses;
    if p_vigencias ? v_tipo.id::text then
      begin
        v_meses := (p_vigencias ->> v_tipo.id::text)::int;
      exception when others then
        raise exception 'La vigencia de % tiene que ser un número de meses.', v_tipo.etiqueta;
      end;
      if v_meses is null or v_meses < 1 or v_meses > 60 then
        raise exception 'La vigencia de % va de 1 a 60 meses.', v_tipo.etiqueta;
      end if;
    end if;
    -- Cuántas cartillas va a mover el disparador (antes de actualizar el tipo).
    v_n := 0;
    if v_meses is distinct from v_tipo.vigencia_meses then
      select count(*) into v_n from public.requisitos_sanitarios_aplicados a
      where a.tipo_requisito_id = v_tipo.id and a.negocio_id = public.negocio_actual()
        and a.deleted_at is null and a.anulado_at is null and a.vigencia_meses_aplicado is distinct from v_meses;
    end if;
    update public.tipos_requisito_sanitario
    set obligatoria = (v_tipo.id = any (coalesce(p_obligatorias, '{}'::uuid[]))),
        vigencia_meses = v_meses
    where id = v_tipo.id
      and (obligatoria is distinct from (v_tipo.id = any (coalesce(p_obligatorias, '{}'::uuid[]))) or vigencia_meses is distinct from v_meses);
    if v_n > 0 then
      v_recalculadas := v_recalculadas + v_n;
      v_detalle := v_detalle || jsonb_build_object('etiqueta', v_tipo.etiqueta, 'de', v_tipo.vigencia_meses, 'a', v_meses, 'cartillas', v_n);
    end if;
  end loop;
  v_id := public._ajustes_operacion_id();
  update public.negocio_ajustes_operacion
  set exige_evaluacion_comportamiento = p_exige_evaluacion,
      requisitos_revisados_at = now(),
      requisitos_revisados_por = auth.uid()
  where id = v_id;
  return jsonb_build_object('recalculadas', v_recalculadas, 'detalle', v_detalle);
end;
$$;
alter function public.guardar_requisitos_estancia(boolean, uuid[], jsonb) owner to peludesk_definer;
revoke execute on function public.guardar_requisitos_estancia(boolean, uuid[], jsonb) from public, anon;
grant execute on function public.guardar_requisitos_estancia(boolean, uuid[], jsonb) to authenticated, service_role;
comment on function public.guardar_requisitos_estancia(boolean, uuid[], jsonb) is
  'Requisitos para hospedar (evaluación, obligatorias, vigencias). Devuelve {recalculadas, detalle}: cuántas cartillas cambiaron de vencimiento al cambiar una vigencia.';

-- ── 3. Pasada única: lo que ya estaba desfasado, en todos los negocios ────────────────────────────────────────────
do $$
declare v_n int;
begin
  update public.requisitos_sanitarios_aplicados a
  set vigencia_meses_aplicado = t.vigencia_meses
  from public.tipos_requisito_sanitario t
  where t.id = a.tipo_requisito_id
    and t.negocio_id = a.negocio_id
    and t.deleted_at is null
    and a.deleted_at is null
    and a.anulado_at is null
    and a.vigencia_meses_aplicado is distinct from t.vigencia_meses;
  get diagnostics v_n = row_count;
  raise notice 'vigencia_requisitos_recalculo: % aplicaciones emparejadas con la vigencia vigente de su tipo.', v_n;
end $$;
