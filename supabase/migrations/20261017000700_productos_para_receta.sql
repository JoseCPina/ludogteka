-- Veterinaria, Fase 4 · parte 8: los productos clínicos con el documento que pide cada uno, para
-- armar una receta o un registro del SITPV sin una consulta por producto.
create or replace function public.vet_productos_receta()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (coalesce(public.vet_recetas_puede_leer(), false) or coalesce(public.vet_sitpv_puede_leer(), false) or coalesce(public.vet_puede_surtir(), false)) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'nombre', i.nombre, 'presentacion', i.presentacion, 'registro_senasica', i.registro_senasica, 'laboratorio', i.laboratorio,
      'principio_activo', pa.nombre, 'unidad', um.etiqueta,
      'documento', public.vet_requisito_insumo(i.id) ->> 'documento', 'clasificacion', public.vet_requisito_insumo(i.id) ->> 'etiqueta',
      'surtidos_max', (public.vet_requisito_insumo(i.id) ->> 'surtidos_max')::int, 'libro_control', (public.vet_requisito_insumo(i.id) ->> 'libro_control')::boolean)
      order by i.nombre)
    from public.insumos i
    left join public.principios_activos pa on pa.id = i.principio_activo_id
    left join public.unidades_medida um on um.id = i.unidad_consumo_id
    where i.negocio_id = public.negocio_actual() and i.deleted_at is null and i.controla_lotes
  ), '[]'::jsonb);
end;
$$;
alter function public.vet_productos_receta() owner to peludesk_definer;
revoke execute on function public.vet_productos_receta() from public, anon;
grant execute on function public.vet_productos_receta() to authenticated, service_role;
