-- Bot de WhatsApp de ventas y soporte de PeluDesk (28 de septiembre de 2026).
--
-- Es de la PLATAFORMA, no de un negocio: el número de PeluDesk atiende a
-- prospectos y a los admins de los negocios. Por eso sus tablas no llevan
-- negocio_id (van en la lista de compartidas de auditoria_frontera) y solo
-- las escribe el servidor con la secret key; la administración de la
-- plataforma las puede leer. Ningún negocio ni cliente las ve.
--
--   wa_hilos       un hilo por teléfono (lo que el operador ve en Telegram)
--   wa_mensajes    historial del hilo; los entrantes, con su id de WhatsApp
--                  (único: Meta reintenta y no se contesta dos veces)
--   wa_uso_ia      una fila por llamada a la IA (topes diario y mensual)
--   wa_config      el chat de Telegram del operador y otras perillas
--   wa_aprendido   lo que el operador le enseña al bot desde Telegram
--
-- Y bot_cuenta_por_telefono(): lo único que el bot sabe de un negocio, y
-- solo de los negocios donde ESE teléfono es admin.

create table public.wa_hilos (
  id uuid primary key default gen_random_uuid(),
  telefono text not null,
  tipo text not null default 'prospecto' check (tipo in ('prospecto', 'admin', 'personal', 'cliente_de_negocio')),
  -- Solo informativo para el operador (qué negocio administra quien escribe).
  negocio_afectado uuid references public.negocios(id),
  negocio_nombre text,
  resumen text,
  urgencia text not null default 'normal' check (urgencia in ('normal', 'urgente')),
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  telegram_message_id bigint,
  ultimo_humano_at timestamptz,
  ultimo_entrante_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index wa_hilos_telefono on public.wa_hilos (telefono) where deleted_at is null;
create index wa_hilos_telegram on public.wa_hilos (telegram_message_id) where telegram_message_id is not null;
create trigger set_updated_at before insert or update on public.wa_hilos for each row execute function public.set_updated_at();

create table public.wa_mensajes (
  id uuid primary key default gen_random_uuid(),
  telefono text not null,
  quien text not null check (quien in ('usuario', 'agente', 'humano')),
  texto text not null,
  wa_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index wa_mensajes_telefono on public.wa_mensajes (telefono, created_at desc);
create unique index wa_mensajes_wa_id on public.wa_mensajes (wa_message_id) where wa_message_id is not null;
create trigger set_updated_at before insert or update on public.wa_mensajes for each row execute function public.set_updated_at();

create table public.wa_uso_ia (
  id uuid primary key default gen_random_uuid(),
  telefono text not null,
  modelo text not null,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  costo_mxn numeric(10, 4) not null default 0,
  resultado text not null check (resultado in ('respondio', 'escalo', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index wa_uso_ia_telefono on public.wa_uso_ia (telefono, created_at desc);
create index wa_uso_ia_fecha on public.wa_uso_ia (created_at desc);
create trigger set_updated_at before insert or update on public.wa_uso_ia for each row execute function public.set_updated_at();

create table public.wa_config (
  id uuid primary key default gen_random_uuid(),
  clave text not null,
  valor text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index wa_config_clave on public.wa_config (clave) where deleted_at is null;
create trigger set_updated_at before insert or update on public.wa_config for each row execute function public.set_updated_at();

create table public.wa_aprendido (
  id uuid primary key default gen_random_uuid(),
  pregunta text not null,
  respuesta text not null,
  origen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index wa_aprendido_fecha on public.wa_aprendido (created_at desc);
create trigger set_updated_at before insert or update on public.wa_aprendido for each row execute function public.set_updated_at();

-- RLS: la plataforma lee; nadie con sesión escribe (solo el servidor, con
-- la secret key). Ni anon ni un negocio ven nada.
do $$
declare t text;
begin
  foreach t in array array['wa_hilos', 'wa_mensajes', 'wa_uso_ia', 'wa_config', 'wa_aprendido'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.es_admin_plataforma()))', t || '_select_plataforma', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (false)', t || '_sin_escritura', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ── Qué sabe el bot de quien escribe ──
-- Solo de los negocios donde ese teléfono es ADMIN (por su cuenta de
-- PeluDesk: el correo interno del teléfono o el registro de su prueba).
-- Si es personal o cliente de algún negocio, solo se dice eso: ni cuál
-- negocio ni nada de él. Solo el servidor (service_role) la llama, con el
-- teléfono que Meta verificó al entregar el mensaje.
create or replace function public.bot_cuenta_por_telefono(p_telefono text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_personas uuid[];
  v_admin jsonb;
  v_otro text;
begin
  if length(v_tel) = 12 and v_tel like '52%' then v_tel := substr(v_tel, 3); end if;
  if length(v_tel) = 13 and v_tel like '521%' then v_tel := substr(v_tel, 4); end if;
  if length(v_tel) <> 10 then
    return jsonb_build_object('tipo', 'prospecto', 'negocios', '[]'::jsonb);
  end if;

  v_personas := array(
    select u.id from auth.users u where lower(u.email) = 't' || v_tel || '@telefono.ludogteka.mx'
    union
    select r.persona_id from public.registros_prueba r
    where r.telefono = v_tel and r.persona_id is not null and r.deleted_at is null
  );

  select coalesce(jsonb_agg(jsonb_build_object(
      'negocio_id', n.id,
      'nombre', n.nombre,
      'slug', n.slug,
      'dominio', n.dominio,
      'url_publica', n.url_publica,
      'activo', n.activo,
      'plan', n.plan,
      'plan_nombre', p.nombre,
      'prueba_termina_at', n.prueba_termina_at,
      'estado_cobro', public.estado_cobro_en(n.id),
      'periodicidad', s.periodicidad,
      'periodo_fin', s.periodo_fin,
      'cancela_al_terminar', coalesce(s.cancela_al_terminar, false),
      'primer_fallo_at', s.primer_fallo_at,
      'tiene_cuenta_stripe', s.stripe_customer_id is not null
    ) order by n.created_at), '[]'::jsonb)
  into v_admin
  from public.membresias m
  join public.negocios n on n.id = m.negocio_id and n.deleted_at is null
  left join public.planes p on p.id = n.plan_id
  left join public.suscripciones s on s.negocio_id = n.id and s.deleted_at is null
  where m.profile_id = any(v_personas) and m.deleted_at is null and m.rol = 'admin';

  if jsonb_array_length(v_admin) > 0 then
    return jsonb_build_object('tipo', 'admin', 'negocios', v_admin);
  end if;

  select case when bool_or(m.rol in ('recepcion', 'estetica')) then 'personal' else 'cliente_de_negocio' end
  into v_otro
  from public.membresias m
  where m.profile_id = any(v_personas) and m.deleted_at is null;
  if v_otro is null and exists (select 1 from public.clientes c where c.telefono = v_tel and c.deleted_at is null) then
    v_otro := 'cliente_de_negocio';
  end if;
  return jsonb_build_object('tipo', coalesce(v_otro, 'prospecto'), 'negocios', '[]'::jsonb);
end;
$$;
revoke execute on function public.bot_cuenta_por_telefono(text) from public, anon, authenticated;
grant execute on function public.bot_cuenta_por_telefono(text) to service_role;

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
    ('slug_libre'), ('registrar_negocio_prueba'), ('puede_registrar_prueba'), ('demo_vaciar'), ('plataforma_cambiar_plan'), ('plataforma_guardar_plan'), ('plataforma_asignar_plan'), ('evaluar_web_gratis'),
    ('plataforma_cobros'), ('plataforma_pagos_negocio'),
    -- Vault solo lo alcanza postgres; las tres atan todo a negocio_actual().
    ('integracion_guardar_secreto'), ('integracion_leer_secreto'), ('integracion_borrar_secreto'),
    ('plataforma_maps_consumo'), ('plataforma_maps_tope_negocio'), ('plataforma_maps_tope_plan'),
    -- El bot de WhatsApp de la plataforma: lee auth.users y membresías de
    -- todos los negocios, pero solo devuelve los del teléfono que escribe.
    ('bot_cuenta_por_telefono')
  ),
  compartidas(nombre) as (values ('razas'), ('tamanos_categoria'), ('tipos_pelaje'), ('unidades_medida'), ('profiles'), ('negocios'), ('plataforma_admins'), ('plataforma_eventos'), ('registros_prueba'), ('modulos'), ('planes'),
    ('planes_precios_stripe'), ('eventos_stripe'),
    ('wa_hilos'), ('wa_mensajes'), ('wa_uso_ia'), ('wa_config'), ('wa_aprendido'))
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
