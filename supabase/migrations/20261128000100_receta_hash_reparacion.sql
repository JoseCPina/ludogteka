-- QA R34: la primera versión de 20261128000000 (solo llegó a desarrollo) calculó la huella con `vet_receta_hash`,
-- que sin negocio en la petición devuelve NULL, y dejó sin huella las recetas que reparó. Aquí se recalcula con la
-- misma fórmula para las recetas cuyo evento `limpiar_indicacion_receta` dejó `hash_nuevo` vacío teniendo
-- `hash_antes`. En producción no encuentra ninguna (la 000000 corregida ya calcula bien).
-- La misma fórmula de `vet_receta_hash`, sin acotar al negocio de la petición: `vet_receta_hash` es de
-- peludesk_definer y en una migración (sin negocio) no ve la receta y devuelve NULL. Solo para reparaciones.
create or replace function public._vet_receta_hash_migracion(p_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'numero', r.numero, 'fecha', r.fecha_emision, 'perro', r.perro_id, 'medico', r.medico_id, 'diagnostico', r.diagnostico, 'observaciones', r.observaciones,
    'lineas', coalesce((select jsonb_agg(jsonb_build_array(l.producto, l.principio_activo, l.presentacion, l.dosis, l.via, l.frecuencia,
                                                           l.duracion_dias, l.tiempo_retiro, l.cantidad_surtir, l.cantidad_unidad, l.indicaciones) order by l.orden, l.id)
                        from public.vet_receta_lineas l where l.receta_id = r.id and l.deleted_at is null), '[]'::jsonb))::text, 'UTF8')), 'hex')
  from public.vet_recetas r where r.id = p_id;
$$;
revoke execute on function public._vet_receta_hash_migracion(uuid) from public, anon, authenticated;

do $$
declare
  e record;
  v_hash text;
  v_n int := 0;
begin
  alter table public.vet_recetas disable trigger user;
  for e in
    select ev.id, (ev.detalle ->> 'receta_id')::uuid as receta_id
      from public.plataforma_eventos ev
     where ev.accion = 'limpiar_indicacion_receta'
       and ev.detalle ->> 'hash_antes' is not null and ev.detalle ->> 'hash_nuevo' is null
  loop
    v_hash := public._vet_receta_hash_migracion(e.receta_id);
    update public.vet_recetas set hash_contenido = v_hash where id = e.receta_id and hash_contenido is null;
    update public.plataforma_eventos set detalle = jsonb_set(detalle, '{hash_nuevo}', to_jsonb(v_hash)) where id = e.id;
    v_n := v_n + 1;
  end loop;
  alter table public.vet_recetas enable trigger user;
  raise notice 'Huellas recalculadas: %', v_n;
end $$;
