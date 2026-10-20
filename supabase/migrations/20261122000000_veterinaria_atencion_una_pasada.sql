-- veterinaria_atencion() (aviso «Necesita atención» de Veterinaria) era la consulta que
-- más tiempo de base consumía en desarrollo: cada vet_puede() y cada vet_sitpv_estado_medicos()
-- se evaluaba por separado (16 permisos y 4 recorridos del SITPV por llamada; ~234 lecturas de
-- modulos_activos). Se calculan una sola vez. Mismo resultado, mismas reglas.
create or replace function public.veterinaria_atencion()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_hoy date := public.fecha_negocio();
  v_neg uuid := public.negocio_actual();
  v_vacunas boolean;
  v_hosp boolean;
  v_firmar boolean;
  v_estimados boolean;
  v_sitpv boolean;
  v_medicos jsonb := '[]'::jsonb;
begin
  if not coalesce(public.is_staff(), false) or not coalesce(public.modulo_activo('veterinaria'), false) then
    return '{}'::jsonb;
  end if;
  v_vacunas := coalesce(public.vet_puede('registrar_vacunas'), false);
  v_hosp := coalesce(public.vet_puede('hospitalizar'), false);
  v_firmar := coalesce(public.vet_puede('firmar_expediente'), false);
  v_estimados := coalesce(public.vet_puede('crear_estimados'), false);
  v_sitpv := coalesce(public.vet_puede('registrar_recetas_sitpv'), false);
  if v_sitpv then
    v_medicos := coalesce(public.vet_sitpv_estado_medicos(), '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'recordatorios_pendientes', case when v_vacunas then
        (select count(*) from public.carnet_recordatorios r where r.negocio_id = v_neg and r.deleted_at is null and r.estado in ('pendiente', 'fallido')
            and r.proxima_dosis <= v_hoy + 14) else 0 end,
    'recordatorio_mas_viejo', case when v_vacunas then
        (select min(r.proxima_dosis) from public.carnet_recordatorios r where r.negocio_id = v_neg and r.deleted_at is null and r.estado in ('pendiente', 'fallido')
            and r.proxima_dosis <= v_hoy + 14) else null end,
    'dosis_atrasadas', case when v_hosp then
        (select count(*) from public.hospitalizacion_dosis d join public.hospitalizaciones h on h.id = d.hospitalizacion_id and h.estado = 'ingresado'
          where d.negocio_id = v_neg and d.estado = 'pendiente' and d.programada_at < now() - interval '15 minutes') else 0 end,
    'dosis_mas_vieja', case when v_hosp then
        (select min(d.programada_at) from public.hospitalizacion_dosis d join public.hospitalizaciones h on h.id = d.hospitalizacion_id and h.estado = 'ingresado'
          where d.negocio_id = v_neg and d.estado = 'pendiente' and d.programada_at < now() - interval '15 minutes') else null end,
    'consentimientos_pendientes', case when v_hosp then
        (select count(*) from public.consentimientos c where c.negocio_id = v_neg and c.deleted_at is null and c.estado = 'pendiente_firma') else 0 end,
    'consentimiento_mas_viejo', case when v_hosp then
        (select min(c.created_at) from public.consentimientos c where c.negocio_id = v_neg and c.deleted_at is null and c.estado = 'pendiente_firma') else null end,
    -- Fase 3: consultas que se quedaron en borrador más de un día (las ve quien las puede firmar).
    'consultas_sin_firmar', case when v_firmar then
        (select count(*) from public.vet_consultas c where c.negocio_id = v_neg and c.deleted_at is null and c.estado = 'borrador'
            and c.created_at < now() - interval '24 hours') else 0 end,
    'consulta_mas_vieja', case when v_firmar then
        (select min(c.created_at) from public.vet_consultas c where c.negocio_id = v_neg and c.deleted_at is null and c.estado = 'borrador'
            and c.created_at < now() - interval '24 hours') else null end,
    -- Estimados enviados que el dueño no ha contestado en tres días.
    'estimados_sin_respuesta', case when v_estimados then
        (select count(*) from public.vet_estimados e where e.negocio_id = v_neg and e.deleted_at is null and e.estado = 'enviado'
            and e.enviado_at < now() - interval '72 hours') else 0 end,
    'estimado_mas_viejo', case when v_estimados then
        (select min(e.enviado_at) from public.vet_estimados e where e.negocio_id = v_neg and e.deleted_at is null and e.estado = 'enviado'
            and e.enviado_at < now() - interval '72 hours') else null end,
    -- Reporte mensual del SITPV por marcar, folios por agotarse y bloqueo de folios nuevos.
    'sitpv_reportes_pendientes', case when v_sitpv then
        (select coalesce(sum(jsonb_array_length(e -> 'meses_pendientes')), 0) from jsonb_array_elements(v_medicos) e) else 0 end,
    'sitpv_reporte_desde', case when v_sitpv then
        (select (min((e -> 'meses_pendientes' ->> 0)::date) + interval '1 month')::date from jsonb_array_elements(v_medicos) e where jsonb_array_length(e -> 'meses_pendientes') > 0) else null end,
    'sitpv_reporte_aviso', case when v_sitpv then
        extract(day from v_hoy) >= public.vet_regla_num('sitpv_reporte_dia_aviso', 3) else false end,
    'sitpv_reporte_bloqueo', case when v_sitpv then
        (select count(*) from jsonb_array_elements(v_medicos) e where jsonb_array_length(e -> 'meses_pendientes') >= public.vet_regla_num('sitpv_meses_sin_reporte_bloqueo', 3)) else 0 end,
    'sitpv_folios_bajos', case when v_sitpv then
        (select count(*) from jsonb_array_elements(v_medicos) e where (e ->> 'folios_asignados')::int > 0 and (e ->> 'folios_disponibles')::int < public.vet_regla_num('sitpv_folios_alerta', 10)) else 0 end
  );
end;
$function$;
