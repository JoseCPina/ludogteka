-- QA S21 (N110): las etiquetas que entrega mi_expediente salen SOLO de los campos que el dueño ve (motivo, plan y
-- tratamiento): las del examen o los hallazgos no tienen por qué llegarle al portal.
create or replace function public._vet_etiquetas_plantilla()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with textos as (
    select v.value as t
      from public.vet_consulta_plantillas p, jsonb_each_text(p.texto) v
     where p.negocio_id = public.negocio_actual() and v.key in ('motivo', 'plan', 'tratamiento')
    union all
    select v.value
      from unnest(array['consulta', 'vacuna', 'cirugia', 'seguimiento', 'urgencia']) tipo,
           jsonb_each_text(public.vet_plantilla_base(tipo)) v
     where v.key in ('motivo', 'plan', 'tratamiento')
  ), renglones as (
    select btrim(r) as r from textos, regexp_split_to_table(coalesce(t, ''), E'\n') r
  )
  select coalesce(jsonb_agg(distinct btrim(substring(r from '^([^:]{1,100}):'))), '[]'::jsonb)
    from renglones
   where r ~ '^[^:]{1,100}:' and btrim(substring(r from '^([^:]{1,100}):')) <> '';
$$;
alter function public._vet_etiquetas_plantilla() owner to peludesk_definer;
revoke execute on function public._vet_etiquetas_plantilla() from public, anon, authenticated;
