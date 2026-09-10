-- Cierra la superficie que quedaba: `anon` podía LLAMAR a los 56 RPC del
-- proyecto. Después del arreglo de los guardias todos rechazan al anónimo
-- por su cuenta, pero que ni siquiera puedan invocarse es la capa que
-- debía existir desde el principio — y que varias migraciones creían tener.
--
-- El caso que lo deja claro es existe_usuario_por_email, de Fase 1. Su
-- propio comentario dice: "Solo `service_role` la puede llamar (no
-- `anon`/`authenticated`): expone si un correo está registrado, así que no
-- debe quedar abierta a enumeración". La intención era exactamente la
-- correcta. Lo que no funcionó fue cómo se implementó:
--
--     revoke execute on function ... from public;
--     grant  execute on function ... to service_role;
--
-- En Supabase eso NO alcanza. El proyecto trae ALTER DEFAULT PRIVILEGES
-- que le concede EXECUTE a anon/authenticated/service_role sobre cada
-- función nueva, y esa es una concesión DIRECTA al rol: quitarle el
-- permiso a `public` no la toca. Verificado en desarrollo antes de esta
-- migración: con la anon key pelada, existe_usuario_por_email respondió
-- (un oráculo de enumeración de correos abierto a internet) y
-- vincular_cliente_por_email —función interna que solo debían llamar los
-- triggers de auth.users— se ejecutó con 204.
--
-- Se revoca a anon en TODAS las funciones de public excepto cinco
-- helpers. Esos se quedan a propósito: los evalúan políticas de RLS y
-- vistas, y si anon no pudiera ejecutarlos, una consulta anónima a una
-- tabla protegida devolvería "permission denied for function is_staff" en
-- vez de simplemente cero filas. Un error crudo donde hoy hay un vacío
-- limpio es peor: filtra que la función existe y rompe el modo de fallo
-- que ya está probado.
do $$
declare
  f record;
  conservadas text[] := array['current_rol', 'is_admin', 'is_staff', 'fecha_negocio', 'hora_negocio'];
begin
  for f in
    select p.oid::regprocedure as firma, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname <> all (conservadas)
  loop
    execute format('revoke execute on function %s from anon', f.firma);
  end loop;
end
$$;

-- Además, la que nunca debió ser alcanzable ni con sesión: la vinculación
-- automática por correo la llaman los triggers de auth.users, que corren
-- como SECURITY DEFINER (o sea, como el dueño, no como quien pidió). Nada
-- del lado del cliente la necesita — verificado con un grep sobre src/.
revoke execute on function public.vincular_cliente_por_email(uuid) from authenticated;

-- Y a existe_usuario_por_email se le nombran los dos roles que el `from
-- public` no alcanzaba. Aquí NO se le agrega un guardia de rol adentro, y
-- vale la pena decir por qué: su único llamador legítimo es
-- /api/staff/invite, que corre en el servidor con la secret key. Ahí no
-- hay auth.uid() ninguno, así que un `if not is_admin() then raise` la
-- dejaría inservible justo para quien sí debe usarla. La autorización de
-- ese endpoint ya está donde corresponde: la route verifica contra la base
-- que quien llama es admin antes de tocar nada. El límite de esta función
-- es a quién se le concede, no un rol que no existe en su contexto.
revoke execute on function public.existe_usuario_por_email(text) from anon;
revoke execute on function public.existe_usuario_por_email(text) from authenticated;
grant execute on function public.existe_usuario_por_email(text) to service_role;
