-- La fila de `negocios` y los catálogos clínicos de la plataforma, solo para el
-- personal (19 de octubre de 2026).
--
-- `negocios` trae el plan, la cortesía de módulos, `cobro_exento`, el tope de
-- consultas de Maps y el fin de la prueba: datos comerciales del negocio que
-- cualquier dueño de perro podía leer por la API con su propia sesión (la
-- política dejaba pasar a todo miembro del negocio, cliente incluido).
-- `principios_activos` y `vet_diagnosticos` (con sus notas de «por confirmar» y
-- fuentes) tampoco son de un dueño.
--
-- Lo que el portal necesita del negocio sale de funciones (`negocio_por_host`,
-- `negocio_publico`, `estado_cobro`…); las tres funciones que leían `negocios`
-- con los derechos de quien llama pasan a SECURITY DEFINER de peludesk_definer,
-- que solo ve el negocio de la petición.

alter function public.estado_cobro_en(uuid) security definer;
alter function public.estado_cobro_en(uuid) owner to peludesk_definer;
alter function public.negocio_puede_simular() security definer;
alter function public.negocio_puede_simular() owner to peludesk_definer;
alter function public.maps_tope_mes() security definer;
alter function public.maps_tope_mes() owner to peludesk_definer;
revoke execute on function public.estado_cobro_en(uuid), public.negocio_puede_simular(), public.maps_tope_mes() from public, anon;
grant execute on function public.estado_cobro_en(uuid), public.negocio_puede_simular(), public.maps_tope_mes() to authenticated, service_role;

drop policy if exists negocios_select_miembro on public.negocios;
create policy negocios_select_personal on public.negocios
  for select to authenticated
  using (id = (select public.negocio_actual()) and (select public.es_miembro()) and (select public.is_staff()));

drop policy if exists principios_activos_select on public.principios_activos;
create policy principios_activos_select on public.principios_activos
  for select to authenticated
  using (deleted_at is null and ((select public.is_staff()) or (select public.es_admin_plataforma())));
create policy principios_activos_select_definer on public.principios_activos
  for select to peludesk_definer using (deleted_at is null);

drop policy if exists vet_diagnosticos_select on public.vet_diagnosticos;
create policy vet_diagnosticos_select on public.vet_diagnosticos
  for select to authenticated
  using (deleted_at is null and ((select public.is_staff()) or (select public.es_admin_plataforma())));
create policy vet_diagnosticos_select_definer on public.vet_diagnosticos
  for select to peludesk_definer using (deleted_at is null);
