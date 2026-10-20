-- QA S18 (N95): «Corte de uñas» (y todo servicio de estética de precio único, sin grupo de raza) no se podía
-- agendar: validar_cita_estetica leía v_grupo.grupo_raza_id dentro de un CASE aunque el servicio no dependiera del
-- grupo, y en PL/pgSQL un record que nunca se asignó no es NULL: leerlo truena (55000 «record "v_grupo" is not
-- assigned yet»). La app lo traducía como «No pudimos guardar esto. Intenta de nuevo». Venía de la migración
-- 20261013000200 (tarifa «Cliente de guardería»). Ahora el grupo resuelto vive en una variable uuid que empieza nula.
--
-- REVERSA: no aplica (la versión anterior es la que fallaba).
do $$
declare
  v_def text := replace(pg_get_functiondef('public.validar_cita_estetica'::regproc), chr(13), '');
  v_viejo text := 'case when v_p_dg then v_grupo.grupo_raza_id else null end';
  v_ancla text := E'      if v_grupo.grupo_raza_id is null then\n        raise exception ''No se pudo determinar el grupo de raza de este perro. Revisa el catálogo de razas.'';\n      end if;';
begin
  if position('v_grupo_id uuid' in v_def) > 0 then return; end if;
  if position(v_viejo in v_def) = 0 or position(v_ancla in v_def) = 0 or position(E'  v_grupo record;\n' in v_def) = 0 then
    raise exception 'validar_cita_estetica cambió: revisa este parche.';
  end if;
  v_def := replace(v_def, E'  v_grupo record;\n', E'  v_grupo record;\n  v_grupo_id uuid;\n');
  v_def := replace(v_def, v_ancla, v_ancla || E'\n      v_grupo_id := v_grupo.grupo_raza_id;');
  v_def := replace(v_def, v_viejo, 'v_grupo_id');
  execute v_def;
end $$;
