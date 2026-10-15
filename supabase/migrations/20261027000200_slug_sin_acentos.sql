-- La dirección corta de un negocio nuevo se arma sin acentos ni eñes (27 de octubre de 2026):
-- «Hotel/Guardería» daba prueba-hotel-guarder-a; ahora da prueba-hotel-guarderia.
-- Solo cambia cómo se ARMA un slug nuevo: los de negocios que ya existen no se tocan.
--
-- REVERSA: volver a la definición de 20260925175159.
do $$
declare
  v_def text;
  v_viejo constant text := $q$regexp_replace(lower(coalesce(p_base, '')), '[^a-z0-9]+', '-', 'g')$q$;
  v_nuevo constant text := $q$regexp_replace(translate(lower(coalesce(p_base, '')), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc'), '[^a-z0-9]+', '-', 'g')$q$;
begin
  v_def := pg_get_functiondef('public.slug_libre(text)'::regprocedure);
  if position(v_viejo in v_def) = 0 then
    raise exception 'No se pudo parchar slug_libre: cambió su texto.';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;
