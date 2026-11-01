-- App para dueños · Fase 2 · El QR para la vet que no nos conoce (1 de noviembre de 2026). docs/app-duenos/FASE-2.md
--
-- Desde el perfil público de la mascota (/m/<token>), una veterinaria, estética u hotel que no usa PeluDesk registra
-- una atención sin cuenta ni app (vacuna o desparasitación con lote y próxima dosis, peso y nota; servicio de estética
-- y próxima cita sugerida; estancia de hotel con fechas), con su nombre, su WhatsApp y su firma. El negocio queda como
-- «negocio por reclamar»: es un PROSPECTO (mismo registro si ya existía por WhatsApp o por nombre y ubicación, nuevo
-- con fuente 'qr' si no) y se reclama con el mismo reclamo del directorio (código por WhatsApp). Lo registrado entra
-- a la cartilla del dueño y el recordatorio sale firmado por ese negocio.
--
-- Todo lo escribe el servidor (llave de servicio) después de sus límites; nadie escribe estas tablas directo.

-- ── 1. Prospectos que llegan por el QR ─────────────────────────────
do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conrelid = 'public.prospectos'::regclass and conname = 'prospectos_fuente_check';
  if v_def is not null and position('''qr''' in v_def) = 0 then
    alter table public.prospectos drop constraint prospectos_fuente_check;
    alter table public.prospectos add constraint prospectos_fuente_check check (fuente = any (array['google_places', 'manual', 'anuncio_meta', 'herramienta', 'qr']));
  end if;
end $$;

-- ── 2. Escaneos (cada vez que alguien abre el formulario del negocio) ──
create table public.app_qr_escaneos (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid not null references public.mascotas(id) on delete cascade,
  -- se llena cuando ese escaneo termina en un registro (el negocio se identifica al guardar)
  prospecto_id uuid references public.prospectos(id) on delete set null,
  giro text check (giro is null or giro in ('veterinaria', 'estetica', 'hotel')),
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index app_qr_escaneos_mascota_idx on public.app_qr_escaneos (mascota_id, created_at desc);
create index app_qr_escaneos_prospecto_idx on public.app_qr_escaneos (prospecto_id) where prospecto_id is not null;
create trigger set_updated_at before insert or update on public.app_qr_escaneos for each row execute function public.set_updated_at();
alter table public.app_qr_escaneos enable row level security;
create policy app_qr_escaneos_plataforma on public.app_qr_escaneos for select to authenticated using ((select public.es_admin_plataforma()));
create policy app_qr_escaneos_definer on public.app_qr_escaneos for all to peludesk_definer using (true) with check (true);
revoke all on public.app_qr_escaneos from anon, authenticated;
grant select on public.app_qr_escaneos to authenticated;
grant select, insert, update, delete on public.app_qr_escaneos to peludesk_definer;

-- ── 3. Atenciones registradas por un negocio desde el QR ───────────
-- Bitácora: nunca se borra. El negocio la edita solo en las primeras 24 h y solo desde el teléfono que la hizo (el
-- token de edición vive en ese teléfono; aquí solo su huella); cada edición deja la versión anterior en `historial`.
-- El dueño la puede OCULTAR (oculto_at), no borrar. El dueño no lee esta tabla directo (tiene columnas internas: la
-- huella del token y de la IP): la lee por app_mis_atenciones().
create table public.app_atenciones (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid not null references public.mascotas(id) on delete cascade,
  prospecto_id uuid not null references public.prospectos(id) on delete restrict,
  escaneo_id uuid references public.app_qr_escaneos(id) on delete set null,
  giro text not null check (giro in ('veterinaria', 'estetica', 'hotel')),
  negocio_nombre text not null check (char_length(btrim(negocio_nombre)) between 2 and 80),
  negocio_whatsapp text not null check (negocio_whatsapp ~ '^[0-9]{10}$'),
  -- veterinaria: [{tipo, nombre, subtipo, lote, proxima_dosis}]; estetica: {servicio, proxima_cita}; hotel: {entrada, salida}
  datos jsonb not null default '{}'::jsonb,
  fecha date not null,
  peso_kg numeric(6,2) check (peso_kg is null or (peso_kg > 0 and peso_kg < 200)),
  nota text check (nota is null or char_length(nota) <= 280),
  firma_path text not null,
  editor_hash text not null,
  ip_hash text,
  editable_hasta timestamptz not null,
  editado_at timestamptz,
  historial jsonb not null default '[]'::jsonb,
  oculto_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index app_atenciones_mascota_idx on public.app_atenciones (mascota_id, created_at desc);
create index app_atenciones_prospecto_idx on public.app_atenciones (prospecto_id, created_at desc);
create index app_atenciones_whatsapp_idx on public.app_atenciones (negocio_whatsapp, created_at desc);
create trigger set_updated_at before insert or update on public.app_atenciones for each row execute function public.set_updated_at();
alter table public.app_atenciones enable row level security;
create policy app_atenciones_plataforma on public.app_atenciones for select to authenticated using ((select public.es_admin_plataforma()));
create policy app_atenciones_definer on public.app_atenciones for all to peludesk_definer using (true) with check (true);
revoke all on public.app_atenciones from anon, authenticated;
grant select on public.app_atenciones to authenticated;
grant select, insert, update, delete on public.app_atenciones to peludesk_definer;

-- Lo que la atención escribió en la cartilla y el peso (para firmar el recordatorio con el negocio y para no duplicar).
alter table public.mascotas_cartilla add column if not exists atencion_id uuid references public.app_atenciones(id) on delete set null;
alter table public.mascotas_pesos add column if not exists atencion_id uuid references public.app_atenciones(id) on delete set null;
create index if not exists mascotas_cartilla_atencion_idx on public.mascotas_cartilla (atencion_id) where atencion_id is not null;

-- El recordatorio de la próxima cita que sugirió una estética (push y Avisos; WhatsApp con su plantilla cuando esté aprobada).
alter table public.app_recordatorios drop constraint if exists app_recordatorios_tipo_check;
alter table public.app_recordatorios add constraint app_recordatorios_tipo_check check (tipo in ('vacuna', 'desparasitacion', 'medicamento', 'cita_sugerida'));
-- Aviso «<negocio> registró una atención».
alter table public.app_avisos drop constraint if exists app_avisos_tipo_check;
alter table public.app_avisos add constraint app_avisos_tipo_check check (tipo in ('bienvenida', 'vinculo', 'prueba', 'recordatorio', 'perdida', 'encontrada', 'mensaje', 'sistema', 'registro'));

-- ── 4. Lo que ve el dueño: sus atenciones, sin columnas internas ──
create or replace function public.app_mis_atenciones(p_mascota uuid)
returns table (id uuid, giro text, negocio_nombre text, negocio_whatsapp text, datos jsonb, fecha date, peso_kg numeric, nota text, firma_path text, editado_at timestamptz, oculto_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.giro, a.negocio_nombre, a.negocio_whatsapp, a.datos, a.fecha, a.peso_kg, a.nota, a.firma_path, a.editado_at, a.oculto_at, a.created_at
  from public.app_atenciones a
  where a.mascota_id = p_mascota and a.deleted_at is null and public.app_mascota_mia(p_mascota)
  order by a.created_at desc;
$$;
alter function public.app_mis_atenciones(uuid) owner to peludesk_definer;
revoke execute on function public.app_mis_atenciones(uuid) from public, anon;
grant execute on function public.app_mis_atenciones(uuid) to authenticated, service_role;

-- ── 5. Frontera: tablas de la persona/plataforma, sin negocio_id ──
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position($a$('app_atenciones')$a$ in v_def) = 0 then
    if position($a$('mascotas_mensajes')$a$ in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no encuentro dónde agregar las tablas de la Fase 2.';
    end if;
    v_def := replace(v_def, $a$('mascotas_mensajes')$a$, $b$('mascotas_mensajes'), ('app_atenciones'), ('app_qr_escaneos')$b$);
    execute v_def;
  end if;
end $$;

-- Reversa (no se corre sola): drop de app_atenciones y app_qr_escaneos, de app_mis_atenciones, de las columnas
-- atencion_id de mascotas_cartilla y mascotas_pesos; los checks de app_recordatorios, app_avisos y prospectos vuelven
-- a su lista anterior.
