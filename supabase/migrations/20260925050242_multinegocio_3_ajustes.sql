-- PeluDesk, paso 3: ajustes que salieron al revisar la app contra la base.
--
-- · La secret key (service_role) SALTA la RLS. Una función INVOKER llamada
--   con ella no filtra negocio. Las de configuración "vigente" que el
--   servidor llama con esa llave (cupo, horario, tope de descuentos, hora
--   de cierre, contratos del alta) pasan a SECURITY DEFINER del rol sin
--   BYPASSRLS: así se filtran por el negocio de la petición con cualquier
--   llave. Solo devuelven configuración del negocio, nada de un cliente.
-- · asignar_rol_staff crea la PRIMERA membresía de una persona en un
--   negocio: el rol definer todavía no la ve (no es miembro). Vuelve a ser
--   de postgres (filtra el negocio a mano: ya lo hacía).

alter function public.resolver_cupo_configuracion(date) security definer;
alter function public.resolver_cupo_configuracion(date) owner to peludesk_definer;
alter function public.resolver_tope_descuento_recepcion(date) security definer;
alter function public.resolver_tope_descuento_recepcion(date) owner to peludesk_definer;
alter function public.minutos_retraso_cierre(date, timestamptz) security definer;
alter function public.minutos_retraso_cierre(date, timestamptz) owner to peludesk_definer;
alter function public.tipos_contrato_de_alta(text) security definer;
alter function public.tipos_contrato_de_alta(text) owner to peludesk_definer;

alter function public.asignar_rol_staff(uuid, text, text) owner to postgres;

-- La cuenta de Auth de un correo (para invitar personal que ya tiene
-- cuenta en otro negocio). Solo el servidor.
create or replace function public.usuario_por_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
$$;
revoke execute on function public.usuario_por_email(text) from public, anon, authenticated;
grant execute on function public.usuario_por_email(text) to service_role;

-- Lo público del negocio de la petición: nombre, marca y el contenido de su
-- landing. Sin sesión (la landing y el login lo necesitan). Nada de clientes
-- ni de dinero.
create or replace function public.negocio_publico()
returns table (id uuid, slug text, nombre text, dominio text, zona_horaria text, ciudad text, marca jsonb, landing jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.slug, n.nombre, n.dominio, n.zona_horaria, n.ciudad, n.marca, n.landing
  from public.negocios n
  where n.id = public.negocio_actual() and n.activo and n.deleted_at is null;
$$;
grant execute on function public.negocio_publico() to anon, authenticated, service_role;

create or replace function public.auditoria_frontera()
returns table (tipo text, nombre text, detalle text)
language sql
stable
security definer
set search_path = ''
as $$
  with lista_blanca(nombre) as (values
    ('current_rol'), ('es_miembro'), ('mi_cliente_id'), ('rol_en_negocio'), ('tiene_permiso'), ('mis_permisos'),
    ('persona_en_negocio'), ('zona_negocio'), ('negocio_por_host'), ('mis_negocios'), ('is_admin'), ('is_staff'),
    ('mi_empleado_id'), ('puede_ver_empleado'), ('cuentas_para_empleado'), ('email_de_login_por_telefono'),
    ('existe_usuario_por_email'), ('listar_cuentas'), ('listar_cuentas_sin_vincular'), ('listar_cuentas_vinculadas'),
    ('listar_personal'), ('listar_personal_estetica'), ('handle_new_user'), ('negocio_de_archivo_perro'),
    ('es_dueno_de_archivo_perro'), ('proteger_membresia'), ('crear_negocio'), ('agregar_admin_negocio'),
    ('auditoria_frontera'), ('proteger_columnas_sensibles_profile'), ('asignar_rol_staff'),
    ('usuario_por_email'), ('negocio_publico')
  ),
  compartidas(nombre) as (values ('razas'), ('tamanos_categoria'), ('tipos_pelaje'), ('unidades_medida'), ('profiles'), ('negocios'))
  select 'funcion_definer_postgres', p.proname::text, pg_get_function_identity_arguments(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
    and p.proname not in (select nombre from lista_blanca)
  union all
  select 'tabla_sin_negocio', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname not in (select nombre from compartidas)
    and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped)
  union all
  select 'tabla_sin_politica_negocio', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped)
    and c.relname <> 'negocios'
    and (
      not exists (select 1 from pg_policies pp where pp.schemaname = 'public' and pp.tablename = c.relname
                  and pp.permissive = 'RESTRICTIVE' and pp.qual like '%negocio_actual()%' and pp.qual like '%es_miembro()%')
      or not exists (select 1 from pg_policies pp where pp.schemaname = 'public' and pp.tablename = c.relname
                     and 'peludesk_definer' = any(pp.roles) and pp.qual like '%negocio_actual()%')
      or not c.relrowsecurity
    )
  union all
  select 'vista_sin_security_invoker', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce('security_invoker=true' = any(c.reloptions), false)
  union all
  select 'politica_storage_sin_negocio', pp.policyname::text, coalesce(pp.qual, pp.with_check)
  from pg_policies pp
  where pp.schemaname = 'storage' and pp.tablename = 'objects'
    and coalesce(pp.qual, '') || coalesce(pp.with_check, '') ~ '(is_staff\(\)|current_rol\(\)|is_admin\(\))';
$$;
revoke execute on function public.auditoria_frontera() from public, anon, authenticated;
grant execute on function public.auditoria_frontera() to service_role;
