-- El contrato firmado (digital o escaneado de papel) vive en el MISMO
-- bucket privado perros-archivos, ruta {cliente_id}/{perro_id}/contrato/
-- {contrato_id}.pdf — mismas reglas de privacidad que la foto y los
-- comprobantes sanitarios, "el dueño ve solo los suyos" ya lo cubre la
-- política de SELECT existente (perros_archivos_select_propio no
-- distingue subcarpeta) y el staff ya puede subir cualquier cosa a este
-- bucket (perros_archivos_insert_staff, para el caso de papel).
--
-- Lo único que falta es que el CLIENTE pueda subir — solo su propia
-- firma digital, solo a la subcarpeta contrato/, solo para un perro que
-- de verdad es suyo como dueño principal (no acceso compartido: firmar
-- por otro no es lo mismo que solo consultar). El PDF ya sale de la
-- aplicación con la firma y el bloque de auditoría sellados — Storage
-- solo necesita saber que quien escribe tiene derecho a escribir ahí.
create policy perros_archivos_insert_propio_contrato on storage.objects
for insert to authenticated
with check (
  bucket_id = 'perros-archivos'
  and (storage.foldername(name))[3] = 'contrato'
  and exists (
    select 1 from public.perros p
    where p.id::text = (storage.foldername(name))[2]
      and p.cliente_id = (select cliente_id from public.profiles where id = auth.uid())
  )
);
