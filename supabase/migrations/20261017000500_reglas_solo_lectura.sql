-- Veterinaria, Fase 4 · parte 6: las reglas regulatorias (compartidas) son de solo lectura para
-- el personal de los negocios. Los privilegios por omisión del proyecto daban escritura a
-- authenticated y anon; la RLS ya la filtraba, pero aquí se quita de raíz.
revoke all on public.vet_reglas from anon, authenticated;
revoke all on public.vet_reglas_clasificacion from anon, authenticated;
grant select on public.vet_reglas to authenticated;
grant select on public.vet_reglas_clasificacion to authenticated;
