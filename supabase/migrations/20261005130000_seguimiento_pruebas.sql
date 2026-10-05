-- Seguimiento por WhatsApp a los negocios en prueba (5 de octubre de 2026).
--
-- Mensajes automáticos (plantillas de Meta) a quien se registró en
-- peludesk.mx/registro: día 5, día 10 y día 15 desde el registro. La lógica de
-- QUÉ día toca y cuándo se manda (ventana horaria del negocio) vive en
-- src/lib/seguimiento; aquí vive lo que tiene que ser atómico y verificable en
-- la base: quién es candidato, el apartado único de cada envío, las paradas
-- (respondió, «Ahora no», baja, compró), la lista de exclusión permanente y los
-- conteos de la plataforma.
--
-- Todo es de la PLATAFORMA: las tablas van en `compartidas` de
-- auditoria_frontera (aunque `envios`, `respuestas` y `paradas` llevan
-- negocio_id con ON DELETE CASCADE, no son del negocio: ningún negocio las
-- ve), las lee la administración de PeluDesk y las escribe el servidor (secret
-- key) o las funciones de abajo (de postgres, en la lista blanca). El borrado
-- de un negocio las limpia por su negocio_id.

-- ── Tablas ──
create table public.seguimiento_pruebas_plantillas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,                       -- nombre en Meta (peludesk_prueba_dia5_v1)
  etapa text not null check (etapa in ('dia5', 'dia10', 'dia15')),
  categoria text,                             -- la que Meta asignó (MARKETING / UTILITY)
  estado text not null default 'SIN_ENVIAR',  -- SIN_ENVIAR, PENDING, APPROVED, REJECTED, PAUSED, DISABLED…
  motivo_rechazo text,
  enviada_a_revision_at timestamptz,
  consultada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index seguimiento_pruebas_plantillas_nombre on public.seguimiento_pruebas_plantillas (nombre) where deleted_at is null;

create table public.seguimiento_pruebas_envios (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  etapa text not null check (etapa in ('dia5', 'dia10', 'dia15')),
  plantilla text not null,
  telefono text not null,                     -- 10 dígitos, el del registro
  estado text not null default 'enviando' check (estado in ('enviando', 'enviado', 'fallido')),
  intentos int not null default 1,
  reintentable boolean not null default false,
  perfil_completo boolean,                    -- lo que había al mandar (día 5 escoge plantilla por esto)
  wa_message_id text,
  error text,
  enviado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  -- UNA fila por negocio y etapa, siempre: es lo que impide el doble envío.
  constraint seguimiento_pruebas_envios_unico unique (negocio_id, etapa)
);
create index seguimiento_pruebas_envios_negocio on public.seguimiento_pruebas_envios (negocio_id);

create table public.seguimiento_pruebas_respuestas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  telefono text not null,
  etapa text,                                 -- la última etapa que se le mandó
  tipo text not null check (tipo in ('respuesta', 'boton_ayuda', 'boton_plan', 'ahora_no', 'baja')),
  texto text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index seguimiento_pruebas_respuestas_negocio on public.seguimiento_pruebas_respuestas (negocio_id);

-- Un negocio con fila aquí ya no recibe más seguimiento.
create table public.seguimiento_pruebas_paradas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  motivo text not null check (motivo in ('respuesta', 'boton_ayuda', 'boton_plan', 'ahora_no', 'baja')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  constraint seguimiento_pruebas_paradas_unico unique (negocio_id)
);

-- Quien pidió baja no recibe más mensajes de este tipo, nunca (por teléfono: sobrevive al negocio).
create table public.seguimiento_pruebas_exclusiones (
  id uuid primary key default gen_random_uuid(),
  telefono text not null,
  motivo text not null default 'baja',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  constraint seguimiento_pruebas_exclusiones_unico unique (telefono)
);

create table public.seguimiento_pruebas_ajustes (
  id uuid primary key default gen_random_uuid(),
  clave text not null,
  valor text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index seguimiento_pruebas_ajustes_clave on public.seguimiento_pruebas_ajustes (clave) where deleted_at is null;

do $$
declare t text;
begin
  foreach t in array array['seguimiento_pruebas_plantillas', 'seguimiento_pruebas_envios', 'seguimiento_pruebas_respuestas',
                           'seguimiento_pruebas_paradas', 'seguimiento_pruebas_exclusiones', 'seguimiento_pruebas_ajustes'] loop
    execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.es_admin_plataforma()))', t || '_select_plataforma', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (false)', t || '_sin_escritura', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ── Funciones de la plataforma (la pantalla, con su sesión) ──

create or replace function public.plataforma_seguimiento_pausar(p_pausa boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.soporte_es_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  update public.seguimiento_pruebas_ajustes set valor = case when p_pausa then 'si' else 'no' end where clave = 'pausa' and deleted_at is null;
  if not found then
    insert into public.seguimiento_pruebas_ajustes (clave, valor, created_by) values ('pausa', case when p_pausa then 'si' else 'no' end, null);
  end if;
  insert into public.plataforma_eventos (accion, negocio_id, persona_id, motivo, detalle, created_by)
  values ('seguimiento_pausa', null, null, case when p_pausa then 'Seguimiento de pruebas pausado' else 'Seguimiento de pruebas reanudado' end,
          jsonb_build_object('pausa', p_pausa), auth.uid());
end;
$$;

-- Todo lo que muestra /plataforma/seguimiento, en una llamada.
create or replace function public.plataforma_seguimiento_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_res jsonb;
begin
  if not public.soporte_es_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  select jsonb_build_object(
    'pausa', coalesce((select a.valor from public.seguimiento_pruebas_ajustes a where a.clave = 'pausa' and a.deleted_at is null), 'no') = 'si',
    'plantillas', coalesce((select jsonb_agg(jsonb_build_object('nombre', p.nombre, 'etapa', p.etapa, 'categoria', p.categoria, 'estado', p.estado,
        'motivo_rechazo', p.motivo_rechazo, 'enviada_a_revision_at', p.enviada_a_revision_at, 'consultada_at', p.consultada_at) order by p.nombre)
        from public.seguimiento_pruebas_plantillas p where p.deleted_at is null), '[]'::jsonb),
    'etapas', (select jsonb_object_agg(x.etapa, jsonb_build_object(
        'enviados', (select count(*) from public.seguimiento_pruebas_envios e where e.etapa = x.etapa and e.estado = 'enviado' and e.deleted_at is null),
        'fallidos', (select count(*) from public.seguimiento_pruebas_envios e where e.etapa = x.etapa and e.estado = 'fallido' and e.deleted_at is null),
        'enviando', (select count(*) from public.seguimiento_pruebas_envios e where e.etapa = x.etapa and e.estado = 'enviando' and e.deleted_at is null)))
      from (values ('dia5'), ('dia10'), ('dia15')) x(etapa)),
    'respuestas', jsonb_build_object(
        'total', (select count(*) from public.seguimiento_pruebas_respuestas r where r.deleted_at is null),
        'ayuda', (select count(*) from public.seguimiento_pruebas_respuestas r where r.tipo = 'boton_ayuda' and r.deleted_at is null),
        'plan', (select count(*) from public.seguimiento_pruebas_respuestas r where r.tipo = 'boton_plan' and r.deleted_at is null),
        'ahora_no', (select count(*) from public.seguimiento_pruebas_respuestas r where r.tipo = 'ahora_no' and r.deleted_at is null),
        'baja', (select count(*) from public.seguimiento_pruebas_respuestas r where r.tipo = 'baja' and r.deleted_at is null),
        'otras', (select count(*) from public.seguimiento_pruebas_respuestas r where r.tipo = 'respuesta' and r.deleted_at is null)),
    'bajas', (select count(*) from public.seguimiento_pruebas_exclusiones x where x.deleted_at is null),
    'negocios_detenidos', (select count(*) from public.seguimiento_pruebas_paradas p where p.deleted_at is null),
    'recientes', coalesce((select jsonb_agg(q order by q.cuando desc) from (
        select n.nombre, n.slug, e.etapa, e.plantilla, e.estado, e.intentos, e.error, coalesce(e.enviado_at, e.updated_at) cuando
        from public.seguimiento_pruebas_envios e join public.negocios n on n.id = e.negocio_id
        where e.deleted_at is null order by coalesce(e.enviado_at, e.updated_at) desc limit 25) q), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;

-- Lo enviado en una ventana (para el resumen diario de Telegram).
create or replace function public.seguimiento_resumen_dia(p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.soporte_es_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  return jsonb_build_object(
    'dia5', (select count(*) from public.seguimiento_pruebas_envios e where e.etapa = 'dia5' and e.estado = 'enviado' and e.enviado_at >= p_desde and e.enviado_at < p_hasta),
    'dia10', (select count(*) from public.seguimiento_pruebas_envios e where e.etapa = 'dia10' and e.estado = 'enviado' and e.enviado_at >= p_desde and e.enviado_at < p_hasta),
    'dia15', (select count(*) from public.seguimiento_pruebas_envios e where e.etapa = 'dia15' and e.estado = 'enviado' and e.enviado_at >= p_desde and e.enviado_at < p_hasta),
    'fallidos', (select count(*) from public.seguimiento_pruebas_envios e where e.estado = 'fallido' and e.updated_at >= p_desde and e.updated_at < p_hasta),
    'respuestas', (select count(*) from public.seguimiento_pruebas_respuestas r where r.created_at >= p_desde and r.created_at < p_hasta),
    'bajas', (select count(*) from public.seguimiento_pruebas_respuestas r where r.tipo = 'baja' and r.created_at >= p_desde and r.created_at < p_hasta),
    'pausa', coalesce((select a.valor from public.seguimiento_pruebas_ajustes a where a.clave = 'pausa' and a.deleted_at is null), 'no') = 'si'
  );
end;
$$;

-- ── Funciones del servidor (solo service_role) ──

-- LA misma regla que la oferta de la página web (avance_perfil → «completo»),
-- pero por negocio y sin sesión. avance_perfil() corre con el negocio de la
-- petición; esta con el id que se le da. Si cambia una, se cambia la otra:
-- la prueba seguimiento-dev.mjs compara las dos con un negocio de verdad.
create or replace function public.seguimiento_perfil_completo(p_negocio_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_neg record;
  v_logo text;
  v_direccion text;
  v_fotos int;
  v_precio boolean;
  v_horario boolean;
  v_telefono boolean;
  v_empleado boolean;
  v_cliente boolean;
  v_asistente boolean;
  v_empleados_activo boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.es_admin_plataforma() then
    raise exception 'Solo el servidor.';
  end if;
  select n.marca into v_neg from public.negocios n where n.id = p_negocio_id;
  select p.logo_path, p.direccion into v_logo, v_direccion from public.negocio_perfil p where p.negocio_id = p_negocio_id and p.deleted_at is null;
  select count(*) into v_fotos from public.negocio_fotos f where f.negocio_id = p_negocio_id and f.deleted_at is null;
  v_precio := exists (select 1 from public.tarifas t where t.negocio_id = p_negocio_id and t.deleted_at is null and not t.no_aplica and t.precio is not null);
  v_horario := exists (select 1 from public.cupo_configuracion c where c.negocio_id = p_negocio_id and c.deleted_at is null and c.created_by is not null);
  v_telefono := exists (select 1 from public.cupo_configuracion c where c.negocio_id = p_negocio_id and c.deleted_at is null and c.telefono_recepcion is not null);
  -- modulo_activo('empleados') de ese negocio: disponible por su plan y prendido (sin fila = prendido).
  v_empleados_activo := 'empleados' = any(public.modulos_disponibles_de(p_negocio_id))
    and coalesce((select nm.activo from public.negocio_modulos nm where nm.negocio_id = p_negocio_id and nm.modulo = 'empleados' and nm.deleted_at is null), true);
  v_empleado := not v_empleados_activo or exists (select 1 from public.empleados e where e.negocio_id = p_negocio_id and e.deleted_at is null);
  v_cliente := exists (select 1 from public.clientes c where c.negocio_id = p_negocio_id and c.deleted_at is null);
  v_asistente := v_telefono and v_precio and v_horario and v_empleado and v_cliente;
  return v_asistente
    and (v_logo is not null or (v_neg.marca ->> 'logo') is not null)
    and v_fotos >= 3
    and nullif(btrim(coalesce(v_direccion, '')), '') is not null;
end;
$$;

create or replace function public.seguimiento_candidatos()
returns table (negocio_id uuid, slug text, nombre text, zona text, creado_at timestamptz, prueba_termina_at timestamptz,
               telefono text, persona text, perfil_completo boolean, limite_web timestamptz, excluida boolean, detenido boolean, envios jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.';
  end if;
  return query
  select n.id, n.slug, n.nombre, n.zona_horaria, n.created_at, n.prueba_termina_at,
    r.telefono,
    nullif(btrim(split_part(btrim(coalesce(pr.nombre_completo, '')), ' ', 1)), ''),
    public.seguimiento_perfil_completo(n.id),
    n.created_at + interval '7 days',
    exists (select 1 from public.seguimiento_pruebas_exclusiones x where x.telefono = r.telefono and x.deleted_at is null),
    exists (select 1 from public.seguimiento_pruebas_paradas p where p.negocio_id = n.id and p.deleted_at is null),
    coalesce((select jsonb_object_agg(e.etapa, jsonb_build_object('estado', e.estado, 'intentos', e.intentos, 'reintentable', e.reintentable, 'updated_at', e.updated_at))
              from public.seguimiento_pruebas_envios e where e.negocio_id = n.id and e.deleted_at is null), '{}'::jsonb)
  from public.negocios n
  join lateral (select rp.telefono, rp.persona_id from public.registros_prueba rp
                where rp.negocio_id = n.id and rp.deleted_at is null order by rp.created_at desc limit 1) r on true
  left join public.profiles pr on pr.id = r.persona_id
  -- Solo negocios REALES en prueba: ni el demo (plan 'demo'), ni los suspendidos,
  -- ni los de la casa, ni los que ya contrataron, ni los que ya terminaron la prueba.
  where n.deleted_at is null and n.activo and n.plan = 'prueba' and not n.cobro_exento
    and n.prueba_termina_at is not null and n.prueba_termina_at > now()
    and length(r.telefono) = 10
    and not exists (select 1 from public.suscripciones s where s.negocio_id = n.id and s.deleted_at is null and s.stripe_subscription_id is not null)
  order by n.created_at;
end;
$$;

-- Aparta el envío de UNA etapa. Devuelve el id si este proceso es el que lo manda,
-- o NULL si ya salió, ya se está mandando, hay pausa, el negocio se detuvo o el
-- teléfono pidió baja. La unicidad (negocio, etapa) hace que dos corridas a la
-- vez no manden dos veces. Un fallido reintentable se reintenta UNA vez, 30 min después.
create or replace function public.seguimiento_reservar(p_negocio_id uuid, p_etapa text, p_plantilla text, p_telefono text, p_perfil boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.';
  end if;
  if coalesce((select a.valor from public.seguimiento_pruebas_ajustes a where a.clave = 'pausa' and a.deleted_at is null), 'no') = 'si' then
    return null;
  end if;
  if exists (select 1 from public.seguimiento_pruebas_paradas p where p.negocio_id = p_negocio_id and p.deleted_at is null)
     or exists (select 1 from public.seguimiento_pruebas_exclusiones x where x.telefono = p_telefono and x.deleted_at is null) then
    return null;
  end if;
  insert into public.seguimiento_pruebas_envios as e (negocio_id, etapa, plantilla, telefono, estado, intentos, perfil_completo, created_by)
  values (p_negocio_id, p_etapa, p_plantilla, p_telefono, 'enviando', 1, p_perfil, null)
  on conflict on constraint seguimiento_pruebas_envios_unico do update
    set estado = 'enviando', intentos = e.intentos + 1, plantilla = excluded.plantilla, perfil_completo = excluded.perfil_completo
    where e.estado = 'fallido' and e.reintentable and e.intentos < 2 and e.updated_at < now() - interval '30 minutes'
  returning e.id into v_id;
  return v_id;
end;
$$;

create or replace function public.seguimiento_resultado(p_id uuid, p_ok boolean, p_wa_id text, p_error text, p_reintentable boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.';
  end if;
  update public.seguimiento_pruebas_envios set
    estado = case when p_ok then 'enviado' else 'fallido' end,
    wa_message_id = coalesce(p_wa_id, wa_message_id),
    error = case when p_ok then null else left(coalesce(p_error, 'sin detalle'), 500) end,
    reintentable = (not p_ok) and coalesce(p_reintentable, false),
    enviado_at = case when p_ok then now() else enviado_at end
  where id = p_id;
end;
$$;

create or replace function public.seguimiento_plantilla_guardar(p_nombre text, p_etapa text, p_categoria text, p_estado text, p_motivo text, p_enviada boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.';
  end if;
  update public.seguimiento_pruebas_plantillas set
    etapa = p_etapa, categoria = coalesce(p_categoria, categoria), estado = p_estado, motivo_rechazo = p_motivo,
    enviada_a_revision_at = case when p_enviada then now() else enviada_a_revision_at end, consultada_at = now()
  where nombre = p_nombre and deleted_at is null;
  if not found then
    insert into public.seguimiento_pruebas_plantillas (nombre, etapa, categoria, estado, motivo_rechazo, enviada_a_revision_at, consultada_at, created_by)
    values (p_nombre, p_etapa, p_categoria, p_estado, p_motivo, case when p_enviada then now() end, now(), null);
  end if;
end;
$$;

-- Llega un mensaje de WhatsApp: si ese teléfono recibió seguimiento, lo registra
-- (cualquier respuesta DETIENE el seguimiento de su negocio; «Ahora no» también;
-- una baja lo deja en la lista de exclusión para siempre) y devuelve el contexto para
-- que el bot no lo trate como número desconocido. NULL = a ese teléfono no se le mandó nada.
-- p_tipo lo decide el servidor (src/lib/seguimiento/respuestas.ts).
create or replace function public.seguimiento_registrar_respuesta(p_telefono text, p_texto text, p_tipo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_ult record;
  v_hay boolean;
  v_ids uuid[];
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.';
  end if;
  if p_tipo not in ('respuesta', 'boton_ayuda', 'boton_plan', 'ahora_no', 'baja') then
    raise exception 'Tipo de respuesta desconocido.';
  end if;
  if length(v_tel) = 12 and v_tel like '52%' then v_tel := substr(v_tel, 3); end if;
  if length(v_tel) = 13 and v_tel like '521%' then v_tel := substr(v_tel, 4); end if;
  if length(v_tel) <> 10 then
    return null;
  end if;

  -- La última etapa mandada a ese teléfono.
  select e.negocio_id, e.etapa, e.plantilla, e.enviado_at, e.perfil_completo, n.nombre, n.created_at, n.prueba_termina_at, n.plan into v_ult
  from public.seguimiento_pruebas_envios e join public.negocios n on n.id = e.negocio_id
  where e.telefono = v_tel and e.estado = 'enviado' and e.deleted_at is null
  order by e.enviado_at desc limit 1;
  v_hay := found;
  if not v_hay then
    return null;
  end if;

  v_ids := array(select distinct e.negocio_id from public.seguimiento_pruebas_envios e where e.telefono = v_tel and e.estado = 'enviado' and e.deleted_at is null);
  foreach v_id in array v_ids loop
    insert into public.seguimiento_pruebas_respuestas (negocio_id, telefono, etapa, tipo, texto, created_by)
    values (v_id, v_tel, v_ult.etapa, p_tipo, left(coalesce(p_texto, ''), 500), null);
    insert into public.seguimiento_pruebas_paradas (negocio_id, motivo, created_by)
    values (v_id, case when p_tipo = 'respuesta' then 'respuesta' else p_tipo end, null)
    on conflict on constraint seguimiento_pruebas_paradas_unico do nothing;
  end loop;
  if p_tipo = 'baja' then
    insert into public.seguimiento_pruebas_exclusiones (telefono, motivo, created_by) values (v_tel, 'baja', null)
    on conflict on constraint seguimiento_pruebas_exclusiones_unico do nothing;
  end if;

  return jsonb_build_object(
    'tipo', p_tipo,
    'negocio_id', v_ult.negocio_id,
    'negocio', v_ult.nombre,
    'etapa', v_ult.etapa,
    'plantilla', v_ult.plantilla,
    'enviado_at', v_ult.enviado_at,
    'dia', (now()::date - v_ult.created_at::date),
    'perfil_completo', public.seguimiento_perfil_completo(v_ult.negocio_id),
    'perfil_completo_al_enviar', v_ult.perfil_completo,
    'plan', v_ult.plan,
    'prueba_termina_at', v_ult.prueba_termina_at
  );
end;
$$;

-- Permisos: lo de la plataforma, con su sesión o el servidor; lo demás, solo el servidor.
revoke execute on function public.plataforma_seguimiento_pausar(boolean) from public, anon;
revoke execute on function public.plataforma_seguimiento_resumen() from public, anon;
revoke execute on function public.seguimiento_resumen_dia(timestamptz, timestamptz) from public, anon;
revoke execute on function public.seguimiento_perfil_completo(uuid) from public, anon;
revoke execute on function public.seguimiento_candidatos() from public, anon, authenticated;
revoke execute on function public.seguimiento_reservar(uuid, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.seguimiento_resultado(uuid, boolean, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.seguimiento_plantilla_guardar(text, text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.seguimiento_registrar_respuesta(text, text, text) from public, anon, authenticated;
grant execute on function public.plataforma_seguimiento_pausar(boolean) to authenticated, service_role;
grant execute on function public.plataforma_seguimiento_resumen() to authenticated, service_role;
grant execute on function public.seguimiento_resumen_dia(timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.seguimiento_perfil_completo(uuid) to service_role;
grant execute on function public.seguimiento_candidatos() to service_role;
grant execute on function public.seguimiento_reservar(uuid, text, text, text, boolean) to service_role;
grant execute on function public.seguimiento_resultado(uuid, boolean, text, text, boolean) to service_role;
grant execute on function public.seguimiento_plantilla_guardar(text, text, text, text, text, boolean) to service_role;
grant execute on function public.seguimiento_registrar_respuesta(text, text, text) to service_role;

-- Tablas compartidas y funciones de postgres: a la auditoría.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.auditoria_frontera()'::regprocedure) into v_def;
  if position('seguimiento_pruebas_envios' in v_def) = 0 then
    v_def := replace(v_def, $a$('resumen_ajustes'))$a$, $b$('resumen_ajustes'),
      ('seguimiento_pruebas_plantillas'), ('seguimiento_pruebas_envios'), ('seguimiento_pruebas_respuestas'),
      ('seguimiento_pruebas_paradas'), ('seguimiento_pruebas_exclusiones'), ('seguimiento_pruebas_ajustes'))$b$);
    v_def := replace(v_def, $a$('plataforma_anotar_telegram')$a$, $b$('plataforma_anotar_telegram'),
    -- Seguimiento por WhatsApp a negocios en prueba (tablas y funciones de la plataforma).
    ('plataforma_seguimiento_pausar'), ('plataforma_seguimiento_resumen'), ('seguimiento_resumen_dia'), ('seguimiento_perfil_completo'),
    ('seguimiento_candidatos'), ('seguimiento_reservar'), ('seguimiento_resultado'), ('seguimiento_plantilla_guardar'),
    ('seguimiento_registrar_respuesta')$b$);
    if position('seguimiento_pruebas_envios' in v_def) = 0 or position('seguimiento_registrar_respuesta' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar el seguimiento de pruebas.';
    end if;
    execute v_def;
  end if;
end $$;
