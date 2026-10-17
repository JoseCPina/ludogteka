-- Una persona del personal se nombra por su ficha de empleado (la de ESTE negocio) y, si no la tiene, por el
-- nombre de su cuenta; nunca por la parte local de su correo. Antes la agenda y el selector de estética
-- mostraban «qa.estilista.estetica.r9» aunque su ficha de empleado dijera «QA Estilista R9».
create or replace function public.nombre_de_persona(p_profile uuid, p_vacio text default 'Sin nombre')
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select nullif(btrim(e.nombre), '') from public.empleados e
      where e.profile_id = p_profile and e.negocio_id = public.negocio_actual() and e.deleted_at is null
      order by e.created_at limit 1),
    (select nullif(btrim(p.nombre_completo), '') from public.profiles p where p.id = p_profile),
    p_vacio
  );
$$;
alter function public.nombre_de_persona(uuid, text) owner to peludesk_definer;
revoke execute on function public.nombre_de_persona(uuid, text) from public, anon;
grant execute on function public.nombre_de_persona(uuid, text) to authenticated, service_role, postgres;

do $$
declare
  v_def text;
  r record;
begin
  for r in
    select * from (values
      ('public.listar_personal_estetica()', 'coalesce(nullif(btrim(p.nombre_completo), ''''), split_part(u.email::text, ''@'', 1))', 'public.nombre_de_persona(p.id)'),
      ('public.estilistas_asignables()', 'coalesce(nullif(btrim(p.nombre_completo), ''''), ''Sin nombre'')', 'public.nombre_de_persona(p.id)'),
      ('public.cita_estetica_choques_texto(uuid, timestamptz, timestamptz, uuid)',
        'select coalesce(nullif(btrim(nombre_completo), ''''), ''La estilista'') into v_nombre from public.profiles where id = p_empleado;',
        'select public.nombre_de_persona(p_empleado, ''La estilista'') into v_nombre;'),
      ('public.reasignar_estilista_cita(uuid, uuid, text)',
        'select coalesce(max(coalesce(nullif(btrim(pr.nombre_completo), ''''), ''Sin nombre'')), ''Sin asignar'') into v_de',
        'select coalesce(max(public.nombre_de_persona(pr.id)), ''Sin asignar'') into v_de'),
      ('public.reasignar_estilista_cita(uuid, uuid, text)',
        'select coalesce(max(coalesce(nullif(btrim(pr.nombre_completo), ''''), ''Sin nombre'')), ''Sin asignar'') into v_a',
        'select coalesce(max(public.nombre_de_persona(pr.id)), ''Sin asignar'') into v_a'),
      ('public.historial_asignaciones_cita(uuid)',
        'coalesce(nullif(btrim(d.nombre_completo), ''''), case when a.de_empleado_id is null then ''Sin asignar'' else ''Sin nombre'' end)',
        'case when a.de_empleado_id is null then ''Sin asignar'' else public.nombre_de_persona(a.de_empleado_id) end'),
      ('public.historial_asignaciones_cita(uuid)',
        'coalesce(nullif(btrim(n.nombre_completo), ''''), case when a.a_empleado_id is null then ''Sin asignar'' else ''Sin nombre'' end)',
        'case when a.a_empleado_id is null then ''Sin asignar'' else public.nombre_de_persona(a.a_empleado_id) end'),
      ('public.historial_asignaciones_cita(uuid)',
        'coalesce(nullif(btrim(h.nombre_completo), ''''), ''Alguien del equipo'')',
        'case when h.id is null then ''Alguien del equipo'' else public.nombre_de_persona(h.id, ''Alguien del equipo'') end'),
      ('public.historial_cambios_cita(uuid)',
        'coalesce(nullif(btrim(h.nombre_completo), ''''), ''Alguien del equipo'')',
        'case when h.id is null then ''Alguien del equipo'' else public.nombre_de_persona(h.id, ''Alguien del equipo'') end'),
      ('public.historial_correcciones_servicio_cita(uuid)',
        'coalesce(nullif(btrim(h.nombre_completo), ''''), ''Alguien del equipo'')',
        'case when h.id is null then ''Alguien del equipo'' else public.nombre_de_persona(h.id, ''Alguien del equipo'') end'),
      ('public.vet_agenda(date, date, uuid)', 'coalesce(pr.nombre_completo, ''Sin nombre'')', 'public.nombre_de_persona(pr.id)'),
      ('public.vet_medicos_lista()', 'coalesce(p.nombre_completo, ''Sin nombre'')', 'public.nombre_de_persona(p.id)'),
      ('public.listar_personal()', 'select p.id, p.nombre_completo, m.rol', 'select p.id, public.nombre_de_persona(p.id), m.rol')
    ) as t(firma, viejo, nuevo)
  loop
    select pg_get_functiondef(r.firma::regprocedure) into v_def;
    if position(r.viejo in v_def) = 0 then
      raise exception 'nombre_de_persona: no encuentro «%» en %', left(r.viejo, 60), r.firma;
    end if;
    execute replace(v_def, r.viejo, r.nuevo);
  end loop;
end $$;
