-- El "ícono de siempre" de Ludogteka (public/iconos/ludogteka.ico) resultó ser
-- el triángulo de Vercel, no un ícono del negocio. Se retira de su
-- configuración: sin marca.favicon, la app arma el ícono con su inicial sobre
-- su color (marca.color #4458a7) en 16, 32, 48, 180 y 512. Solo configuración
-- visual; no toca datos del negocio.
update public.negocios
set marca = coalesce(marca, '{}'::jsonb) - 'favicon'
where id = '10000000-0000-4000-8000-000000000001'
  and marca->>'favicon' = '/iconos/ludogteka.ico';
