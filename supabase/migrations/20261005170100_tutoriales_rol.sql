-- Quién ve cada video: la cuenta con la que se grabó (admin, recepción,
-- estética o cliente). Los de admin los ve recepción solo si tiene alguno de
-- los permisos del video.
alter table public.tutoriales add column rol text not null default 'recepcion' check (rol in ('admin', 'recepcion', 'estetica', 'cliente'));

create or replace function public.plataforma_tutoriales_sincronizar(p_filas jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
  n int := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not coalesce((select public.es_admin_plataforma()), false) then
    raise exception 'Solo la administración de PeluDesk.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_filas) <> 'array' then
    raise exception 'Las filas van en una lista.';
  end if;
  for f in select * from jsonb_array_elements(p_filas) loop
    insert into public.tutoriales (numero, slug, area, orden, titulo, resumen, descripcion, etiquetas, modulos, permisos, articulos, rutas, siguiente, duracion_s, rol)
    values (f->>'numero', f->>'slug', f->>'area', (f->>'orden')::int, f->>'titulo', coalesce(f->>'resumen', ''), coalesce(f->>'descripcion', ''),
            coalesce(array(select jsonb_array_elements_text(f->'etiquetas')), '{}'), coalesce(array(select jsonb_array_elements_text(f->'modulos')), '{}'),
            coalesce(array(select jsonb_array_elements_text(f->'permisos')), '{}'), coalesce(array(select jsonb_array_elements_text(f->'articulos')), '{}'),
            coalesce(array(select jsonb_array_elements_text(f->'rutas')), '{}'), nullif(f->>'siguiente', ''), nullif(f->>'duracion_s', '')::int,
            coalesce(nullif(f->>'rol', ''), 'recepcion'))
    on conflict (numero) where deleted_at is null do update set
      slug = excluded.slug, area = excluded.area, orden = excluded.orden, titulo = excluded.titulo, resumen = excluded.resumen,
      etiquetas = excluded.etiquetas, modulos = excluded.modulos, permisos = excluded.permisos, articulos = excluded.articulos,
      rutas = excluded.rutas, siguiente = excluded.siguiente, rol = excluded.rol,
      descripcion = case when public.tutoriales.video_path is null then excluded.descripcion else public.tutoriales.descripcion end;
    n := n + 1;
  end loop;
  insert into public.plataforma_eventos (accion, detalle, created_by)
  values ('sincronizar_tutoriales', jsonb_build_object('filas', n, 'via', case when auth.role() = 'service_role' then 'servicio' else 'sesion' end), auth.uid());
  return n;
end;
$$;
