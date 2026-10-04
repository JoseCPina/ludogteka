-- Ninguna función del esquema public es ejecutable por PUBLIC ni por anon,
-- salvo una lista blanca mínima y explícita.
--
-- Postgres le da EXECUTE a PUBLIC a toda función nueva y Supabase además se lo
-- da a anon: «revoke … from anon» solo quita lo segundo (la llave anónima
-- sigue entrando por PUBLIC). Aquí se quita de las dos en TODAS las funciones
-- de la aplicación (las de extensiones, como btree_gist, se dejan) y se
-- conserva lo que ya tenían authenticated, service_role y peludesk_definer
-- (que lo recibían por PUBLIC). Los triggers no necesitan EXECUTE para correr.
--
-- Lista blanca (las que la llave anónima usa de verdad: resolver el negocio
-- del dominio y la página pública):
--   negocio_por_host, negocio_publico, pagina_publica,
--   telefono_recepcion_publico, modulos_activos, modulo_activo.
--
-- auditoria_frontera() ahora también devuelve 'funcion_ejecutable_por_public_o_anon'
-- por cada función que quede fuera de esa lista: una función nueva sin su
-- revoke hace fallar la auditoría (y por lo tanto el despliegue).

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
      and p.proname not in ('negocio_por_host', 'negocio_publico', 'pagina_publica', 'telefono_recepcion_publico', 'modulos_activos', 'modulo_activo')
      and (has_function_privilege('anon', p.oid, 'execute')
           or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))
  loop
    execute format('grant execute on function %s to authenticated, service_role, peludesk_definer', f.firma);
    execute format('revoke execute on function %s from public, anon', f.firma);
  end loop;
end $$;

-- Lo que se cree de aquí en adelante tampoco le llega a anon por defecto.
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- La auditoría.
do $$
declare
  v_def text;
  v_nuevo text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), chr(13), '') into v_def;
  if position('funcion_ejecutable_por_public_o_anon' in v_def) = 0 then
    v_nuevo := replace(v_def,
$a$    and not exists (select 1 from pg_class c where c.relname = r.ref and c.relnamespace = 'public'::regnamespace);$a$,
$b$    and not exists (select 1 from pg_class c where c.relname = r.ref and c.relnamespace = 'public'::regnamespace)
  union all
  select 'funcion_ejecutable_por_public_o_anon', p.proname::text, pg_get_function_identity_arguments(p.oid)
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
    and p.proname not in ('negocio_por_host', 'negocio_publico', 'pagina_publica', 'telefono_recepcion_publico', 'modulos_activos', 'modulo_activo')
    and (has_function_privilege('anon', p.oid, 'execute')
         or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'));$b$);
    if position('funcion_ejecutable_por_public_o_anon' in v_nuevo) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar la revisión de EXECUTE.';
    end if;
    execute v_nuevo;
  end if;
end $$;
