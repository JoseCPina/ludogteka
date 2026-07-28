-- Bucket privado para foto de perfil del perro (perros.foto_path) y
-- comprobante del carnet de vacunación/desparasitación
-- (requisitos_sanitarios_aplicados.comprobante_path). Un solo bucket para
-- ambos porque comparten exactamente las mismas reglas de privacidad.
-- public = false a propósito: un bucket público serviría cualquier archivo
-- por URL sin pasar por RLS en absoluto.
--
-- Convención de ruta: {cliente_id}/{perro_id}/perfil/archivo.ext
--                      {cliente_id}/{perro_id}/requisitos/{requisito_id}/archivo.ext
--
-- storage.objects RLS es un mecanismo aparte del RLS de tablas: no hay FK
-- real hacia perros, solo texto en `name` que hay que parsear con
-- storage.foldername(). Por eso las políticas de cliente de abajo NO
-- confían en que el segmento {cliente_id} de la ruta sea verídico —
-- cualquiera podría escribir una ruta con el cliente_id de otro. Lo que de
-- verdad se valida es el segmento {perro_id} (índice 2) contra la
-- propiedad real en public.perros (+ acceso compartido), la misma
-- comprobación que ya protege la tabla perros. El folder {cliente_id} es
-- solo organización para el staff, nunca la fuente de verdad del permiso.
insert into storage.buckets (id, name, public)
values ('perros-archivos', 'perros-archivos', false);

-- Staff: lectura para los tres roles (todos necesitan ver la foto/carnet
-- en el mostrador); alta y reemplazo de archivo solo admin/recepción,
-- igual que las tablas perros y requisitos_sanitarios_aplicados que estos
-- archivos acompañan. Sin política de DELETE: un archivo se reemplaza
-- (INSERT con upsert, cubierto por UPDATE), nunca se borra, mismo espíritu
-- que el resto del esquema (deleted_at en vez de DELETE real).
create policy perros_archivos_select_staff on storage.objects
for select to authenticated
using (
  bucket_id = 'perros-archivos'
  and public.is_staff()
);

create policy perros_archivos_insert_staff on storage.objects
for insert to authenticated
with check (
  bucket_id = 'perros-archivos'
  and public.current_rol() in ('admin', 'recepcion')
);

create policy perros_archivos_update_staff on storage.objects
for update to authenticated
using (
  bucket_id = 'perros-archivos'
  and public.current_rol() in ('admin', 'recepcion')
)
with check (
  bucket_id = 'perros-archivos'
  and public.current_rol() in ('admin', 'recepcion')
);

-- Dueño (o acceso compartido): solo lectura de los archivos de SU perro,
-- validado contra la propiedad real, no contra el nombre de la carpeta.
create policy perros_archivos_select_propio on storage.objects
for select to authenticated
using (
  bucket_id = 'perros-archivos'
  and exists (
    select 1 from public.perros p
    where p.id::text = (storage.foldername(name))[2]
      and (
        p.cliente_id = (select cliente_id from public.profiles where id = auth.uid())
        or exists (
          select 1 from public.perro_accesos_compartidos pac
          where pac.perro_id = p.id
            and pac.deleted_at is null
            and pac.cliente_id = (select cliente_id from public.profiles where id = auth.uid())
        )
      )
  )
);
