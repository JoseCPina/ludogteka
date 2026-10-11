-- Veterinaria, Fase 4 · parte 5: listas de apoyo para surtir contra un documento.

-- Mascotas hoy internadas (para ligar una aplicación de uso hospitalario a su paciente).
create or replace function public.vet_pacientes_internados()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.vet_puede_surtir(), false) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('perro_id', p.id, 'nombre', p.nombre) order by p.nombre)
    from public.hospitalizaciones h join public.perros p on p.id = h.perro_id
    where h.negocio_id = public.negocio_actual() and h.deleted_at is null and h.estado = 'ingresado'
  ), '[]'::jsonb);
end;
$$;

-- Registros del SITPV abiertos de un producto, con lo que les queda por surtir.
create or replace function public.vet_espejos_abiertos(p_insumo uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.vet_puede_surtir(), false) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'folio', e.folio_texto, 'fecha', e.fecha, 'uso_hospitalario', e.uso_hospitalario, 'parcialidades', e.parcialidades,
      'mascota', (select p.nombre from public.perros p where p.id = e.perro_id), 'perro_id', e.perro_id, 'cantidad_total', e.cantidad_total,
      'restante', e.cantidad_total - coalesce((select sum(m.cantidad_base) from public.lotes_movimientos m where m.espejo_id = e.id and m.tipo = 'salida_surtido' and m.deleted_at is null), 0) / public.vet_equiv_consumo(e.insumo_id))
      order by e.fecha desc, e.created_at desc)
    from public.vet_sitpv_recetas e
    where e.negocio_id = public.negocio_actual() and e.deleted_at is null and e.estado = 'registrada' and e.archivada_at is null and e.insumo_id = p_insumo
      and e.cantidad_total - coalesce((select sum(m.cantidad_base) from public.lotes_movimientos m where m.espejo_id = e.id and m.tipo = 'salida_surtido' and m.deleted_at is null), 0) / public.vet_equiv_consumo(e.insumo_id) > 0
  ), '[]'::jsonb);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['vet_pacientes_internados()', 'vet_espejos_abiertos(uuid)'] loop
    execute format('alter function public.%s owner to peludesk_definer', f);
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
