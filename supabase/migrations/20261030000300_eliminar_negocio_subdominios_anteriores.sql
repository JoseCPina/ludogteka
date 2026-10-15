-- Borrar un negocio también borra sus subdominios anteriores (negocios_slugs_anteriores apunta al negocio por
-- `negocio_destino`, no por `negocio_id`, así que el borrado general por negocio_id no la alcanza).
do $$
declare
  v_def text := replace(pg_get_functiondef('public.plataforma_eliminar_negocio(uuid,text)'::regprocedure), chr(13), '');
  v_nuevo text;
begin
  if position('negocios_slugs_anteriores' in v_def) > 0 then return; end if;
  v_nuevo := replace(v_def,
    $a$  update public.eventos_stripe set negocio_afectado = null where negocio_afectado = p_negocio_id;$a$,
    $b$  update public.eventos_stripe set negocio_afectado = null where negocio_afectado = p_negocio_id;
  delete from public.negocios_slugs_anteriores where negocio_destino = p_negocio_id;$b$);
  if v_nuevo = v_def then raise exception 'plataforma_eliminar_negocio cambió: no se pudo borrar los subdominios anteriores.'; end if;
  execute v_nuevo;
end $$;
