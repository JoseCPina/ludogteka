-- La migración anterior revocó a `anon` y aun así quedaron 19 funciones
-- que la llave anónima podía seguir llamando, entre ellas las cinco de
-- reportes y vincular_cliente_por_email. La causa: hay DOS caminos por los
-- que anon termina con EXECUTE, y solo se había cerrado uno.
--
--   1. El grant por defecto de POSTGRES: al crear una función, Postgres le
--      concede EXECUTE a PUBLIC, y anon es miembro de PUBLIC como todo el
--      mundo. Revocarle a anon no sirve de nada si PUBLIC lo sigue
--      teniendo.
--   2. El ALTER DEFAULT PRIVILEGES de SUPABASE, que además le da un grant
--      DIRECTO a anon/authenticated/service_role. Ese sí se quita
--      nombrando a anon, y es el que la migración anterior cerró.
--
-- O sea que las dos formas de escribirlo que uno intentaría por separado
-- —`revoke from public` o `revoke from anon`— fallan cada una por su
-- lado, y por motivos distintos. Hay que hacer las dos.
--
-- Se preserva exactamente lo que `authenticated` podía ejecutar antes:
-- se consulta ANTES de revocar y se le vuelve a conceder después, función
-- por función. Sin eso, revocarle a PUBLIC le quitaría de paso el permiso
-- a las funciones que el staff sí usa con su sesión, y quedaría media app
-- rota — incluidas las que a propósito NO debe tener, como
-- completar_alta_cliente, que se queda revocada porque ya lo estaba.
do $$
declare
  f record;
  tenia_authenticated boolean;
  conservadas text[] := array['current_rol', 'is_admin', 'is_staff', 'fecha_negocio', 'hora_negocio'];
begin
  for f in
    select p.oid, p.oid::regprocedure as firma, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname <> all (conservadas)
  loop
    tenia_authenticated := has_function_privilege('authenticated', f.oid, 'EXECUTE');

    execute format('revoke execute on function %s from public', f.firma);
    execute format('revoke execute on function %s from anon', f.firma);

    if tenia_authenticated then
      execute format('grant execute on function %s to authenticated', f.firma);
    end if;
  end loop;
end
$$;

-- Las cinco conservadas se quedan con EXECUTE para anon a propósito: las
-- evalúan políticas de RLS y vistas. Si anon no pudiera ejecutarlas, una
-- consulta anónima a una tabla protegida devolvería "permission denied for
-- function is_staff" en vez de cero filas — un error crudo donde hoy hay
-- un vacío limpio, que además confirma que la función existe. Lo que
-- devuelven no es información de nadie: el rol del propio llamador
-- ('anonimo'), dos booleanos sobre sí mismo, y la fecha y hora del negocio.
