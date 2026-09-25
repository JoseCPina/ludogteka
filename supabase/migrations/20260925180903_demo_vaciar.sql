-- PeluDesk: vaciar el negocio DEMO para volver a sembrarlo.
--
-- El demo que exploran los prospectos (plan 'demo') tiene fechas: "hoy",
-- la ocupación de la semana, el mes de la utilidad. Con el tiempo se
-- queda viejo, y se re-siembra con scripts/demo/sembrar-demo.mjs, que
-- antes lo vacía con esta función.
--
-- Borra TODO lo del negocio salvo lo que crear_negocio le copió de base
-- (grupos de raza, requisitos, alertas, descuentos, áreas, categorías de
-- gasto, tipos de contrato, servicios, cupo, horario, tope de descuentos)
-- y las membresías del personal (sus cuentas siguen siendo las mismas).
-- Las de clientes se van con sus expedientes.
--
-- Solo el servidor (service_role), y SOLO un negocio con plan 'demo': la
-- base se niega a vaciar cualquier otro. Borra por pasadas: una tabla que
-- todavía tiene filas que otra apunta (llave foránea) se reintenta en la
-- siguiente pasada, cuando esa otra ya se vació.
create or replace function public.demo_vaciar(p_negocio_id uuid)
returns table (tabla text, borradas bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_tabla text;
  v_n bigint;
  v_pendientes text[];
  v_siguen text[];
  v_pasada int := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and nullif(current_setting('request.jwt.claims', true), '') is not null then
    raise exception 'Solo el servidor vacía el demo.';
  end if;
  select n.plan into v_plan from public.negocios n where n.id = p_negocio_id and n.deleted_at is null;
  if v_plan is distinct from 'demo' then
    raise exception 'Solo se vacía un negocio con plan demo.';
  end if;
  delete from public.membresias m where m.negocio_id = p_negocio_id and m.rol = 'cliente';
  tabla := 'membresias (clientes)'; get diagnostics borradas = row_count; return next;

  v_pendientes := array[
    'adelantos', 'asistencia_correcciones', 'asistencias', 'ausencias', 'bitacora_entradas', 'bonos_clientes',
    'cargos_aplicados', 'categorias_insumo', 'citas_estetica', 'clientes', 'cobro_metodos', 'cobros',
    'comisiones_servicio', 'compras_insumos', 'contratos', 'corte_metodos', 'cortes_caja', 'descuentos_aplicados',
    'devolucion_metodos', 'devoluciones', 'empleados', 'empleados_horario', 'equipo_eventos', 'equipos',
    'esquemas_pago', 'estancia_pertenencias', 'estancias', 'gastos', 'gastos_recurrentes', 'insumos',
    'insumos_costos', 'invitaciones_cliente', 'medicamentos_administrados', 'movimientos_bono', 'movimientos_caja',
    'movimientos_inventario', 'mp_ordenes', 'nomina_pagos', 'perro_accesos_compartidos', 'perro_alergias',
    'perro_alertas', 'perro_historial_dueno', 'perro_medicamentos', 'perros', 'pesos_registrados',
    'plantillas_contrato', 'proveedores', 'recetas_consumo', 'requisitos_sanitarios_aplicados',
    'requisitos_sanitarios_propuestos', 'reservas', 'series_pausas', 'series_recurrentes', 'tarifas',
    'tarifas_dia_semana', 'turnos_caja', 'vacaciones_movimientos', 'vinculacion_eventos'
  ];
  while cardinality(v_pendientes) > 0 loop
    v_pasada := v_pasada + 1;
    if v_pasada > 30 then
      raise exception 'No se pudo vaciar el demo: siguen con filas %.', v_pendientes;
    end if;
    v_siguen := array[]::text[];
    foreach v_tabla in array v_pendientes loop
      begin
        execute format('delete from public.%I where negocio_id = $1', v_tabla) using p_negocio_id;
        get diagnostics v_n = row_count;
        if v_n > 0 then
          tabla := v_tabla; borradas := v_n; return next;
        end if;
      exception when foreign_key_violation then
        v_siguen := array_append(v_siguen, v_tabla);
      end;
    end loop;
    v_pendientes := v_siguen;
  end loop;
  -- Lo que sembró el script en el catálogo copiado (los paquetes) se queda:
  -- el script los reconoce por su clave.
end;
$$;
revoke execute on function public.demo_vaciar(uuid) from public, anon, authenticated;
grant execute on function public.demo_vaciar(uuid) to service_role;

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
    ('usuario_por_email'), ('negocio_publico'), ('email_de_persona_por_telefono'),
    ('persona_en_otro_negocio'), ('es_admin_plataforma'), ('agregar_admin_plataforma'),
    ('plataforma_negocios'), ('plataforma_buscar_personas'), ('plataforma_registrar_evento'),
    ('plataforma_actualizar_negocio'), ('membresia_no_plataforma'), ('plataforma_buscar_personas_por_id'), ('negocio_escribible'), ('negocio_escribible_en'),
    ('slug_libre'), ('registrar_negocio_prueba'), ('puede_registrar_prueba'), ('demo_vaciar')
  ),
  compartidas(nombre) as (values ('razas'), ('tamanos_categoria'), ('tipos_pelaje'), ('unidades_medida'), ('profiles'), ('negocios'), ('plataforma_admins'), ('plataforma_eventos'), ('registros_prueba'))
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
    and c.relname not in (select nombre from compartidas)
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
    and coalesce(pp.qual, '') || coalesce(pp.with_check, '') ~ '(is_staff\(\)|current_rol\(\)|is_admin\(\))'
  union all
  -- Una función que llama a otra que ya no existe truena hasta que alguien
  -- la ejerce (así quedó handle_user_email_confirmed en el paso 2).
  select 'llamada_a_funcion_inexistente', r.proname::text, r.ref
  from (
    select distinct p.proname, (regexp_matches(pg_get_functiondef(p.oid), 'public[.]([a-z_0-9]+)[ ]*[(]', 'g'))[1] as ref
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  ) r
  where not exists (select 1 from pg_proc p2 where p2.proname = r.ref)
    and not exists (select 1 from pg_class c where c.relname = r.ref and c.relnamespace = 'public'::regnamespace);
$$;
revoke execute on function public.auditoria_frontera() from public, anon, authenticated;
grant execute on function public.auditoria_frontera() to service_role;
