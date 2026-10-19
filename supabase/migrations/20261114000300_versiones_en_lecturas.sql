-- QA N43: las pantallas que leen por funciones (las tablas clínicas no se leen por la API) necesitan la versión
-- (updated_at) del registro para mandarla al guardar.
CREATE OR REPLACE FUNCTION public.vet_agenda(p_desde date, p_hasta date, p_medico uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_desde timestamptz;
  v_hasta timestamptz;
begin
  if not public.vet_agenda_puede() then
    return '[]'::jsonb;
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 45 then
    raise exception 'Elige un rango de hasta 45 días.';
  end if;
  v_desde := p_desde::timestamp at time zone public.zona_negocio();
  v_hasta := (p_hasta + 1)::timestamp at time zone public.zona_negocio();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'perro_id', c.perro_id, 'mascota', p.nombre, 'especie', p.especie, 'cliente_id', c.cliente_id, 'dueno', cl.nombre,
      'telefono', cl.telefono, 'tipo_clave', c.tipo_clave, 'tipo', t.nombre, 'medico_id', c.medico_id, 'medico', public.nombre_de_persona(pr.id),
      'inicia_at', c.inicia_at, 'termina_at', c.termina_at, 'estado', c.estado, 'motivo', c.motivo, 'consulta_id', c.consulta_id,
      'urgencia', c.es_urgencia, 'cancelada_motivo', c.cancelada_motivo, 'updated_at', c.updated_at
    ) order by c.inicia_at)
    from public.vet_citas c
    join public.perros p on p.id = c.perro_id
    join public.clientes cl on cl.id = c.cliente_id
    join public.vet_tipos_cita t on t.id = c.tipo_id
    join public.medicos_veterinarios m on m.id = c.medico_id
    left join public.profiles pr on pr.id = m.profile_id
    where c.negocio_id = public.negocio_actual() and c.deleted_at is null
      and c.inicia_at >= v_desde and c.inicia_at < v_hasta
      and (p_medico is null or c.medico_id = p_medico)
  ), '[]'::jsonb);
end;
$function$;
