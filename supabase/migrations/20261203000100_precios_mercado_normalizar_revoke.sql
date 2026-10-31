-- La función del disparador de precios_mercado nació con el EXECUTE de PUBLIC (lo trae toda función nueva):
-- auditoria_frontera la marcó. Como todas las de public: nadie sin sesión la ejecuta.
revoke execute on function public.precios_mercado_normalizar() from public, anon;
grant execute on function public.precios_mercado_normalizar() to authenticated, service_role;
