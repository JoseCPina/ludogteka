-- La lista de exclusión («Bajas de publicidad») lleva también los teléfonos que escribieron BAJA y que no son de un
-- prospecto: su miembro es «baja:<sha256 del teléfono>» (21 de octubre de 2026).
alter table public.meta_audiencias_miembros drop constraint if exists meta_audiencias_miembros_miembro_check;
alter table public.meta_audiencias_miembros add constraint meta_audiencias_miembros_miembro_check
  check (miembro ~ '^(prospecto|negocio):[0-9a-f-]{36}$' or miembro ~ '^baja:[0-9a-f]{64}$');
