-- QA S21 (N105): «Quitar» junto a una vacuna o desparasitación de la consulta la anula en el carnet y quita su
-- cargo en un paso, también cuando se registró desde el carnet ese día y la consulta la adoptó (antes solo
-- lo nacido en el borrador). Lo adoptado pide además «Registrar vacunas» (anular un registro del carnet).
-- En la lista de cargos ya no hay «Quitar» para una vacuna: dice «Se quita desde la consulta».

create or replace function public.vet_consulta_quitar_aplicacion(p_consulta uuid, p_tipo text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perro uuid := public._vet_consulta_borrador_de(p_consulta);
  v_de_esta boolean;
  v_nacida boolean;
begin
  if p_tipo not in ('vacuna', 'desparasitacion') then raise exception 'Tipo de registro inválido.'; end if;
  if p_tipo = 'vacuna' then
    select (cv.consulta_id = p_consulta and cv.anulada_at is null), coalesce(cv.registrada_en_consulta, false)
      into v_de_esta, v_nacida
      from public.carnet_vacunas cv where cv.id = p_id and cv.negocio_id = public.negocio_actual() and cv.deleted_at is null;
  else
    select (cd.consulta_id = p_consulta and cd.anulada_at is null), coalesce(cd.registrada_en_consulta, false)
      into v_de_esta, v_nacida
      from public.carnet_desparasitaciones cd where cd.id = p_id and cd.negocio_id = public.negocio_actual() and cd.deleted_at is null;
  end if;
  if v_de_esta is null then raise exception 'Ese registro no existe.'; end if;
  if not v_de_esta then
    raise exception 'Ese registro no es de esta consulta: se anula desde el carnet.';
  end if;
  if not v_nacida and not public.vet_puede('registrar_vacunas') then
    raise exception 'Se registró desde el carnet: anularlo es de quien tiene «Registrar vacunas».' using errcode = '42501';
  end if;
  perform public._vet_carnet_anular(p_tipo, p_id, 'Se quitó de la consulta en borrador');
  perform public._vet_cargos_sincronizar(p_consulta);
  perform v_perro;
end;
$$;
alter function public.vet_consulta_quitar_aplicacion(uuid, text, uuid) owner to peludesk_definer;
revoke execute on function public.vet_consulta_quitar_aplicacion(uuid, text, uuid) from public, anon;
grant execute on function public.vet_consulta_quitar_aplicacion(uuid, text, uuid) to authenticated, service_role;

-- QA S21 (N110): el portal nunca enseña las etiquetas de la plantilla («Medicamento · dosis · vía · frecuencia ·
-- duración:», «Recomendaciones al propietario:»…), solo lo capturado. mi_expediente entrega las etiquetas de las
-- plantillas del negocio (todas sus versiones) y las de base, y la pantalla las quita con `sinEtiquetasDePlantilla`.
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
     where p.negocio_id = public.negocio_actual()
    union all
    select v.value
      from unnest(array['consulta', 'vacuna', 'cirugia', 'seguimiento', 'urgencia']) tipo,
           jsonb_each_text(public.vet_plantilla_base(tipo)) v
  ), renglones as (
    select btrim(r) as r from textos, regexp_split_to_table(coalesce(t, ''), E'\n') r
  )
  select coalesce(jsonb_agg(distinct btrim(substring(r from '^([^:]{1,100}):'))), '[]'::jsonb)
    from renglones
   where r ~ '^[^:]{1,100}:' and btrim(substring(r from '^([^:]{1,100}):')) <> '';
$$;
alter function public._vet_etiquetas_plantilla() owner to peludesk_definer;
revoke execute on function public._vet_etiquetas_plantilla() from public, anon, authenticated;

do $$
declare
  v_def text := replace(pg_get_functiondef('public.mi_expediente(uuid)'::regprocedure), chr(13), '');
  v_ancla text := $q$return jsonb_build_object('habilitado', true, 'consultas',$q$;
begin
  if position('_vet_etiquetas_plantilla' in v_def) > 0 then return; end if;
  if position(v_ancla in v_def) = 0 then raise exception 'mi_expediente cambió: revisa este parche.'; end if;
  execute replace(v_def, v_ancla, $q$return jsonb_build_object('habilitado', true, 'etiquetas', public._vet_etiquetas_plantilla(), 'consultas',$q$);
end $$;
