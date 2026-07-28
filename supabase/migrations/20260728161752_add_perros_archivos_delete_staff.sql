-- La migración original (add_storage_perros_archivos) dejó el bucket sin
-- política de DELETE a propósito, asumiendo que un archivo "se reemplaza,
-- nunca se borra". En la práctica eso deja huérfano el objeto anterior
-- cada vez que se sube una foto nueva con un nombre distinto (p. ej. el
-- nombre original del archivo del celular), y sin política de DELETE nadie
-- puede limpiar esos huérfanos salvo con la secret key.
--
-- Decisión sobre reemplazo de foto: la app (Fase 2 UI) sube siempre a una
-- ruta fija por perro — perfil/foto.jpg — normalizando el formato de
-- salida a JPEG en la compresión del lado del cliente, sin importar el
-- formato original de la foto tomada con el celular. Así, reemplazar la
-- foto de perfil es un simple upsert sobre la MISMA ruta (cubierto por la
-- política de UPDATE ya existente), no crea huérfanos y no necesita DELETE
-- en el camino normal. Los comprobantes de requisitos sanitarios siguen el
-- mismo principio: una ruta fija por aplicación
-- (requisitos/{requisito_aplicado_id}/comprobante.jpg), no por nombre de
-- archivo original.
--
-- Aun así, el staff necesita poder borrar: una foto subida al perro
-- equivocado, un comprobante subido por error, o simplemente quitar la
-- foto de un perro sin subir otra. Misma validación de propiedad que
-- INSERT/UPDATE en esta tabla (admin/recepción, contra el {perro_id} real
-- de la ruta, no contra el nombre de la carpeta). El cliente sigue sin
-- ninguna política de DELETE — no puede borrar nada, ni lo suyo ni ajeno.
create policy perros_archivos_delete_staff on storage.objects
for delete to authenticated
using (
  bucket_id = 'perros-archivos'
  and public.current_rol() in ('admin', 'recepcion')
);
