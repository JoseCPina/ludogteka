-- Quien tiene «Categorías de gastos» (migración 20261203003800) también LEE las categorías: sin la política de SELECT,
-- un insert con RETURNING falla con «new row violates row-level security policy» (lo encontró permisos-staff.mjs).
drop policy if exists categorias_gasto_select on public.categorias_gasto;
create policy categorias_gasto_select on public.categorias_gasto
  for select to authenticated
  using ((select public.tiene_permiso('gastos')) or (select public.tiene_permiso('reportes_financieros')) or (select public.tiene_permiso('categorias_gasto')));
