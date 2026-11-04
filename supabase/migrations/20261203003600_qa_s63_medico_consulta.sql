-- QA S63 (UX): el médico de una consulta se cambia desde la consulta. Solo mientras está en borrador (una firmada ya
-- lleva la firma de quien la atendió), y lo hace quien maneja la agenda clínica (admin, recepción, un médico o quien
-- tenga «Atender consultas»). Si la consulta viene de una cita, la cita cambia de médico también (la agenda cuadra).
create or replace function public.vet_consulta_cambiar_medico(p_consulta uuid, p_medico uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
  v_cita uuid;
  v_hay boolean;
begin
  if not public.vet_agenda_puede() then
    raise exception 'Cambiar el médico de una consulta es de recepción, de admin, de quien tenga «Atender consultas» o de un médico veterinario.' using errcode = '42501';
  end if;
  select c.estado, c.cita_id into v_estado, v_cita from public.vet_consultas c
   where c.id = p_consulta and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  v_hay := found;
  if not v_hay then
    raise exception 'Esa consulta no existe.';
  end if;
  if v_estado <> 'borrador' then
    raise exception 'La consulta ya está firmada: el médico es quien la firmó.';
  end if;
  if not exists (select 1 from public.medicos_veterinarios m where m.id = p_medico and m.negocio_id = public.negocio_actual() and m.deleted_at is null) then
    raise exception 'Ese médico veterinario no existe.';
  end if;
  update public.vet_consultas set medico_id = p_medico where id = p_consulta;
  if v_cita is not null then
    update public.vet_citas set medico_id = p_medico where id = v_cita and negocio_id = public.negocio_actual();
  end if;
  return jsonb_build_object('version', (select updated_at from public.vet_consultas where id = p_consulta));
end;
$$;
alter function public.vet_consulta_cambiar_medico(uuid, uuid) owner to peludesk_definer;
revoke execute on function public.vet_consulta_cambiar_medico(uuid, uuid) from public, anon;
grant execute on function public.vet_consulta_cambiar_medico(uuid, uuid) to authenticated, service_role;
