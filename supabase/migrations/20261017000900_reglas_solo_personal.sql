-- Veterinaria, Fase 4 · parte 10: las reglas regulatorias las lee el personal y la plataforma, no
-- el cliente del portal (la auditoría de dinero marca cualquier columna «valor» legible por un dueño).
-- Las funciones de la base las siguen leyendo con su propio rol.
drop policy vet_reglas_select on public.vet_reglas;
create policy vet_reglas_select on public.vet_reglas for select to authenticated
  using ((select public.is_staff()) or (select public.es_admin_plataforma()));
create policy vet_reglas_definer on public.vet_reglas for select to peludesk_definer using (true);
drop policy vet_reglas_clasificacion_select on public.vet_reglas_clasificacion;
create policy vet_reglas_clasificacion_select on public.vet_reglas_clasificacion for select to authenticated
  using ((select public.is_staff()) or (select public.es_admin_plataforma()));
create policy vet_reglas_clasificacion_definer on public.vet_reglas_clasificacion for select to peludesk_definer using (true);
