-- Recordatorios automáticos por WhatsApp (25 de octubre de 2026).
--
-- PeluDesk manda solo, desde su número (+52 56 4916 0742) y con plantillas UTILITY aprobadas por Meta, a nombre del
-- negocio dentro del texto:
--   estetica     la cita de estética, el día anterior a la hora de envío del negocio (10:00 por omisión);
--   veterinaria  la cita veterinaria, igual, con el médico;
--   llegada      la llegada a hotel o guardería (una por reserva y día de entrada, con todos sus perros);
--   listo        «ya está listo» al terminar la cita de estética (al pasar a «finalizada»);
--   vacuna       la próxima vacuna o desparasitación, 7 días antes (de la cola carnet_recordatorios).
-- La tarea /api/cron/recordatorios (cada 15 minutos) programa (recordatorios_programar), toma lo que ya toca
-- (recordatorios_tomar: revalida la cita, aplica los 30 gratis y el tope) y manda; el webhook guarda la entrega
-- (recordatorio_entrega: un mensaje entregado y cobrable por Meta cuenta, uno fallido no) y las respuestas
-- (recordatorio_responder: «Confirmo» confirma la cita, «Necesito cambiarla» avisa al negocio; texto libre y BAJA:
-- recordatorio_texto_entrante).
--
--   recordatorios_ajustes     (negocio) qué tipos salen, a qué hora y el tope mensual de excedente.
--   recordatorios_wa          (negocio) un renglón por recordatorio: cuándo toca, su estado, su respuesta.
--   recordatorios_mensajes    (negocio) lo que el cliente contestó y el negocio tiene que atender.
--   clientes.recordatorios_whatsapp  el consentimiento (con origen y fecha).
--   wa_precios                (plataforma, pública) lo que nos cobra Meta y lo que se cobra al negocio.
--   wa_recordatorios_cobro    (plataforma) un renglón por mensaje entregado cobrable: número del mes, excedente,
--                             precio y costo de ese momento y si ya se reportó a Stripe.

-- ── Consentimiento ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Los clientes que ya existen quedan aceptados (el primer mensaje dice cómo darse de baja: el pie de cada plantilla).
alter table public.clientes
  add column recordatorios_whatsapp boolean not null default true,
  add column recordatorios_whatsapp_origen text not null default 'existente'
    check (recordatorios_whatsapp_origen in ('existente', 'mostrador', 'alta_link', 'portal', 'baja_whatsapp', 'personal', 'importacion')),
  add column recordatorios_whatsapp_cambio_at timestamptz;
-- Los que se den de alta de aquí en adelante: «personal» salvo que la pantalla diga de dónde (mostrador, link, portal).
alter table public.clientes alter column recordatorios_whatsapp_origen set default 'personal';

-- El teléfono de 10 dígitos con el 52 de México, en SHA-256 (como lo entrega Meta): así se reconoce quién contesta
-- sin guardar el número en la tabla de recordatorios.
create or replace function public._rec_hash_telefono(p_telefono text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when length(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g')) >= 10
    then encode(sha256(convert_to('52' || right(regexp_replace(p_telefono, '\D', '', 'g'), 10), 'UTF8')), 'hex')
  end;
$$;
revoke execute on function public._rec_hash_telefono(text) from public, anon;
grant execute on function public._rec_hash_telefono(text) to authenticated, service_role;

-- El dueño de la mascota prende o apaga sus recordatorios desde su portal.
create or replace function public.mis_recordatorios_whatsapp(p_acepta boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.mi_cliente_id();
begin
  if v_cliente is null or p_acepta is null then
    raise exception 'Solo el dueño desde su portal.' using errcode = '42501';
  end if;
  update public.clientes c
     set recordatorios_whatsapp = p_acepta, recordatorios_whatsapp_origen = 'portal', recordatorios_whatsapp_cambio_at = now()
   where c.id = v_cliente and c.negocio_id = public.negocio_actual() and c.recordatorios_whatsapp is distinct from p_acepta;
end;
$$;
alter function public.mis_recordatorios_whatsapp(boolean) owner to peludesk_definer;
revoke execute on function public.mis_recordatorios_whatsapp(boolean) from public, anon;
grant execute on function public.mis_recordatorios_whatsapp(boolean) to authenticated;

-- ── Ajustes por negocio ────────────────────────────────────────────────────────────────────────────────────────────
create table public.recordatorios_ajustes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  estetica boolean not null default false,
  veterinaria boolean not null default false,
  llegada boolean not null default false,
  listo boolean not null default false,
  vacuna boolean not null default false,
  hora_envio time not null default '10:00',
  -- Pesos de excedente al mes, sin IVA. NULL = sin tope.
  tope_excedente numeric(10,2) default 200 check (tope_excedente is null or tope_excedente >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (hora_envio between '07:00' and '20:00')
);
create unique index recordatorios_ajustes_negocio_uq on public.recordatorios_ajustes (negocio_id) where deleted_at is null;

create table public.recordatorios_wa (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  tipo text not null check (tipo in ('estetica', 'veterinaria', 'llegada', 'listo', 'vacuna')),
  -- La cita (citas_estetica / vet_citas), la reserva (llegada) o el renglón de carnet_recordatorios (vacuna).
  ref_id uuid not null,
  cliente_id uuid not null references public.clientes(id),
  perro_id uuid references public.perros(id),
  -- A qué se refiere: el inicio de la cita, el día de llegada o el de la dosis (a medianoche del negocio). Si la cita
  -- cambia de hora, este renglón se cancela y nace otro.
  para_at timestamptz not null,
  programado_at timestamptz not null,
  -- Después de esto ya no se manda (el día de la cita para los del día anterior).
  vence_at timestamptz not null,
  estado text not null default 'programado'
    check (estado in ('programado', 'pausado', 'enviando', 'enviado', 'entregado', 'leido', 'fallido', 'cancelado', 'omitido')),
  motivo text check (motivo is null or length(motivo) <= 300),
  tomado_at timestamptz,
  enviado_at timestamptz,
  entregado_at timestamptz,
  leido_at timestamptz,
  fallido_at timestamptz,
  wa_id text,
  plantilla text,
  telefono_hash text,
  telefono_ult4 text check (telefono_ult4 is null or telefono_ult4 ~ '^[0-9]{4}$'),
  -- Lo que se le dijo (las variables de la plantilla), para enseñarlo en la ficha.
  texto text check (texto is null or length(texto) <= 1024),
  -- Meta lo cobra (pricing.billable del estado de entrega). NULL mientras no se sabe.
  cobrable boolean,
  respuesta text check (respuesta is null or respuesta in ('confirmo', 'pide_cambio', 'agendar', 'despues')),
  respuesta_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index recordatorios_wa_unico on public.recordatorios_wa (negocio_id, tipo, ref_id, para_at) where deleted_at is null;
create index recordatorios_wa_negocio on public.recordatorios_wa (negocio_id, estado, programado_at) where deleted_at is null;
create index recordatorios_wa_ref on public.recordatorios_wa (ref_id) where deleted_at is null;
create unique index recordatorios_wa_wa_id on public.recordatorios_wa (wa_id) where wa_id is not null;
create index recordatorios_wa_telefono on public.recordatorios_wa (telefono_hash, enviado_at desc) where telefono_hash is not null;

create table public.recordatorios_mensajes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  recordatorio_id uuid references public.recordatorios_wa(id),
  cliente_id uuid references public.clientes(id),
  perro_id uuid references public.perros(id),
  tipo text not null check (tipo in ('pide_cambio', 'solicitud_cita', 'mensaje', 'baja')),
  texto text check (texto is null or length(texto) <= 2000),
  atendido_at timestamptz,
  atendido_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index recordatorios_mensajes_negocio on public.recordatorios_mensajes (negocio_id, created_at desc) where deleted_at is null;
create index recordatorios_mensajes_pendientes on public.recordatorios_mensajes (negocio_id) where deleted_at is null and atendido_at is null;

do $$
declare
  t text;
begin
  foreach t in array array['recordatorios_ajustes', 'recordatorios_wa', 'recordatorios_mensajes'] loop
    execute format('create index %I on public.%I (negocio_id)', t || '_negocio_id', t);
    execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %I on public.%I as restrictive for all to authenticated
      using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
      with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))$p$, t || '_negocio', t);
    execute format($p$create policy %I on public.%I for all to peludesk_definer
      using (negocio_id = (select public.negocio_actual()))
      with check (negocio_id = (select public.negocio_actual()))$p$, t || '_negocio_definer', t);
    execute format($p$create policy %I on public.%I as restrictive for insert to authenticated, peludesk_definer
      with check ((select public.exigir_negocio_escribible()))$p$, t || '_escritura_ins', t);
    execute format($p$create policy %I on public.%I as restrictive for update to authenticated, peludesk_definer
      using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()))$p$, t || '_escritura_upd', t);
    execute format($p$create policy %I on public.%I as restrictive for delete to authenticated, peludesk_definer
      using ((select public.exigir_negocio_escribible()))$p$, t || '_escritura_del', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to peludesk_definer', t);
    -- Leer: el personal del negocio (el dueño de la mascota no: lo suyo le llega por WhatsApp). Escribir: solo por
    -- las funciones de abajo.
    execute format($p$create policy %I on public.%I for select to authenticated using ((select public.is_staff()))$p$, t || '_select_staff', t);
    execute format($p$create policy %I on public.%I for insert to authenticated with check (false)$p$, t || '_sin_insert', t);
  end loop;
end $$;

-- ── Precios (de la plataforma) ─────────────────────────────────────────────────────────────────────────────────────
create table public.wa_precios (
  id uuid primary key default gen_random_uuid(),
  vigente_desde date not null,
  mercado text not null default 'MX',
  categoria text not null default 'utility' check (categoria in ('utility', 'marketing', 'authentication', 'service')),
  -- Lo que cobra Meta por mensaje entregado en la moneda en que factura nuestra cuenta (la WABA de PeluDesk: MXN).
  moneda_meta text not null check (moneda_meta in ('MXN', 'USD')),
  costo_meta numeric(12,6) not null check (costo_meta >= 0),
  -- Pesos por unidad de moneda_meta el día de corte (1 si Meta ya cobra en pesos).
  tipo_cambio numeric(12,6) not null check (tipo_cambio > 0),
  costo_mxn numeric(12,6) not null check (costo_mxn >= 0),
  -- Lo que se cobra al negocio por mensaje (sin IVA): el doble de costo_mxn redondeado a centavos.
  precio_mxn numeric(10,2) not null check (precio_mxn >= 0),
  gratis_mes int not null default 30 check (gratis_mes >= 0),
  fuente text not null check (length(fuente) between 3 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index wa_precios_vigencia on public.wa_precios (mercado, categoria, vigente_desde) where deleted_at is null;
create trigger set_updated_at before insert or update on public.wa_precios for each row execute function public.set_updated_at();
alter table public.wa_precios enable row level security;
-- Es un precio publicado (landing, /precios, bot): lo lee cualquiera. Lo escribe la plataforma.
create policy wa_precios_select on public.wa_precios for select to anon, authenticated using (deleted_at is null);
create policy wa_precios_plataforma on public.wa_precios for all to authenticated
  using ((select public.es_admin_plataforma())) with check ((select public.es_admin_plataforma()));
-- Lo publicado es el precio al negocio y los gratis; lo que nos cobra Meta (costo, tipo de cambio) solo lo leen el
-- servidor y la plataforma (con la llave de servicio, después de comprobar la sesión de la plataforma).
revoke all on public.wa_precios from anon, authenticated;
grant select (id, vigente_desde, mercado, categoria, precio_mxn, gratis_mes, created_at, updated_at, deleted_at) on public.wa_precios to anon, authenticated;

-- Hoja de tarifas de Meta en MXN (la moneda de nuestra WABA), México, utilidad, vigente desde el 1 de octubre de 2026:
-- $0.1565 por mensaje entregado (USD 0.0085 en la hoja en dólares). Precio al negocio: 2 × 0.1565 = 0.313 → $0.31.
insert into public.wa_precios (vigente_desde, mercado, categoria, moneda_meta, costo_meta, tipo_cambio, costo_mxn, precio_mxn, gratis_mes, fuente)
values ('2026-10-01', 'MX', 'utility', 'MXN', 0.1565, 1, 0.1565, 0.31, 30,
        'Hoja de tarifas de Meta en MXN (México, utilidad), vigente desde el 1 de octubre de 2026');

-- El precio vigente en una fecha (para la base; las pantallas leen la tabla).
create or replace function public._wa_precio_en(p_fecha date)
returns public.wa_precios
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.wa_precios p
  where p.deleted_at is null and p.mercado = 'MX' and p.categoria = 'utility' and p.vigente_desde <= p_fecha
  order by p.vigente_desde desc, p.created_at desc
  limit 1;
$$;
revoke execute on function public._wa_precio_en(date) from public, anon, authenticated;
grant execute on function public._wa_precio_en(date) to service_role;

create table public.wa_recordatorios_cobro (
  id uuid primary key default gen_random_uuid(),
  recordatorio_id uuid not null references public.recordatorios_wa(id),
  negocio_id uuid not null references public.negocios(id),
  -- El mes calendario del negocio (día 1).
  mes date not null,
  numero int not null check (numero >= 1),
  excedente boolean not null,
  precio_mxn numeric(10,2) not null,
  costo_mxn numeric(12,6) not null,
  stripe_reportado_at timestamptz,
  stripe_error text check (stripe_error is null or length(stripe_error) <= 500),
  stripe_intentos int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null
);
create unique index wa_recordatorios_cobro_recordatorio on public.wa_recordatorios_cobro (recordatorio_id);
create index wa_recordatorios_cobro_mes on public.wa_recordatorios_cobro (negocio_id, mes);
create index wa_recordatorios_cobro_por_reportar on public.wa_recordatorios_cobro (created_at) where excedente and stripe_reportado_at is null;
create trigger set_updated_at before insert or update on public.wa_recordatorios_cobro for each row execute function public.set_updated_at();
alter table public.wa_recordatorios_cobro enable row level security;
create policy wa_recordatorios_cobro_plataforma on public.wa_recordatorios_cobro for select to authenticated using ((select public.es_admin_plataforma()));
create policy wa_recordatorios_cobro_sin_escritura on public.wa_recordatorios_cobro for insert to authenticated with check (false);
revoke all on public.wa_recordatorios_cobro from anon, authenticated;
grant select on public.wa_recordatorios_cobro to authenticated;

-- ── Ajustes: leer y guardar ────────────────────────────────────────────────────────────────────────────────────────
-- El vacuna arranca como estaba el envío automático de Veterinaria (que este sistema reemplaza).
insert into public.recordatorios_ajustes (negocio_id, vacuna)
select a.negocio_id, true from public.veterinaria_ajustes a
where a.deleted_at is null and a.recordatorios_activos
on conflict do nothing;

create or replace function public.guardar_recordatorios_ajustes(
  p_estetica boolean, p_veterinaria boolean, p_llegada boolean, p_listo boolean, p_vacuna boolean, p_hora time)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (coalesce(public.is_admin(), false) or coalesce(public.tiene_permiso('configuracion_negocio'), false)) then
    raise exception 'Solo quien administra la configuración del negocio puede cambiar los recordatorios.' using errcode = '42501';
  end if;
  if p_hora is null or p_hora < '07:00' or p_hora > '20:00' then
    raise exception 'La hora de envío va de las 7:00 a las 20:00.' using errcode = '22023';
  end if;
  update public.recordatorios_ajustes
     set estetica = coalesce(p_estetica, false), veterinaria = coalesce(p_veterinaria, false), llegada = coalesce(p_llegada, false),
         listo = coalesce(p_listo, false), vacuna = coalesce(p_vacuna, false), hora_envio = p_hora
   where negocio_id = public.negocio_actual() and deleted_at is null;
  if not found then
    insert into public.recordatorios_ajustes (estetica, veterinaria, llegada, listo, vacuna, hora_envio)
    values (coalesce(p_estetica, false), coalesce(p_veterinaria, false), coalesce(p_llegada, false), coalesce(p_listo, false), coalesce(p_vacuna, false), p_hora);
  end if;
  -- Lo programado con la hora anterior se reprograma; lo de un tipo apagado se cancela en la siguiente corrida.
  update public.recordatorios_wa r
     set programado_at = ((((r.para_at at time zone public.zona_negocio())::date - case when r.tipo = 'vacuna' then 7 else 1 end) + p_hora) at time zone public.zona_negocio())
   where r.negocio_id = public.negocio_actual() and r.deleted_at is null and r.estado in ('programado', 'pausado') and r.tipo <> 'listo';
end;
$$;
alter function public.guardar_recordatorios_ajustes(boolean, boolean, boolean, boolean, boolean, time) owner to peludesk_definer;
revoke execute on function public.guardar_recordatorios_ajustes(boolean, boolean, boolean, boolean, boolean, time) from public, anon;
grant execute on function public.guardar_recordatorios_ajustes(boolean, boolean, boolean, boolean, boolean, time) to authenticated;

-- El tope mensual de excedente (dinero: solo el admin). NULL = sin tope.
create or replace function public.guardar_tope_recordatorios(p_tope numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo el administrador del negocio puede cambiar el tope.' using errcode = '42501';
  end if;
  if p_tope is not null and (p_tope < 0 or p_tope > 100000) then
    raise exception 'El tope va de $0 a $100,000.' using errcode = '22023';
  end if;
  update public.recordatorios_ajustes set tope_excedente = p_tope where negocio_id = public.negocio_actual() and deleted_at is null;
  if not found then
    insert into public.recordatorios_ajustes (tope_excedente) values (p_tope);
  end if;
end;
$$;
alter function public.guardar_tope_recordatorios(numeric) owner to peludesk_definer;
revoke execute on function public.guardar_tope_recordatorios(numeric) from public, anon;
grant execute on function public.guardar_tope_recordatorios(numeric) to authenticated;

-- ── ¿Sigue valiendo este recordatorio? NULL si sí; si no, el motivo ────────────────────────────────────────────────
create or replace function public._recordatorio_motivo_invalido(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.recordatorios_wa%rowtype;
  a public.recordatorios_ajustes%rowtype;
  v_zona text;
  v_prendido boolean;
begin
  select * into r from public.recordatorios_wa x where x.id = p_id;
  if not found then
    return 'No existe.';
  end if;
  select * into a from public.recordatorios_ajustes x where x.negocio_id = r.negocio_id and x.deleted_at is null;
  if not found then
    return 'Los recordatorios están apagados.';
  end if;
  v_prendido := case r.tipo when 'estetica' then a.estetica when 'veterinaria' then a.veterinaria when 'llegada' then a.llegada
                             when 'listo' then a.listo when 'vacuna' then a.vacuna else false end;
  if not v_prendido then
    return 'Ese tipo de recordatorio se apagó.';
  end if;
  if not exists (select 1 from public.negocios n where n.id = r.negocio_id and n.activo and n.deleted_at is null and n.plan <> 'demo') then
    return 'El negocio no está activo.';
  end if;
  if not exists (select 1 from public.clientes c where c.id = r.cliente_id and c.deleted_at is null and c.recordatorios_whatsapp) then
    return 'El cliente pidió no recibir recordatorios.';
  end if;
  select n.zona_horaria into v_zona from public.negocios n where n.id = r.negocio_id;
  if r.tipo = 'estetica' then
    if not exists (select 1 from public.citas_estetica c where c.id = r.ref_id and c.deleted_at is null and c.estado in ('reservada', 'confirmada') and c.inicio = r.para_at) then
      return 'La cita se canceló o cambió de hora.';
    end if;
  elsif r.tipo = 'veterinaria' then
    if not exists (select 1 from public.vet_citas c where c.id = r.ref_id and c.deleted_at is null and c.estado in ('programada', 'confirmada') and c.inicia_at = r.para_at) then
      return 'La cita se canceló o cambió de hora.';
    end if;
  elsif r.tipo = 'llegada' then
    if not exists (select 1 from public.estancias e where e.reserva_id = r.ref_id and e.deleted_at is null and e.estado in ('reservada', 'confirmada')
                     and e.fecha_entrada = (r.para_at at time zone v_zona)::date) then
      return 'La reserva se canceló o cambió de fecha.';
    end if;
  elsif r.tipo = 'listo' then
    if not exists (select 1 from public.citas_estetica c where c.id = r.ref_id and c.deleted_at is null and c.estado = 'finalizada') then
      return 'La cita ya no está terminada.';
    end if;
  elsif r.tipo = 'vacuna' then
    if not exists (select 1 from public.carnet_recordatorios c where c.id = r.ref_id and c.deleted_at is null and c.estado = 'pendiente'
                     and (c.proxima_dosis::timestamp at time zone v_zona) = r.para_at) then
      return 'La dosis ya se registró o ya se recordó.';
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function public._recordatorio_motivo_invalido(uuid) from public, anon, authenticated;
grant execute on function public._recordatorio_motivo_invalido(uuid) to service_role;

-- ── Programar (la tarea, por negocio) ──────────────────────────────────────────────────────────────────────────────
create or replace function public.recordatorios_programar()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  a public.recordatorios_ajustes%rowtype;
  v_zona text := public.zona_negocio();
  v_hoy date := public.fecha_negocio();
  v_n int := 0;
  v_k int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  select * into a from public.recordatorios_ajustes x where x.negocio_id = v_neg and x.deleted_at is null;
  if not found then
    return 0;
  end if;

  if a.estetica and coalesce(public.modulo_activo('estetica'), false) then
    insert into public.recordatorios_wa (tipo, ref_id, cliente_id, perro_id, para_at, programado_at, vence_at)
    select 'estetica', c.id, p.cliente_id, c.perro_id, c.inicio,
           ((((c.inicio at time zone v_zona)::date - 1) + a.hora_envio) at time zone v_zona),
           (((c.inicio at time zone v_zona)::date)::timestamp at time zone v_zona)
    from public.citas_estetica c
    join public.perros p on p.id = c.perro_id and p.deleted_at is null and not coalesce(p.fallecido, false)
    join public.clientes cl on cl.id = p.cliente_id and cl.deleted_at is null and cl.recordatorios_whatsapp and not coalesce(cl.publico_general, false)
    where c.negocio_id = v_neg and c.deleted_at is null and c.estado in ('reservada', 'confirmada')
      and (c.inicio at time zone v_zona)::date between v_hoy + 1 and v_hoy + 2
      and public._rec_hash_telefono(cl.telefono) is not null
    on conflict (negocio_id, tipo, ref_id, para_at) where deleted_at is null do nothing;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end if;

  if a.veterinaria and coalesce(public.modulo_activo('veterinaria'), false) then
    insert into public.recordatorios_wa (tipo, ref_id, cliente_id, perro_id, para_at, programado_at, vence_at)
    select 'veterinaria', c.id, cl.id, c.perro_id, c.inicia_at,
           ((((c.inicia_at at time zone v_zona)::date - 1) + a.hora_envio) at time zone v_zona),
           (((c.inicia_at at time zone v_zona)::date)::timestamp at time zone v_zona)
    from public.vet_citas c
    join public.perros p on p.id = c.perro_id and p.deleted_at is null and not coalesce(p.fallecido, false)
    join public.clientes cl on cl.id = coalesce(c.cliente_id, p.cliente_id) and cl.deleted_at is null and cl.recordatorios_whatsapp and not coalesce(cl.publico_general, false)
    where c.negocio_id = v_neg and c.deleted_at is null and c.estado in ('programada', 'confirmada')
      and (c.inicia_at at time zone v_zona)::date between v_hoy + 1 and v_hoy + 2
      and public._rec_hash_telefono(cl.telefono) is not null
    on conflict (negocio_id, tipo, ref_id, para_at) where deleted_at is null do nothing;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end if;

  if a.llegada then
    insert into public.recordatorios_wa (tipo, ref_id, cliente_id, perro_id, para_at, programado_at, vence_at)
    select 'llegada', e.reserva_id, rv.cliente_id, (array_agg(e.perro_id order by e.created_at))[1],
           (e.fecha_entrada::timestamp at time zone v_zona),
           (((e.fecha_entrada - 1) + a.hora_envio) at time zone v_zona),
           (e.fecha_entrada::timestamp at time zone v_zona)
    from public.estancias e
    join public.reservas rv on rv.id = e.reserva_id and rv.deleted_at is null
    join public.clientes cl on cl.id = rv.cliente_id and cl.deleted_at is null and cl.recordatorios_whatsapp and not coalesce(cl.publico_general, false)
    where e.negocio_id = v_neg and e.deleted_at is null and e.estado in ('reservada', 'confirmada')
      and e.fecha_entrada between v_hoy + 1 and v_hoy + 2
      and public._rec_hash_telefono(cl.telefono) is not null
    group by e.reserva_id, rv.cliente_id, e.fecha_entrada
    on conflict (negocio_id, tipo, ref_id, para_at) where deleted_at is null do nothing;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end if;

  if a.vacuna and coalesce(public.modulo_activo('veterinaria'), false) then
    perform public.carnet_generar_recordatorios();
    insert into public.recordatorios_wa (tipo, ref_id, cliente_id, perro_id, para_at, programado_at, vence_at)
    select 'vacuna', r.id, p.cliente_id, r.perro_id,
           (r.proxima_dosis::timestamp at time zone v_zona),
           (((r.proxima_dosis - 7) + a.hora_envio) at time zone v_zona),
           (r.proxima_dosis::timestamp at time zone v_zona)
    from public.carnet_recordatorios r
    join public.perros p on p.id = r.perro_id and p.deleted_at is null and not coalesce(p.fallecido, false)
    join public.clientes cl on cl.id = p.cliente_id and cl.deleted_at is null and cl.recordatorios_whatsapp and not coalesce(cl.publico_general, false)
    where r.negocio_id = v_neg and r.deleted_at is null and r.estado = 'pendiente' and r.intentos = 0
      and r.proxima_dosis between v_hoy + 1 and v_hoy + 7
      and public._rec_hash_telefono(cl.telefono) is not null
    on conflict (negocio_id, tipo, ref_id, para_at) where deleted_at is null do nothing;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end if;

  -- Lo que ya no vale (cita cancelada o movida, tipo apagado, cliente dado de baja) se cancela antes de mandarse.
  update public.recordatorios_wa r
     set estado = 'cancelado', motivo = public._recordatorio_motivo_invalido(r.id)
   where r.negocio_id = v_neg and r.deleted_at is null and r.estado in ('programado', 'pausado')
     and public._recordatorio_motivo_invalido(r.id) is not null;
  return v_n;
end;
$$;
alter function public.recordatorios_programar() owner to peludesk_definer;
revoke execute on function public.recordatorios_programar() from public, anon, authenticated;
grant execute on function public.recordatorios_programar() to service_role;

-- ── Cuántos más caben este mes: NULL = sin límite ──────────────────────────────────────────────────────────────────
-- Exento (Ludogteka, cortesía): sin límite y sin cobro. Con suscripción pagada (al corriente o en gracia): los gratis
-- más lo que alcance el tope. Sin suscripción pagada (prueba, sin cobro): solo los gratis.
create or replace function public._recordatorios_cupo(p_negocio uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_estado text := public.estado_cobro_en(p_negocio);
  v_zona text;
  v_mes date;
  p public.wa_precios%rowtype;
  v_hay boolean;
  v_tope numeric;
  v_usados int;
begin
  if v_estado = 'exento' then
    return null;
  end if;
  select n.zona_horaria into v_zona from public.negocios n where n.id = p_negocio;
  v_mes := date_trunc('month', now() at time zone v_zona)::date;
  select * into p from public._wa_precio_en(v_mes);
  v_hay := found and p.id is not null;
  if not v_hay then
    return 0;
  end if;
  select count(*) into v_usados from public.recordatorios_wa r
  where r.negocio_id = p_negocio and r.deleted_at is null
    and r.estado in ('enviando', 'enviado', 'entregado', 'leido')
    and coalesce(r.cobrable, true)
    and date_trunc('month', coalesce(r.enviado_at, r.tomado_at) at time zone v_zona)::date = v_mes;
  if v_estado in ('al_corriente', 'gracia') then
    select a.tope_excedente into v_tope from public.recordatorios_ajustes a where a.negocio_id = p_negocio and a.deleted_at is null;
    if not found then
      v_tope := 200;
    end if;
    if v_tope is null then
      return null;
    end if;
    if p.precio_mxn <= 0 then
      return null;
    end if;
    return greatest(0, p.gratis_mes + floor(v_tope / p.precio_mxn)::int - v_usados);
  end if;
  return greatest(0, p.gratis_mes - v_usados);
end;
$$;
revoke execute on function public._recordatorios_cupo(uuid) from public, anon, authenticated;
grant execute on function public._recordatorios_cupo(uuid) to service_role;

-- ── Tomar lo que ya toca mandar (la tarea, por negocio) ────────────────────────────────────────────────────────────
create or replace function public.recordatorios_tomar(p_limite integer default 50, p_tipos text[] default null)
returns table (
  id uuid, tipo text, cliente_nombre text, telefono text, perros text, negocio_nombre text,
  servicio text, medico text, detalle text, para_at timestamptz, hora_llegada time, zona text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_zona text := public.zona_negocio();
  v_hora int;
  v_cupo int;
  v_tomados int := 0;
  v_estado text;
  f record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  update public.recordatorios_wa r
     set estado = 'cancelado', motivo = public._recordatorio_motivo_invalido(r.id)
   where r.negocio_id = v_neg and r.deleted_at is null and r.estado in ('programado', 'pausado')
     and r.programado_at <= now() and public._recordatorio_motivo_invalido(r.id) is not null;
  update public.recordatorios_wa r
     set estado = 'omitido', motivo = coalesce(r.motivo, 'Ya no daba tiempo de mandarlo antes de la cita.')
   where r.negocio_id = v_neg and r.deleted_at is null and r.estado in ('programado', 'pausado') and r.vence_at <= now();
  -- Un renglón que se quedó «enviando» (la función se cortó) no se vuelve a mandar solo: queda fallido.
  update public.recordatorios_wa r
     set estado = 'fallido', fallido_at = now(), motivo = 'El envío se interrumpió; no se reintentó para no mandarlo dos veces.'
   where r.negocio_id = v_neg and r.deleted_at is null and r.estado = 'enviando' and r.tomado_at < now() - interval '30 minutes';

  v_hora := extract(hour from now() at time zone v_zona)::int;
  if v_hora < 8 or v_hora >= 21 then
    return;
  end if;
  v_cupo := public._recordatorios_cupo(v_neg);
  v_estado := public.estado_cobro_en(v_neg);

  for f in
    select r.* from public.recordatorios_wa r
    where r.negocio_id = v_neg and r.deleted_at is null and r.estado in ('programado', 'pausado')
      and r.programado_at <= now() and r.vence_at > now()
      and (p_tipos is null or r.tipo = any(p_tipos))
    order by r.programado_at
    limit greatest(1, least(coalesce(p_limite, 50), 200))
    for update skip locked
  loop
    if v_cupo is not null and v_tomados >= v_cupo then
      update public.recordatorios_wa r set estado = 'pausado',
        motivo = case when v_estado in ('al_corriente', 'gracia')
                      then 'Se llegó al tope mensual de recordatorios adicionales. Súbelo en Módulos y plan para que sigan saliendo.'
                      else 'Ya se usaron los recordatorios gratis de este mes. Contrata tu plan para que sigan saliendo; si no, vuelven el mes que entra.' end
      where r.id = f.id;
      continue;
    end if;
    update public.recordatorios_wa r set estado = 'enviando', tomado_at = now(), motivo = null where r.id = f.id;
    v_tomados := v_tomados + 1;
    return query
    select f.id, f.tipo, cl.nombre, cl.telefono,
      case when f.tipo = 'llegada' then
        (select string_agg(x.nombre, ', ' order by x.nombre) from (
           select distinct p2.nombre from public.estancias e2 join public.perros p2 on p2.id = e2.perro_id
           where e2.reserva_id = f.ref_id and e2.deleted_at is null and e2.estado in ('reservada', 'confirmada')
             and e2.fecha_entrada = (f.para_at at time zone v_zona)::date) x)
      else p.nombre end,
      n.nombre,
      case when f.tipo in ('estetica', 'listo') then (select c.servicio_nombre from public.citas_estetica c where c.id = f.ref_id) end,
      case when f.tipo = 'veterinaria' then (
        select pr.nombre_completo from public.vet_citas c join public.medicos_veterinarios m on m.id = c.medico_id join public.profiles pr on pr.id = m.profile_id
        where c.id = f.ref_id) end,
      case when f.tipo = 'vacuna' then (
        select case when c.origen_tipo = 'vacuna' then 'vacuna ' || c.detalle else 'desparasitación (' || c.detalle || ')' end
        from public.carnet_recordatorios c where c.id = f.ref_id) end,
      f.para_at,
      case when f.tipo = 'llegada' then (select h.hora_apertura from public.resolver_cupo_configuracion((f.para_at at time zone v_zona)::date) h) end,
      v_zona
    from public.clientes cl
    left join public.perros p on p.id = f.perro_id
    join public.negocios n on n.id = f.negocio_id
    where cl.id = f.cliente_id;
  end loop;
end;
$$;
alter function public.recordatorios_tomar(integer, text[]) owner to peludesk_definer;
revoke execute on function public.recordatorios_tomar(integer, text[]) from public, anon, authenticated;
grant execute on function public.recordatorios_tomar(integer, text[]) to service_role;

-- ── Resultado del envío ────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.recordatorio_resultado(p_id uuid, p_ok boolean, p_wa_id text, p_error text, p_plantilla text, p_texto text, p_telefono text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_ref uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  update public.recordatorios_wa r
     set estado = case when p_ok then 'enviado' else 'fallido' end,
         enviado_at = case when p_ok then now() else r.enviado_at end,
         fallido_at = case when p_ok then r.fallido_at else now() end,
         wa_id = coalesce(p_wa_id, r.wa_id),
         motivo = case when p_ok then null else left(coalesce(p_error, 'Meta no aceptó el mensaje.'), 300) end,
         plantilla = p_plantilla,
         texto = left(p_texto, 1024),
         telefono_hash = public._rec_hash_telefono(p_telefono),
         telefono_ult4 = right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 4)
   where r.id = p_id and r.negocio_id = public.negocio_actual()
  returning r.tipo, r.ref_id into v_tipo, v_ref;
  -- La dosis queda recordada también en la cola del carnet («Por mandar» la saca o la deja como fallida).
  if v_tipo = 'vacuna' then
    update public.carnet_recordatorios c
       set estado = case when p_ok then 'enviado' else 'fallido' end,
           intentos = c.intentos + 1,
           enviado_at = case when p_ok then now() else c.enviado_at end,
           error = case when p_ok then null else left(coalesce(p_error, 'Meta no aceptó el mensaje.'), 300) end,
           wa_message_id = coalesce(p_wa_id, c.wa_message_id)
     where c.id = v_ref and c.negocio_id = public.negocio_actual();
  end if;
end;
$$;
alter function public.recordatorio_resultado(uuid, boolean, text, text, text, text, text) owner to peludesk_definer;
revoke execute on function public.recordatorio_resultado(uuid, boolean, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.recordatorio_resultado(uuid, boolean, text, text, text, text, text) to service_role;

-- ── Estado de entrega (webhook, sin negocio en la petición) ────────────────────────────────────────────────────────
-- Nunca retrocede. El primer «entregado» (o «leído») de un mensaje que Meta cobra se cuenta en el mes del negocio;
-- arriba de los gratis y con suscripción pagada es excedente (se reporta a Stripe). Un fallido no cuenta.
create or replace function public.recordatorio_entrega(p_wa_id text, p_estado text, p_cobrable boolean, p_ts timestamptz, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.recordatorios_wa%rowtype;
  v_orden_actual int;
  v_orden_nuevo int;
  v_zona text;
  v_mes date;
  v_num int;
  p public.wa_precios%rowtype;
  v_hay_precio boolean;
  v_exc boolean;
  v_cobro uuid;
  v_ts timestamptz := coalesce(p_ts, now());
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  select * into r from public.recordatorios_wa x where x.wa_id = p_wa_id for update;
  if not found then
    return null;
  end if;
  v_orden_actual := case r.estado when 'enviado' then 1 when 'entregado' then 2 when 'leido' then 3 when 'fallido' then 4 else 0 end;
  v_orden_nuevo := case p_estado when 'enviado' then 1 when 'entregado' then 2 when 'leido' then 3 when 'fallido' then 4 else 0 end;

  if p_cobrable is not null then
    update public.recordatorios_wa x set cobrable = p_cobrable where x.id = r.id;
    r.cobrable := p_cobrable;
  end if;

  if p_estado = 'fallido' then
    -- Un fallido después de entregado no cambia nada (Meta ya lo entregó).
    if r.estado in ('entregado', 'leido') then
      return jsonb_build_object('negocio_id', r.negocio_id);
    end if;
    update public.recordatorios_wa x set estado = 'fallido', fallido_at = v_ts, motivo = left(coalesce(p_motivo, 'Meta no pudo entregarlo.'), 300) where x.id = r.id;
    if r.tipo = 'vacuna' then
      update public.carnet_recordatorios c set estado = 'fallido', error = left(coalesce(p_motivo, 'Meta no pudo entregarlo.'), 300) where c.id = r.ref_id;
    end if;
    return jsonb_build_object('negocio_id', r.negocio_id, 'fallido', true);
  end if;

  if v_orden_nuevo > v_orden_actual or (r.estado = 'fallido' and p_estado in ('entregado', 'leido')) then
    update public.recordatorios_wa x
       set estado = p_estado,
           entregado_at = case when p_estado in ('entregado', 'leido') then coalesce(x.entregado_at, v_ts) else x.entregado_at end,
           leido_at = case when p_estado = 'leido' then coalesce(x.leido_at, v_ts) else x.leido_at end,
           motivo = case when p_estado in ('entregado', 'leido') then null else x.motivo end
     where x.id = r.id;
  end if;

  -- Cobro: al primer entregado, si Meta lo cobra.
  if p_estado in ('entregado', 'leido') and r.entregado_at is null and coalesce(r.cobrable, true)
     and not exists (select 1 from public.wa_recordatorios_cobro c where c.recordatorio_id = r.id) then
    select n.zona_horaria into v_zona from public.negocios n where n.id = r.negocio_id;
    v_mes := date_trunc('month', coalesce(r.enviado_at, v_ts) at time zone v_zona)::date;
    perform pg_advisory_xact_lock(hashtextextended(r.negocio_id::text || v_mes::text, 0));
    select * into p from public._wa_precio_en(v_mes);
    v_hay_precio := found and p.id is not null;
    select count(*) + 1 into v_num from public.wa_recordatorios_cobro c where c.negocio_id = r.negocio_id and c.mes = v_mes;
    v_exc := v_hay_precio and v_num > p.gratis_mes and coalesce(public.estado_cobro_en(r.negocio_id), '') in ('al_corriente', 'gracia');
    insert into public.wa_recordatorios_cobro (recordatorio_id, negocio_id, mes, numero, excedente, precio_mxn, costo_mxn)
    values (r.id, r.negocio_id, v_mes, v_num, v_exc,
            case when v_hay_precio then p.precio_mxn else 0 end,
            case when v_hay_precio then p.costo_mxn else 0 end)
    returning id into v_cobro;
    return jsonb_build_object('negocio_id', r.negocio_id, 'cobro_id', v_cobro, 'excedente', v_exc, 'numero', v_num);
  end if;
  return jsonb_build_object('negocio_id', r.negocio_id);
end;
$$;
revoke execute on function public.recordatorio_entrega(text, text, boolean, timestamptz, text) from public, anon, authenticated;
grant execute on function public.recordatorio_entrega(text, text, boolean, timestamptz, text) to service_role;

-- ── Respuesta con botón (webhook) ──────────────────────────────────────────────────────────────────────────────────
-- Solo cuenta si quien contesta es el teléfono al que se mandó. «Confirmo» confirma la cita (o las estancias de esa
-- llegada); «Necesito cambiarla» y «Agendar» dejan un mensaje para el negocio; «Después» solo se anota.
create or replace function public.recordatorio_responder(p_id uuid, p_accion text, p_telefono text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.recordatorios_wa%rowtype;
  v_negocio text;
  v_zona text;
  v_confirmadas int := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  if p_accion not in ('confirmo', 'pide_cambio', 'agendar', 'despues') then
    return null;
  end if;
  select * into r from public.recordatorios_wa x where x.id = p_id and x.deleted_at is null for update;
  if not found or r.telefono_hash is null or r.telefono_hash is distinct from public._rec_hash_telefono(p_telefono) then
    return null;
  end if;
  select n.nombre, n.zona_horaria into v_negocio, v_zona from public.negocios n where n.id = r.negocio_id;
  -- Las funciones y disparadores que corren al tocar la cita leen el negocio de aquí.
  perform set_config('app.negocio_id', r.negocio_id::text, true);

  update public.recordatorios_wa x set respuesta = p_accion, respuesta_at = now() where x.id = r.id;

  if p_accion = 'confirmo' then
    if r.tipo = 'estetica' then
      update public.citas_estetica c set estado = 'confirmada' where c.id = r.ref_id and c.estado = 'reservada' and c.deleted_at is null;
      get diagnostics v_confirmadas = row_count;
    elsif r.tipo = 'veterinaria' then
      update public.vet_citas c set estado = 'confirmada' where c.id = r.ref_id and c.estado = 'programada' and c.deleted_at is null;
      get diagnostics v_confirmadas = row_count;
    elsif r.tipo = 'llegada' then
      update public.estancias e set estado = 'confirmada'
       where e.reserva_id = r.ref_id and e.estado = 'reservada' and e.deleted_at is null
         and e.fecha_entrada = (r.para_at at time zone v_zona)::date;
      get diagnostics v_confirmadas = row_count;
    end if;
    -- Si antes había pedido cambio, ese aviso ya no hace falta.
    update public.recordatorios_mensajes m set atendido_at = now()
     where m.recordatorio_id = r.id and m.tipo = 'pide_cambio' and m.atendido_at is null;
  elsif p_accion = 'pide_cambio' then
    if not exists (select 1 from public.recordatorios_mensajes m where m.recordatorio_id = r.id and m.tipo = 'pide_cambio' and m.atendido_at is null) then
      insert into public.recordatorios_mensajes (negocio_id, recordatorio_id, cliente_id, perro_id, tipo, texto, created_by)
      values (r.negocio_id, r.id, r.cliente_id, r.perro_id, 'pide_cambio', 'Necesito cambiarla', null);
    end if;
  elsif p_accion = 'agendar' then
    if not exists (select 1 from public.recordatorios_mensajes m where m.recordatorio_id = r.id and m.tipo = 'solicitud_cita' and m.atendido_at is null) then
      insert into public.recordatorios_mensajes (negocio_id, recordatorio_id, cliente_id, perro_id, tipo, texto, created_by)
      values (r.negocio_id, r.id, r.cliente_id, r.perro_id, 'solicitud_cita', 'Quiere agendar: ' || coalesce((
        select case when c.origen_tipo = 'vacuna' then 'vacuna ' || c.detalle else 'desparasitación (' || c.detalle || ')' end
        from public.carnet_recordatorios c where c.id = r.ref_id), 'su cita'), null);
    end if;
  end if;
  return jsonb_build_object('negocio', v_negocio, 'tipo', r.tipo, 'confirmadas', v_confirmadas, 'negocio_id', r.negocio_id);
end;
$$;
revoke execute on function public.recordatorio_responder(uuid, text, text) from public, anon, authenticated;
grant execute on function public.recordatorio_responder(uuid, text, text) to service_role;

-- ── Texto libre o BAJA de quien recibió un recordatorio en los últimos 7 días (webhook) ─────────────────────────────
-- NULL si ese teléfono no recibió ninguno: entonces lo atiende el bot como siempre.
create or replace function public.recordatorio_texto_entrante(p_telefono text, p_texto text, p_baja boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := public._rec_hash_telefono(p_telefono);
  r public.recordatorios_wa%rowtype;
  v_negocio text;
  v_previo boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  if v_hash is null then
    return null;
  end if;
  select * into r from public.recordatorios_wa x
  where x.telefono_hash = v_hash and x.deleted_at is null and x.estado in ('enviado', 'entregado', 'leido')
    and x.enviado_at > now() - interval '7 days'
  order by x.enviado_at desc
  limit 1;
  if not found then
    return null;
  end if;
  select n.nombre into v_negocio from public.negocios n where n.id = r.negocio_id;
  perform set_config('app.negocio_id', r.negocio_id::text, true);
  -- ¿Ya se le contestó a ese teléfono en las últimas 2 horas? Entonces no se le vuelve a contestar.
  select exists (select 1 from public.recordatorios_mensajes m join public.recordatorios_wa x on x.id = m.recordatorio_id
                 where x.telefono_hash = v_hash and m.created_at > now() - interval '2 hours' and m.tipo = 'mensaje')
    into v_previo;

  if p_baja then
    update public.clientes c
       set recordatorios_whatsapp = false, recordatorios_whatsapp_origen = 'baja_whatsapp', recordatorios_whatsapp_cambio_at = now()
     where c.negocio_id = r.negocio_id and c.deleted_at is null and public._rec_hash_telefono(c.telefono) = v_hash;
    update public.recordatorios_wa x set estado = 'cancelado', motivo = 'El cliente pidió no recibir recordatorios.'
     where x.negocio_id = r.negocio_id and x.estado in ('programado', 'pausado') and x.deleted_at is null
       and x.cliente_id in (select c.id from public.clientes c where c.negocio_id = r.negocio_id and public._rec_hash_telefono(c.telefono) = v_hash);
    insert into public.recordatorios_mensajes (negocio_id, recordatorio_id, cliente_id, perro_id, tipo, texto, created_by)
    values (r.negocio_id, r.id, r.cliente_id, r.perro_id, 'baja', left(p_texto, 2000), null);
    return jsonb_build_object('negocio', v_negocio, 'baja', true);
  end if;

  insert into public.recordatorios_mensajes (negocio_id, recordatorio_id, cliente_id, perro_id, tipo, texto, created_by)
  values (r.negocio_id, r.id, r.cliente_id, r.perro_id, 'mensaje', left(p_texto, 2000), null);
  return jsonb_build_object('negocio', v_negocio, 'acuse', not v_previo);
end;
$$;
revoke execute on function public.recordatorio_texto_entrante(text, text, boolean) from public, anon, authenticated;
grant execute on function public.recordatorio_texto_entrante(text, text, boolean) to service_role;

-- El negocio marca un mensaje como atendido.
create or replace function public.recordatorio_mensaje_atendido(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal del negocio.' using errcode = '42501';
  end if;
  update public.recordatorios_mensajes m set atendido_at = coalesce(m.atendido_at, now()), atendido_por = coalesce(m.atendido_por, auth.uid())
   where m.id = p_id and m.negocio_id = public.negocio_actual() and m.deleted_at is null;
  if not found then
    raise exception 'Ese mensaje no existe.' using errcode = 'P0002';
  end if;
end;
$$;
alter function public.recordatorio_mensaje_atendido(uuid) owner to peludesk_definer;
revoke execute on function public.recordatorio_mensaje_atendido(uuid) from public, anon;
grant execute on function public.recordatorio_mensaje_atendido(uuid) to authenticated;

-- ── «Ya está listo»: al terminar la cita de estética ───────────────────────────────────────────────────────────────
create or replace function public.recordatorio_listo_al_finalizar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = 'finalizada' and old.estado is distinct from 'finalizada'
     and exists (select 1 from public.recordatorios_ajustes a where a.negocio_id = new.negocio_id and a.deleted_at is null and a.listo)
     and exists (select 1 from public.negocios n where n.id = new.negocio_id and n.plan <> 'demo') then
    insert into public.recordatorios_wa (negocio_id, tipo, ref_id, cliente_id, perro_id, para_at, programado_at, vence_at)
    select new.negocio_id, 'listo', new.id, cl.id, new.perro_id, now(), now(), now() + interval '3 hours'
    from public.perros p
    join public.clientes cl on cl.id = p.cliente_id and cl.deleted_at is null and cl.recordatorios_whatsapp and not coalesce(cl.publico_general, false)
    where p.id = new.perro_id and public._rec_hash_telefono(cl.telefono) is not null
      and not exists (select 1 from public.recordatorios_wa x where x.tipo = 'listo' and x.ref_id = new.id and x.deleted_at is null)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
alter function public.recordatorio_listo_al_finalizar() owner to peludesk_definer;
revoke execute on function public.recordatorio_listo_al_finalizar() from public, anon, authenticated;
create trigger recordatorio_listo after update of estado on public.citas_estetica
  for each row execute function public.recordatorio_listo_al_finalizar();

-- ── Uso del mes para el admin (Módulos y plan) ─────────────────────────────────────────────────────────────────────
create or replace function public.recordatorios_uso_mes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_zona text;
  v_mes date;
  p public.wa_precios%rowtype;
  v_hay boolean;
  v_entregados int;
  v_excedentes int;
  v_enviados int;
  v_pausados int;
  v_tope numeric;
  v_hay_ajustes boolean;
begin
  if not (coalesce(public.is_admin(), false) or coalesce(public.tiene_permiso('administrar_modulos'), false)) then
    raise exception 'Solo el administrador del negocio.' using errcode = '42501';
  end if;
  select n.zona_horaria into v_zona from public.negocios n where n.id = v_neg;
  v_mes := date_trunc('month', now() at time zone v_zona)::date;
  select * into p from public._wa_precio_en(v_mes);
  v_hay := found and p.id is not null;
  select count(*), count(*) filter (where c.excedente) into v_entregados, v_excedentes
  from public.wa_recordatorios_cobro c where c.negocio_id = v_neg and c.mes = v_mes;
  select count(*) filter (where r.estado in ('enviando', 'enviado', 'entregado', 'leido') and coalesce(r.cobrable, true)),
         count(*) filter (where r.estado = 'pausado')
    into v_enviados, v_pausados
  from public.recordatorios_wa r
  where r.negocio_id = v_neg and r.deleted_at is null
    and date_trunc('month', coalesce(r.enviado_at, r.tomado_at, r.programado_at) at time zone v_zona)::date = v_mes;
  select a.tope_excedente into v_tope from public.recordatorios_ajustes a where a.negocio_id = v_neg and a.deleted_at is null;
  v_hay_ajustes := found;
  return jsonb_build_object(
    'mes', v_mes,
    'enviados', v_enviados,
    'entregados', v_entregados,
    'gratis', case when v_hay then p.gratis_mes else 0 end,
    'excedentes', v_excedentes,
    'precio', case when v_hay then p.precio_mxn else null end,
    'excedente_mxn', case when v_hay then round(v_excedentes * p.precio_mxn, 2) else 0 end,
    'tope', case when v_hay_ajustes then v_tope else 200 end,
    'pausados', v_pausados,
    'estado_cobro', public.estado_cobro_en(v_neg));
end;
$$;
revoke execute on function public.recordatorios_uso_mes() from public, anon;
grant execute on function public.recordatorios_uso_mes() to authenticated;

-- ── La plataforma: por negocio y mes, mensajes, costo nuestro, cobrado y margen ────────────────────────────────────
create or replace function public.plataforma_recordatorios_uso(p_mes date)
returns table (negocio_id uuid, negocio text, mensajes bigint, cobrables bigint, excedentes bigint, costo_mxn numeric, cobrado_mxn numeric, margen_mxn numeric, sin_reportar bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.nombre,
    (select count(*) from public.recordatorios_wa r where r.negocio_id = n.id and r.deleted_at is null and r.estado in ('enviado', 'entregado', 'leido', 'fallido')
       and date_trunc('month', r.enviado_at at time zone n.zona_horaria)::date = p_mes),
    count(c.id),
    count(c.id) filter (where c.excedente),
    coalesce(sum(c.costo_mxn), 0)::numeric(12,4),
    coalesce(sum(c.precio_mxn) filter (where c.excedente), 0)::numeric(12,2),
    (coalesce(sum(c.precio_mxn) filter (where c.excedente), 0) - coalesce(sum(c.costo_mxn), 0))::numeric(12,4),
    count(c.id) filter (where c.excedente and c.stripe_reportado_at is null)
  from public.negocios n
  join public.wa_recordatorios_cobro c on c.negocio_id = n.id and c.mes = p_mes
  where coalesce(auth.role(), '') = 'service_role' or coalesce(public.es_admin_plataforma(), false)
  group by n.id, n.nombre, n.zona_horaria
  order by 4 desc;
$$;
revoke execute on function public.plataforma_recordatorios_uso(date) from public, anon;
grant execute on function public.plataforma_recordatorios_uso(date) to authenticated, service_role;

-- ── La tarea: qué negocios tienen algo prendido ────────────────────────────────────────────────────────────────────
-- Fuera: el demo, los inactivos y los que no pueden escribir (prueba vencida, solo lectura, cancelado).
create or replace function public.recordatorios_negocios_activos()
returns table (negocio_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  return query
  select a.negocio_id from public.recordatorios_ajustes a
  join public.negocios n on n.id = a.negocio_id and n.deleted_at is null and n.activo and n.plan <> 'demo'
  where a.deleted_at is null and (a.estetica or a.veterinaria or a.llegada or a.listo or a.vacuna)
    and coalesce(public.estado_cobro_en(a.negocio_id), '') not in ('prueba_vencida', 'solo_lectura', 'cancelado');
end;
$$;
revoke execute on function public.recordatorios_negocios_activos() from public, anon, authenticated;
grant execute on function public.recordatorios_negocios_activos() to service_role;

-- Excedentes por reportar a Stripe (con el negocio que paga: la principal si es sucursal).
create or replace function public.recordatorios_cobro_por_reportar(p_limite integer default 100)
returns table (id uuid, negocio_id uuid, paga_id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  return query
  select c.id, c.negocio_id, coalesce(n.principal_id, n.id), c.created_at
  from public.wa_recordatorios_cobro c
  join public.negocios n on n.id = c.negocio_id
  where c.excedente and c.stripe_reportado_at is null and c.stripe_intentos < 20
  order by c.created_at
  limit greatest(1, least(coalesce(p_limite, 100), 500));
end;
$$;
revoke execute on function public.recordatorios_cobro_por_reportar(integer) from public, anon, authenticated;
grant execute on function public.recordatorios_cobro_por_reportar(integer) to service_role;

create or replace function public.recordatorio_cobro_reportado(p_id uuid, p_ok boolean, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  update public.wa_recordatorios_cobro c
     set stripe_reportado_at = case when p_ok then coalesce(c.stripe_reportado_at, now()) else c.stripe_reportado_at end,
         stripe_error = case when p_ok then null else left(p_error, 500) end,
         stripe_intentos = c.stripe_intentos + case when p_ok then 0 else 1 end
   where c.id = p_id;
end;
$$;
revoke execute on function public.recordatorio_cobro_reportado(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.recordatorio_cobro_reportado(uuid, boolean, text) to service_role;

-- Precio nuevo leído de la hoja de tarifas de Meta (la tarea mensual o el botón de la plataforma). Solo si cambió.
create or replace function public.wa_precio_registrar(p_vigente date, p_moneda text, p_costo numeric, p_tipo_cambio numeric, p_fuente text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_costo_mxn numeric := round(p_costo * p_tipo_cambio, 6);
  v_precio numeric := round(2 * v_costo_mxn, 2);
  p public.wa_precios%rowtype;
  v_hay boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not coalesce(public.es_admin_plataforma(), false) then
    raise exception 'Solo la plataforma.' using errcode = '42501';
  end if;
  if p_costo is null or p_costo <= 0 or p_tipo_cambio is null or p_tipo_cambio <= 0 or p_moneda not in ('MXN', 'USD') then
    raise exception 'Precio inválido.' using errcode = '22023';
  end if;
  select * into p from public._wa_precio_en(p_vigente);
  v_hay := found and p.id is not null;
  if v_hay and p.precio_mxn = v_precio and p.gratis_mes is not null then
    return false;
  end if;
  insert into public.wa_precios (vigente_desde, moneda_meta, costo_meta, tipo_cambio, costo_mxn, precio_mxn, gratis_mes, fuente)
  values (p_vigente, p_moneda, p_costo, p_tipo_cambio, v_costo_mxn, v_precio, case when v_hay then p.gratis_mes else 30 end, left(p_fuente, 300))
  on conflict (mercado, categoria, vigente_desde) where deleted_at is null
  do update set moneda_meta = excluded.moneda_meta, costo_meta = excluded.costo_meta, tipo_cambio = excluded.tipo_cambio,
                costo_mxn = excluded.costo_mxn, precio_mxn = excluded.precio_mxn, fuente = excluded.fuente;
  return true;
end;
$$;
revoke execute on function public.wa_precio_registrar(date, text, numeric, numeric, text) from public, anon;
grant execute on function public.wa_precio_registrar(date, text, numeric, numeric, text) to authenticated, service_role;

-- ── auditoria_frontera: tablas de la plataforma y funciones de postgres que recorren negocios ─────────────────────
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position($a$('wa_recordatorios_cobro')$a$ in v_def) = 0 then
    v_def := replace(v_def, $a$('wa_flow_sesiones'), $a$, $b$('wa_flow_sesiones'), ('wa_precios'), ('wa_recordatorios_cobro'), $b$);
    v_def := replace(v_def, $a$('carnet_negocios_con_recordatorios'),$a$,
      $b$('carnet_negocios_con_recordatorios'),
    -- Recordatorios por WhatsApp: lo que llega por el webhook (sin negocio en la petición), la lista de negocios de
    -- la tarea, el cupo y el cobro del mes (leen la tabla de la plataforma) y el panel de la plataforma.
    ('_recordatorio_motivo_invalido'), ('_recordatorios_cupo'), ('_wa_precio_en'), ('recordatorio_entrega'), ('recordatorio_responder'),
    ('recordatorio_texto_entrante'), ('recordatorios_uso_mes'), ('plataforma_recordatorios_uso'), ('recordatorios_negocios_activos'),
    ('recordatorios_cobro_por_reportar'), ('recordatorio_cobro_reportado'), ('wa_precio_registrar'),$b$);
    if position($a$('wa_recordatorios_cobro')$a$ in v_def) = 0 or position($a$('recordatorio_entrega')$a$ in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudieron agregar los recordatorios.';
    end if;
    execute v_def;
  end if;
end $$;
