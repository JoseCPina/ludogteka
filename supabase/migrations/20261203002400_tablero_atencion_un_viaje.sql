-- Tiempo del panel, quinta vuelta (fix/layout-cascaron, 3 de noviembre de 2026; docs/rendimiento-panel.md).
-- «Necesita atención» del tablero (Recepción e Inicio) pedía ~20 consultas y funciones por separado (razas sin grupo,
-- gastos, alertas clínicas, fallos de WhatsApp, recordatorios, reembolsos, conciliación, tarjetas manuales, ajustes de
-- servicio, estado del cobro, CFDI, bajas, evaluación…): cada una es una petición HTTP a la API con su propio viaje y su
-- propia conexión. tablero_atencion() las junta en tres grupos, con las MISMAS reglas que tenía la pantalla para pedir cada
-- una (rol, permiso por persona y módulo prendido) y sin definer: corre con la RLS de quien llama, igual que antes.
-- Devuelve un jsonb (sin el tope de 1,000 filas de la API, regla 4 del límite de filas).
-- Cada pieza va en su propio bloque: si una falla, se pierde esa (como cuando eran consultas separadas) y se dice en
-- `fallos`, sin tumbar las demás.
-- Tres grupos (`p_grupo`): «general», «dinero» (admin: tarjetas manuales y cobro) y «clinica» (Veterinaria). La pantalla
-- pide los que le tocan A LA VEZ: juntas en serie, las piezas suman sus tiempos (la de inventario clínico sola tarda
-- ~400 ms en desarrollo) y el tablero esperaría más que con las consultas en paralelo. Sin grupo, todas.
-- Volátil (no `stable`): gastos_por_atender() genera los gastos esperados al leerse.
drop function if exists public.tablero_atencion();
create or replace function public.tablero_atencion(p_grupo text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_rol text := coalesce(public.current_rol(), 'anonimo');
  v_personal boolean := v_rol in ('admin', 'recepcion');
  v_vet boolean := coalesce(public.modulo_activo('veterinaria'), false);
  r jsonb := '{}'::jsonb;
  v_fallos text[] := '{}';
  v_general boolean := p_grupo is null or p_grupo = 'general';
  v_dinero boolean := p_grupo is null or p_grupo = 'dinero';
  v_clinica boolean := p_grupo is null or p_grupo = 'clinica';
begin
  if v_rol not in ('admin', 'recepcion', 'estetica') then
    raise exception 'Solo el personal del negocio.' using errcode = '42501';
  end if;

  if v_general then
  begin
    r := r || jsonb_build_object('bajas', (select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at), '[]'::jsonb) from (
      select pb.id, pb.perro_id, pb.perro_nombre, pb.motivo, pb.created_at from public.perros_bajas pb
      where pb.tipo = 'solicitud' and pb.resultado = 'pendiente' and pb.deleted_at is null order by pb.created_at limit 50) b));
  exception when others then v_fallos := array_append(v_fallos, 'bajas');
  end;
  begin
    r := r || jsonb_build_object('evaluacion_exigida', public.evaluacion_exigida());
  exception when others then v_fallos := array_append(v_fallos, 'evaluacion_exigida');
  end;
  begin
    r := r || jsonb_build_object('cfdi', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.cfdi_atencion() c));
  exception when others then v_fallos := array_append(v_fallos, 'cfdi');
  end;
  end if;

  if v_general and public.tiene_permiso('tarifas') then
    begin
      r := r || jsonb_build_object(
        'razas_sin_grupo', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.razas_sin_grupo() x),
        'razas_propuestas', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.razas_propuestas_sin_grupo() x));
    exception when others then v_fallos := array_append(v_fallos, 'razas');
    end;
  end if;
  if v_general and public.tiene_permiso('gastos') and coalesce(public.modulo_activo('gastos'), false) then
    begin
      r := r || jsonb_build_object('gastos', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.gastos_por_atender() x));
    exception when others then v_fallos := array_append(v_fallos, 'gastos');
    end;
  end if;
  if v_clinica and v_vet then
    begin
      r := r || jsonb_build_object('vet_inventario', case when public.tiene_permiso('lotes_clinicos') then public.inventario_clinico_alertas() end);
    exception when others then v_fallos := array_append(v_fallos, 'vet_inventario');
    end;
    begin
      r := r || jsonb_build_object('vet_permisos', case when public.tiene_permiso('configuracion_negocio')
                                   then (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.permisos_establecimiento_por_vencer() x) end);
    exception when others then v_fallos := array_append(v_fallos, 'vet_permisos');
    end;
    begin
      r := r || jsonb_build_object('vet_atencion', public.veterinaria_atencion());
    exception when others then v_fallos := array_append(v_fallos, 'vet_atencion');
    end;
    begin
      r := r || jsonb_build_object('fallos_wa', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.wa_fallos_atencion() x));
    exception when others then v_fallos := array_append(v_fallos, 'fallos_wa');
    end;
  end if;
  if v_general and v_personal then
    begin
      r := r || jsonb_build_object(
        'recordatorios_mensajes', (select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb) from (
          select rm.tipo, rm.created_at from public.recordatorios_mensajes rm
          where rm.deleted_at is null and rm.atendido_at is null and rm.tipo <> 'baja' order by rm.created_at limit 200) m),
        'recordatorios_pausados', (select count(*) from public.recordatorios_wa w where w.estado = 'pausado' and w.deleted_at is null));
    exception when others then v_fallos := array_append(v_fallos, 'recordatorios');
    end;
    begin
      r := r || jsonb_build_object('reembolsos', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.reembolsos_por_atender() x));
    exception when others then v_fallos := array_append(v_fallos, 'reembolsos');
    end;
    begin
      r := r || jsonb_build_object(
        'conciliacion', (select coalesce(jsonb_agg(jsonb_build_object('id', ct.id, 'tipo', ct.tipo, 'monto', ct.monto, 'detectada_at', ct.detectada_at) order by ct.detectada_at, ct.id), '[]'::jsonb)
                         from public.conciliacion_terminal ct where ct.resuelta_at is null and ct.tipo <> 'pago_ajeno'),
        'mp_por_confirmar', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'monto', o.monto, 'created_at', o.created_at) order by o.created_at, o.id), '[]'::jsonb)
                             from public.mp_ordenes o where o.estado = 'por_confirmar' and o.deleted_at is null));
    exception when others then v_fallos := array_append(v_fallos, 'conciliacion');
    end;
    if coalesce(public.modulo_activo('estetica'), false) then
      begin
        r := r || jsonb_build_object('ajustes', (select coalesce(jsonb_agg(to_jsonb(x) order by x.correccion_id), '[]'::jsonb) from public.ajustes_servicio_por_atender() x));
      exception when others then v_fallos := array_append(v_fallos, 'ajustes');
      end;
    end if;
  end if;
  if v_dinero and v_rol = 'admin' then
    begin
      r := r || jsonb_build_object(
        'tarjetas', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.tarjetas_manuales_por_revisar(false) x),
        'tarjetas_atencion', public.tarjetas_manuales_atencion());
    exception when others then v_fallos := array_append(v_fallos, 'tarjetas');
    end;
    begin
      r := r || jsonb_build_object('cobro', public.estado_cobro());
    exception when others then v_fallos := array_append(v_fallos, 'cobro');
    end;
  end if;
  if cardinality(v_fallos) > 0 then
    r := r || jsonb_build_object('fallos', to_jsonb(v_fallos));
  end if;
  return r;
end;
$$;
revoke execute on function public.tablero_atencion(text) from public, anon;
grant execute on function public.tablero_atencion(text) to authenticated, service_role;
