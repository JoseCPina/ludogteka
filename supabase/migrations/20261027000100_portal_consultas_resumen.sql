-- Portal del dueño: las consultas como RESUMEN (27 de octubre de 2026, carril A).
--
-- Antes: el portal solo mostraba las consultas si el negocio prendía una opción que venía
-- apagada, y traía el nombre del médico y solo el plan. Ahora la opción viene PRENDIDA (el
-- negocio la puede apagar) y cada consulta firmada trae lo que el dueño necesita:
--   fecha, tipo, motivo, diagnóstico (definitivo; si no hay, los presuntivos) e indicaciones
--   (plan y tratamiento). NUNCA notas internas, examen, hallazgos, signos vitales, firma ni
--   datos del personal (ni el nombre del médico).
-- El resto del SOAP sigue sin leerse por la API: las tablas clínicas tienen lectura `false`.
--
-- REVERSA: restaurar mi_expediente de 20261016000100 y el default en false.

alter table public.veterinaria_ajustes alter column portal_expediente set default true;
alter table public.veterinaria_ajustes disable trigger exigir_modulo;
update public.veterinaria_ajustes set portal_expediente = true where portal_expediente is false and deleted_at is null;
alter table public.veterinaria_ajustes enable trigger exigir_modulo;

create or replace function public.mi_expediente(p_perro uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.mi_cliente_id();
  v_zona text := public.zona_negocio();
begin
  if v_cliente is null or not coalesce(public.modulo_activo('veterinaria'), false) then
    return null;
  end if;
  if not exists (
    select 1 from public.perros p
    where p.id = p_perro and p.negocio_id = public.negocio_actual() and p.deleted_at is null
      and (p.cliente_id = v_cliente or exists (
        select 1 from public.perro_accesos_compartidos pac
        where pac.perro_id = p.id and pac.cliente_id = v_cliente and pac.deleted_at is null))
  ) then
    return null;
  end if;
  -- Sin fila de ajustes también se comparte; solo un «no» explícito lo apaga.
  if not coalesce((select a.portal_expediente from public.veterinaria_ajustes a where a.negocio_id = public.negocio_actual() and a.deleted_at is null), true) then
    return jsonb_build_object('habilitado', false, 'consultas', '[]'::jsonb);
  end if;
  return jsonb_build_object('habilitado', true, 'consultas', coalesce((
    select jsonb_agg(jsonb_build_object(
      'fecha', (c.atendida_at at time zone v_zona)::date,
      'tipo', c.tipo_clave,
      'motivo', coalesce(c.motivo, ''),
      'diagnostico', coalesce(
        (select string_agg(d ->> 'nombre', ', ') from jsonb_array_elements(c.diagnosticos) d where d ->> 'tipo' = 'definitivo'),
        (select string_agg(d ->> 'nombre', ', ') from jsonb_array_elements(c.diagnosticos) d), ''),
      'indicaciones', btrim(concat_ws(E'\n\n', nullif(btrim(coalesce(c.plan, '')), ''), nullif(btrim(coalesce(c.tratamiento, '')), '')))
    ) order by c.atendida_at desc)
    from public.vet_consultas c
    where c.perro_id = p_perro and c.negocio_id = public.negocio_actual() and c.deleted_at is null and c.estado = 'firmada'
  ), '[]'::jsonb));
end;
$$;

-- El valor por omisión que ve la pantalla de ajustes (sin fila guardada) también es «sí».
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.veterinaria_ajustes_actuales()'::regprocedure);
  if position($q$'portal_expediente', false,$q$ in v_def) = 0 then
    raise exception 'No se pudo parchar veterinaria_ajustes_actuales: cambió su texto.';
  end if;
  execute replace(v_def, $q$'portal_expediente', false,$q$, $q$'portal_expediente', true,$q$);
end $$;
