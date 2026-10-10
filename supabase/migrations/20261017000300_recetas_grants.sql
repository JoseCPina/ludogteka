-- Veterinaria, Fase 4 · parte 4: la función de cálculo de cantidad también va sin PUBLIC ni anon.
revoke execute on function public.vet_receta_calcular(numeric, numeric, int) from public, anon;
grant execute on function public.vet_receta_calcular(numeric, numeric, int) to authenticated, service_role;
