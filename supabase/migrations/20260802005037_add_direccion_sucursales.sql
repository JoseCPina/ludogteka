-- Dirección de Ludogteka (Fase 10, cotizador de recolección): el
-- domicilio del negocio en sí, punto B del recorrido base→domicilio del
-- cliente→Ludogteka. sucursales ya existía para esto exacto ("se deja la
-- tabla lista para multi-sucursal futuro") — se le agregan las columnas
-- en vez de hardcodear la dirección en el código o crear una tabla nueva.
alter table public.sucursales
  add column direccion text,
  add column lat double precision,
  add column lng double precision;

-- Hueco encontrado al escribir esta migración, no relacionado con
-- Recolección: sucursales tenía RLS activado desde su creación (Fase 0)
-- con CERO políticas — bloqueaba en silencio cualquier lectura vía API,
-- nadie lo había notado porque nada leía la tabla hasta ahora. Se corrige
-- de una vez, no se documenta solo como pendiente.
create policy sucursales_select_staff on public.sucursales
  for select to authenticated
  using (public.is_staff());

create policy sucursales_update_admin on public.sucursales
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
