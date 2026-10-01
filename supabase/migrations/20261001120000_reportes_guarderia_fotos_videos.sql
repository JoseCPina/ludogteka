-- Reporte de comportamiento diario (guardería) y fotos y videos de los perros
-- que están adentro (hotel y guardería) — 1 de octubre de 2026.
--
-- · Permiso NUEVO «reportes_guarderia» (recepción lo recibe por persona;
--   admin lo tiene siempre). Da el reporte diario Y las fotos y videos.
-- · Plantilla del reporte por negocio (secciones, opciones, preset «Buen día»)
--   y su configuración (título, subtítulo, colores, días de retención).
-- · Un reporte por perro por día (fecha del negocio). El reporte guarda un
--   SNAPSHOT de la plantilla con las marcas: cambiar la plantilla después no
--   altera lo ya guardado. Una vez enviado, cada corrección queda versionada.
-- · Fotos y videos (`media_perro`) en un bucket privado con prefijo por
--   negocio; se suben directo a Storage con URL firmada. Se borran a los N
--   días (7 por omisión): la fila queda marcada como vencida.
-- · Ligas públicas `/r/<token>` (reporte) y `/f/<token>` (galería): solo se
--   guarda el sha256 del token; el servidor valida token, vencimiento y
--   negocio y entrega URLs firmadas de corta vida.
-- · Todo se escribe por funciones (el cliente y el anónimo no escriben nada).
--   Reportes → módulo guardería; fotos, videos, galerías y ligas → guardería
--   u hotel. Apagar el módulo lo bloquea en la base.

-- ── 0. Permiso «reportes_guarderia» ─────────────────────────────────

alter table public.permisos_staff drop constraint permisos_staff_permiso_check;
alter table public.permisos_staff add constraint permisos_staff_permiso_check check (permiso in (
  'inventario_costos', 'tarifas', 'reportes_financieros', 'personal',
  'configuracion_negocio', 'excepciones_reserva', 'descuentos_sin_tope',
  'plantillas_contrato', 'nomina', 'gastos', 'reportes_guarderia'
));

create or replace function public.mis_permisos()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select unnest(array[
    'inventario_costos', 'tarifas', 'reportes_financieros', 'personal',
    'configuracion_negocio', 'excepciones_reserva', 'descuentos_sin_tope',
    'plantillas_contrato', 'nomina', 'gastos', 'reportes_guarderia'
  ]) as permiso
  where coalesce(public.is_admin(), false)
  union
  select ps.permiso
  from public.permisos_staff ps
  where ps.profile_id = auth.uid()
    and ps.negocio_id = public.negocio_actual()
    and ps.revocado_at is null
    and ps.deleted_at is null
    and public.current_rol() = 'recepcion';
$$;

CREATE OR REPLACE FUNCTION public.tiene_permiso(p_permiso text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- Nunca NULL: un anónimo o alguien sin membresía da false, no NULL.
  select (
    coalesce(public.is_admin(), false)
    or (
      public.current_rol() = 'recepcion'
      and exists (
        select 1 from public.permisos_staff ps
        where ps.profile_id = auth.uid()
          and ps.negocio_id = public.negocio_actual()
          and ps.permiso = p_permiso
          and ps.revocado_at is null
          and ps.deleted_at is null
      )
    )
  ) and (
    case p_permiso
      when 'reportes_financieros' then public.modulo_activo('reportes')
      when 'nomina' then public.modulo_activo('empleados')
      when 'gastos' then public.modulo_activo('gastos')
      when 'inventario_costos' then public.modulo_activo('inventario')
      when 'plantillas_contrato' then public.modulo_activo('contratos')
      when 'reportes_guarderia' then public.modulo_activo('guarderia') or public.modulo_activo('hotel')
      else true
    end
  );
$function$;

-- Guardería u hotel: lo que sirve a los dos (fotos, videos, galerías, ligas).
create or replace function public.exigir_modulo_estancias()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or public.modulo_activo('guarderia') or public.modulo_activo('hotel') then
    return new;
  end if;
  raise exception 'Este negocio no tiene activo el módulo «%».', public.nombre_modulo('guarderia')
    using errcode = 'P0001', hint = 'modulo:guarderia';
end;
$$;

-- ── 1. Plantilla del reporte ────────────────────────────────────────

create table public.reporte_config (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  titulo text not null default 'REPORTE DE COMPORTAMIENTO' check (btrim(titulo) <> '' and length(titulo) <= 60),
  subtitulo text not null default '¡Un día lleno de juego, aprendizaje y bienestar!' check (length(subtitulo) <= 90),
  -- Vacío = los colores de la marca del negocio (negocios.marca.color).
  color_primario text check (color_primario ~ '^#[0-9a-fA-F]{6}$'),
  color_secundario text check (color_secundario ~ '^#[0-9a-fA-F]{6}$'),
  color_acento text check (color_acento ~ '^#[0-9a-fA-F]{6}$'),
  -- Días que viven las fotos, los videos, las tarjetas y sus ligas.
  retencion_dias int not null default 7 check (retencion_dias between 1 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index reporte_config_negocio_unico on public.reporte_config (negocio_id) where deleted_at is null;

create table public.reporte_secciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  clave text not null check (clave ~ '^[a-z0-9_]{2,40}$'),
  titulo text not null check (btrim(titulo) <> '' and length(titulo) <= 60),
  -- caras: fila de íconos grandes · iconos: cuadrícula de íconos · lista:
  -- renglones con círculo · resumen: casillas grandes · texto: solo texto.
  presentacion text not null check (presentacion in ('caras', 'iconos', 'lista', 'resumen', 'texto')),
  seleccion text not null default 'varias' check (seleccion in ('una', 'varias')),
  permite_otro boolean not null default false,
  -- Si trae etiqueta, la sección lleva un campo de texto con ese nombre
  -- («Observaciones», «Detalles importantes»); en 'texto' es el único campo.
  etiqueta_texto text check (length(etiqueta_texto) <= 40),
  columna text not null default 'izq' check (columna in ('izq', 'der', 'completo')),
  color text not null default 'secundario' check (color in ('primario', 'secundario', 'acento')),
  icono text check (length(icono) <= 30),
  orden int not null default 0,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index reporte_secciones_clave_unica on public.reporte_secciones (negocio_id, clave) where deleted_at is null;

create table public.reporte_opciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  seccion_id uuid not null references public.reporte_secciones(id),
  clave text not null check (clave ~ '^[a-z0-9_]{2,40}$'),
  texto text not null check (btrim(texto) <> '' and length(texto) <= 80),
  icono text check (length(icono) <= 30),
  orden int not null default 0,
  activa boolean not null default true,
  -- El atajo «Buen día» marca estas opciones.
  en_buen_dia boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index reporte_opciones_clave_unica on public.reporte_opciones (negocio_id, seccion_id, clave) where deleted_at is null;
create index reporte_opciones_seccion_idx on public.reporte_opciones (seccion_id);

-- ── 2. Reportes ─────────────────────────────────────────────────────

create table public.reportes_guarderia (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  perro_id uuid not null references public.perros(id),
  estancia_id uuid references public.estancias(id),
  -- Día del reporte en la zona del negocio (fecha_negocio()), nunca la del servidor.
  fecha date not null,
  estado text not null default 'borrador' check (estado in ('borrador', 'listo', 'enviado')),
  -- Snapshot: título, subtítulo y las secciones con sus claves, textos,
  -- íconos y marcas VIGENTES al guardar.
  contenido jsonb not null,
  version int not null default 1,
  contenido_at timestamptz not null default now(),
  llenado_por_nombre text,
  llenado_por uuid references auth.users(id) on delete set null,
  llenado_at timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null,
  enviado_at timestamptz,
  enviado_por uuid references auth.users(id) on delete set null,
  enviado_por_nombre text,
  envios int not null default 0,
  -- La imagen 1080×1350 (JPEG) en Storage; vence con la retención.
  tarjeta_path text,
  tarjeta_bytes bigint,
  tarjeta_at timestamptz,
  tarjeta_expira_at timestamptz,
  tarjeta_vencida_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  constraint reportes_guarderia_contenido_objeto check (jsonb_typeof(contenido) = 'object')
);
create unique index reportes_guarderia_uno_por_dia on public.reportes_guarderia (negocio_id, perro_id, fecha) where deleted_at is null;
create index reportes_guarderia_fecha_idx on public.reportes_guarderia (negocio_id, fecha);

create or replace function public.validar_ruta_archivo_reporte()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fila jsonb := to_jsonb(new);
begin
  if v_fila ->> 'path' is not null and left(v_fila ->> 'path', 37) <> (v_fila ->> 'negocio_id') || '/' then
    raise exception 'La ruta del archivo tiene que empezar con el negocio.';
  end if;
  if v_fila ->> 'tarjeta_path' is not null and left(v_fila ->> 'tarjeta_path', 37) <> (v_fila ->> 'negocio_id') || '/' then
    raise exception 'La ruta de la tarjeta tiene que empezar con el negocio.';
  end if;
  return new;
end;
$$;

create table public.reportes_guarderia_versiones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  reporte_id uuid not null references public.reportes_guarderia(id),
  version int not null,
  estado text not null,
  contenido jsonb not null,
  guardado_por uuid references auth.users(id) on delete set null,
  guardado_por_nombre text,
  guardado_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index reportes_guarderia_versiones_unica on public.reportes_guarderia_versiones (reporte_id, version);

-- ── 3. Fotos y videos, galerías y ligas ─────────────────────────────

create table public.media_perro (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  perro_id uuid not null references public.perros(id),
  estancia_id uuid references public.estancias(id),
  tipo text not null check (tipo in ('foto', 'video')),
  path text not null,
  mime text not null,
  bytes bigint check (bytes is null or bytes >= 0),
  duracion_s numeric(7, 2),
  estado text not null default 'subiendo' check (estado in ('subiendo', 'lista', 'fallida', 'vencida')),
  expira_at timestamptz not null,
  -- El personal la quitó antes de que venciera: el archivo se borra en la
  -- siguiente corrida de la tarea diaria.
  quitada_at timestamptz,
  quitada_por uuid references auth.users(id) on delete set null,
  -- Ya se borró de Storage; la fila queda para auditoría.
  vencida_at timestamptz,
  subido_por_nombre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index media_perro_path_unico on public.media_perro (path);
create index media_perro_perro_idx on public.media_perro (negocio_id, perro_id, created_at desc);
create index media_perro_por_vencer_idx on public.media_perro (expira_at) where vencida_at is null;

create table public.galerias_perro (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  perro_id uuid not null references public.perros(id),
  enviada_por_nombre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index galerias_perro_perro_idx on public.galerias_perro (negocio_id, perro_id);

create table public.galeria_items (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  galeria_id uuid not null references public.galerias_perro(id),
  media_id uuid not null references public.media_perro(id),
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index galeria_items_unico on public.galeria_items (galeria_id, media_id);

create table public.enlaces_cliente (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  tipo text not null check (tipo in ('reporte', 'galeria')),
  reporte_id uuid references public.reportes_guarderia(id),
  galeria_id uuid references public.galerias_perro(id),
  -- sha256 (hex) del token; el token en claro solo existe en el mensaje que
  -- se le manda al dueño.
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  expira_at timestamptz not null,
  revocado_at timestamptz,
  vistas int not null default 0,
  ultima_vista_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  constraint enlaces_cliente_destino check (
    (tipo = 'reporte' and reporte_id is not null and galeria_id is null)
    or (tipo = 'galeria' and galeria_id is not null and reporte_id is null)
  )
);
create unique index enlaces_cliente_token_unico on public.enlaces_cliente (token_hash);
create index enlaces_cliente_reporte_idx on public.enlaces_cliente (reporte_id);
create index enlaces_cliente_galeria_idx on public.enlaces_cliente (galeria_id);

-- ── 4. Lo común: índices, triggers, RLS y permisos ──────────────────

do $$
declare
  t text;
  r record;
begin
  foreach t in array array[
    'reporte_config', 'reporte_secciones', 'reporte_opciones', 'reportes_guarderia',
    'reportes_guarderia_versiones', 'media_perro', 'galerias_perro', 'galeria_items', 'enlaces_cliente'
  ] loop
    execute format('create index %I on public.%I (negocio_id)', t || '_negocio_idx', t);
    execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    -- Las dos redes de PeluDesk.
    execute format($f$create policy %I on public.%I as restrictive for all to authenticated
      using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
      with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))$f$, t || '_negocio', t);
    execute format($f$create policy %I on public.%I for all to peludesk_definer
      using (negocio_id = (select public.negocio_actual()))
      with check (negocio_id = (select public.negocio_actual()))$f$, t || '_negocio_definer', t);
    -- Solo lectura del negocio (prueba vencida, cobro fallido).
    execute format($f$create policy %I on public.%I as restrictive for insert to authenticated, peludesk_definer
      with check ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_ins', t);
    execute format($f$create policy %I on public.%I as restrictive for update to authenticated, peludesk_definer
      using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_upd', t);
    execute format($f$create policy %I on public.%I as restrictive for delete to authenticated, peludesk_definer
      using ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_del', t);
    -- Leer: admin y recepción con el permiso. El cliente y el anónimo, nada.
    execute format($f$create policy %I on public.%I for select to authenticated
      using ((select public.tiene_permiso('reportes_guarderia')))$f$, t || '_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to peludesk_definer', t);
  end loop;

  -- Módulos: el reporte, de guardería; lo demás, de guardería u hotel.
  for r in select * from (values
    ('reporte_secciones', 'guarderia'), ('reporte_opciones', 'guarderia'),
    ('reportes_guarderia', 'guarderia'), ('reportes_guarderia_versiones', 'guarderia')
  ) as x(tabla, modulo) loop
    execute format('create trigger exigir_modulo before insert or update on public.%I for each row execute function public.exigir_modulo_tabla(%L)', r.tabla, r.modulo);
  end loop;
  foreach t in array array['reporte_config', 'media_perro', 'galerias_perro', 'galeria_items', 'enlaces_cliente'] loop
    execute format('create trigger exigir_modulo before insert or update on public.%I for each row execute function public.exigir_modulo_estancias()', t);
  end loop;
end;
$$;

create trigger validar_ruta before insert or update on public.media_perro
  for each row execute function public.validar_ruta_archivo_reporte();
create trigger validar_ruta before insert or update on public.reportes_guarderia
  for each row execute function public.validar_ruta_archivo_reporte();

-- La plantilla y su configuración las edita SOLO admin, directo con su sesión
-- (la base valida el resto con los check). Nadie borra: se apaga.
do $$
declare
  t text;
begin
  foreach t in array array['reporte_config', 'reporte_secciones', 'reporte_opciones'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))', t || '_insert_admin', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t || '_update_admin', t);
    execute format('grant insert, update on public.%I to authenticated', t);
  end loop;
end;
$$;

-- Lo demás, solo por función: ni insert ni update directo.
do $$
declare
  t text;
begin
  foreach t in array array['reportes_guarderia', 'reportes_guarderia_versiones', 'media_perro', 'galerias_perro', 'galeria_items', 'enlaces_cliente'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check (false)', t || '_sin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (false)', t || '_sin_update', t);
  end loop;
end;
$$;

comment on table public.reportes_guarderia is
  'Reporte de comportamiento diario por perro (guardería). Se escribe solo por reporte_guardar; contenido es un snapshot de la plantilla con las marcas.';
comment on table public.media_perro is
  'Fotos y videos de perros que están adentro (hotel/guardería), en el bucket privado reportes-archivos. Se borran a los N días: vencida_at marca el borrado.';
comment on table public.enlaces_cliente is
  'Ligas públicas /r/<token> y /f/<token>. Solo el sha256 del token; el servidor las valida con la secret key filtrando negocio.';

-- ── 5. Bucket privado (sin políticas: sube y firma el servidor) ─────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reportes-archivos', 'reportes-archivos', false, 62914560,
  array['image/jpeg', 'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types, public = false;

-- ── 6. Funciones ────────────────────────────────────────────────────

create or replace function public.reporte_retencion_dias()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.retencion_dias from public.reporte_config c
                   where c.negocio_id = public.negocio_actual() and c.deleted_at is null), 7);
$$;
alter function public.reporte_retencion_dias() owner to peludesk_definer;
revoke execute on function public.reporte_retencion_dias() from public, anon;
grant execute on function public.reporte_retencion_dias() to authenticated;

create or replace function public.nombre_de_quien_llama()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim((select p.nombre_completo from public.profiles p where p.id = auth.uid())), ''), 'Personal');
$$;
alter function public.nombre_de_quien_llama() owner to peludesk_definer;
revoke execute on function public.nombre_de_quien_llama() from public, anon;
grant execute on function public.nombre_de_quien_llama() to authenticated;

-- La plantilla inicial (la de la tarjeta que los negocios entregaban a mano).
-- NO es SECURITY DEFINER: corre con quien la llama (postgres en esta
-- migración; peludesk_definer desde reporte_asegurar_plantilla).
create or replace function public.reporte_sembrar(p_negocio uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_semilla jsonb := $json$[
    {"clave":"estado_general","titulo":"Estado general del día","presentacion":"caras","seleccion":"una","columna":"izq","color":"secundario","icono":null,"etiqueta_texto":null,"permite_otro":false,
     "opciones":[
       {"clave":"muy_tranquilo","texto":"Muy tranquilo","icono":"cara_muy_tranquilo"},
       {"clave":"relajado","texto":"Relajado","icono":"cara_relajado"},
       {"clave":"activo","texto":"Activo","icono":"cara_activo","buen_dia":true},
       {"clave":"muy_energetico","texto":"Muy energético","icono":"cara_muy_energetico"},
       {"clave":"nervioso","texto":"Nervioso","icono":"cara_nervioso"},
       {"clave":"sensible_entorno","texto":"Sensible al entorno","icono":"cara_sensible"}]},
    {"clave":"actividades","titulo":"Actividades realizadas","presentacion":"iconos","seleccion":"varias","columna":"izq","color":"acento","icono":"hueso","etiqueta_texto":null,"permite_otro":true,
     "opciones":[
       {"clave":"juego_libre","texto":"Juego libre","icono":"pelota","buen_dia":true},
       {"clave":"senderismo","texto":"Senderismo","icono":"arbol"},
       {"clave":"alberca","texto":"Alberca","icono":"alberca"},
       {"clave":"juegos_olfato","texto":"Juegos de olfato","icono":"nariz"},
       {"clave":"descanso_grupal","texto":"Descanso grupal","icono":"perro_durmiendo"},
       {"clave":"entrenamiento_basico","texto":"Entrenamiento básico","icono":"birrete"},
       {"clave":"enriquecimiento_ambiental","texto":"Enriquecimiento ambiental","icono":"rompecabezas"}]},
    {"clave":"alimentacion","titulo":"Alimentación e hidratación","presentacion":"lista","seleccion":"varias","columna":"izq","color":"secundario","icono":"plato","etiqueta_texto":null,"permite_otro":false,
     "opciones":[
       {"clave":"comio_normal","texto":"Comió normal","icono":null,"buen_dia":true},
       {"clave":"comio_poco","texto":"Comió poco","icono":null},
       {"clave":"no_quiso_comer","texto":"No quiso comer","icono":null},
       {"clave":"tomo_agua","texto":"Tomó suficiente agua","icono":null,"buen_dia":true},
       {"clave":"requirio_monitoreo","texto":"Requirió monitoreo","icono":null}]},
    {"clave":"descanso","titulo":"Descanso","presentacion":"lista","seleccion":"varias","columna":"izq","color":"primario","icono":"luna","etiqueta_texto":null,"permite_otro":false,
     "opciones":[
       {"clave":"descanso_correcto","texto":"Descansó correctamente","icono":"perro_durmiendo","buen_dia":true},
       {"clave":"costo_relajarse","texto":"Le costó relajarse","icono":"perro_alerta"},
       {"clave":"durmio_dia","texto":"Durmió durante el día","icono":"zzz"}]},
    {"clave":"socializacion","titulo":"Socialización con otros perros","presentacion":"lista","seleccion":"varias","columna":"der","color":"primario","icono":"huella","etiqueta_texto":"Observaciones","permite_otro":false,
     "opciones":[
       {"clave":"excelente_convivencia","texto":"Excelente convivencia","icono":null,"buen_dia":true},
       {"clave":"jugo_correctamente","texto":"Jugó correctamente","icono":null,"buen_dia":true},
       {"clave":"prefirio_tranquilos","texto":"Prefirió espacios tranquilos","icono":null},
       {"clave":"requirio_pausas","texto":"Requirió pausas durante el juego","icono":null},
       {"clave":"conductas_dominantes","texto":"Presentó conductas dominantes","icono":null},
       {"clave":"conductas_reactivas","texto":"Presentó conductas reactivas","icono":null},
       {"clave":"supervision_especial","texto":"Necesitó supervisión especial","icono":null}]},
    {"clave":"conducta","titulo":"Conducta durante el día","presentacion":"lista","seleccion":"varias","columna":"der","color":"secundario","icono":"estrella","etiqueta_texto":"Detalles importantes","permite_otro":true,
     "opciones":[
       {"clave":"comparti_espacios","texto":"Compartió espacios sin problema","icono":null,"buen_dia":true},
       {"clave":"respondio_correcciones","texto":"Respondió bien a correcciones","icono":null,"buen_dia":true},
       {"clave":"busco_atencion","texto":"Buscó atención humana constantemente","icono":null},
       {"clave":"independiente","texto":"Se mostró independiente","icono":null},
       {"clave":"altero_estimulos","texto":"Se alteró con estímulos específicos","icono":null},
       {"clave":"ansiedad_separacion","texto":"Mostró ansiedad por separación","icono":null},
       {"clave":"adapto_grupo","texto":"Se adaptó bien al grupo","icono":null,"buen_dia":true}]},
    {"clave":"recomendaciones","titulo":"Recomendaciones","presentacion":"texto","seleccion":"varias","columna":"der","color":"acento","icono":"portapapeles","etiqueta_texto":"Recomendaciones","permite_otro":false,"opciones":[]},
    {"clave":"resumen","titulo":"Resumen del día","presentacion":"resumen","seleccion":"una","columna":"completo","color":"secundario","icono":null,"etiqueta_texto":null,"permite_otro":false,
     "opciones":[
       {"clave":"excelente_dia","texto":"Excelente día","icono":"estrella"},
       {"clave":"buen_dia","texto":"Buen día","icono":"carita_feliz","buen_dia":true},
       {"clave":"dia_observaciones","texto":"Día con observaciones","icono":"advertencia"},
       {"clave":"requiere_seguimiento","texto":"Requiere seguimiento","icono":"estetoscopio"}]}
  ]$json$;
  s jsonb;
  o jsonb;
  v_orden_s int := 0;
  v_orden_o int;
  v_seccion uuid;
begin
  insert into public.reporte_config (negocio_id)
  select p_negocio where not exists (select 1 from public.reporte_config where negocio_id = p_negocio and deleted_at is null);
  if exists (select 1 from public.reporte_secciones where negocio_id = p_negocio and deleted_at is null) then
    return;
  end if;
  for s in select * from jsonb_array_elements(v_semilla) loop
    v_orden_s := v_orden_s + 1;
    insert into public.reporte_secciones (negocio_id, clave, titulo, presentacion, seleccion, permite_otro, etiqueta_texto, columna, color, icono, orden)
    values (p_negocio, s ->> 'clave', s ->> 'titulo', s ->> 'presentacion', s ->> 'seleccion', (s ->> 'permite_otro')::boolean,
            s ->> 'etiqueta_texto', s ->> 'columna', s ->> 'color', s ->> 'icono', v_orden_s)
    returning id into v_seccion;
    v_orden_o := 0;
    for o in select * from jsonb_array_elements(s -> 'opciones') loop
      v_orden_o := v_orden_o + 1;
      insert into public.reporte_opciones (negocio_id, seccion_id, clave, texto, icono, orden, en_buen_dia)
      values (p_negocio, v_seccion, o ->> 'clave', o ->> 'texto', o ->> 'icono', v_orden_o, coalesce((o ->> 'buen_dia')::boolean, false));
    end loop;
  end loop;
end;
$$;
revoke execute on function public.reporte_sembrar(uuid) from public, anon, authenticated;
grant execute on function public.reporte_sembrar(uuid) to peludesk_definer;

-- La plantilla de un negocio que todavía no la tiene (negocio nuevo): se
-- siembra al abrir el reporte o su pantalla de ajustes.
create or replace function public.reporte_asegurar_plantilla()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('reportes_guarderia') then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes de guardería», puede usar el reporte.';
  end if;
  if exists (select 1 from public.reporte_secciones where negocio_id = public.negocio_actual() and deleted_at is null) then
    return;
  end if;
  if not public.negocio_escribible() then
    return;
  end if;
  perform public.reporte_sembrar(public.negocio_actual());
end;
$$;
alter function public.reporte_asegurar_plantilla() owner to peludesk_definer;
revoke execute on function public.reporte_asegurar_plantilla() from public, anon;
grant execute on function public.reporte_asegurar_plantilla() to authenticated;

-- Todos los negocios que ya existen la reciben. Ludogteka conserva los
-- colores de su tarjeta (azul, turquesa y amarillo de la imagen de referencia).
do $$
declare
  n record;
begin
  -- Como la secret key: los triggers de módulo no frenan la siembra.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  for n in select id, slug from public.negocios where deleted_at is null loop
    perform public.reporte_sembrar(n.id);
    if n.slug = 'ludogteka' then
      update public.reporte_config
         set color_primario = '#0A3BB5', color_secundario = '#00AEB1', color_acento = '#FEBD01'
       where negocio_id = n.id and deleted_at is null;
    end if;
  end loop;
end;
$$;

-- ── 6b. Guardar un reporte ──────────────────────────────────────────
-- p_respuestas: { "<clave de sección>": { "opciones": ["clave", …], "otro": "texto", "texto": "texto" } }
create or replace function public.reporte_guardar(p_perro_id uuid, p_respuestas jsonb, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy date := public.fecha_negocio();
  v_hay boolean;
  v_estancia uuid;
  v_cfg record;
  v_previo record;
  v_previo_contenido jsonb;
  v_secciones jsonb := '[]'::jsonb;
  s record;
  o record;
  v_resp jsonb;
  v_marcas text[];
  v_opciones jsonb;
  v_otro text;
  v_texto text;
  v_marcada boolean;
  v_faltan text[] := '{}';
  v_algo boolean := false;
  v_contenido jsonb;
  v_id uuid;
  v_version int;
  v_estado text := p_estado;
  v_nombre text := public.nombre_de_quien_llama();
  v_prev_sec jsonb;
  v_prev_op jsonb;
  v_claves_conocidas text[];
begin
  if not public.tiene_permiso('reportes_guarderia') then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes de guardería», llena reportes.';
  end if;
  if not public.modulo_activo('guarderia') then
    raise exception 'Este negocio no tiene activo el módulo «%».', public.nombre_modulo('guarderia') using hint = 'modulo:guarderia';
  end if;
  if p_estado not in ('borrador', 'listo') then
    raise exception 'El estado del reporte es borrador o listo.';
  end if;
  if p_respuestas is null or jsonb_typeof(p_respuestas) <> 'object' then
    raise exception 'Manda las respuestas como un objeto.';
  end if;

  perform 1 from public.perros where id = p_perro_id and deleted_at is null;
  if not found then
    raise exception 'No encontramos a ese perro.';
  end if;

  select e.id into v_estancia
  from public.estancias e join public.servicios sv on sv.id = e.servicio_id
  where e.perro_id = p_perro_id and e.deleted_at is null and sv.categoria = 'guarderia'
    and (e.estado = 'en_curso' or (e.estado = 'finalizada' and (e.fecha_entrada = v_hoy or e.fecha_salida = v_hoy)))
  order by (e.estado = 'en_curso') desc, e.created_at desc
  limit 1;
  v_hay := found;
  if not v_hay then
    raise exception 'Este perro no tiene una estancia de guardería en curso hoy.';
  end if;

  select * into v_cfg from public.reporte_config where negocio_id = public.negocio_actual() and deleted_at is null;
  if not found then
    perform public.reporte_asegurar_plantilla();
    select * into v_cfg from public.reporte_config where negocio_id = public.negocio_actual() and deleted_at is null;
  end if;

  select * into v_previo from public.reportes_guarderia
  where negocio_id = public.negocio_actual() and perro_id = p_perro_id and fecha = v_hoy and deleted_at is null;
  v_hay := found;
  v_previo_contenido := case when v_hay then v_previo.contenido else null end;

  for s in
    select * from public.reporte_secciones
    where negocio_id = public.negocio_actual() and deleted_at is null and activa
    order by orden, created_at
  loop
    v_resp := coalesce(p_respuestas -> s.clave, '{}'::jsonb);
    if jsonb_typeof(v_resp) <> 'object' then
      raise exception 'La respuesta de «%» no es válida.', s.titulo;
    end if;
    select coalesce(array_agg(x), '{}') into v_marcas from jsonb_array_elements_text(coalesce(v_resp -> 'opciones', '[]'::jsonb)) x;
    if s.seleccion = 'una' and cardinality(v_marcas) > 1 then
      raise exception 'En «%» solo se puede elegir una opción.', s.titulo;
    end if;
    if cardinality(v_marcas) > 0 and s.presentacion = 'texto' then
      raise exception 'La sección «%» solo lleva texto.', s.titulo;
    end if;

    -- Lo que la sección tenía en el reporte anterior (para no perder una
    -- opción marcada que la plantilla ya apagó).
    v_prev_sec := null;
    if v_previo_contenido is not null then
      select e into v_prev_sec from jsonb_array_elements(v_previo_contenido -> 'secciones') e where e ->> 'clave' = s.clave limit 1;
    end if;

    v_opciones := '[]'::jsonb;
    v_claves_conocidas := '{}';
    for o in
      select * from public.reporte_opciones
      where negocio_id = public.negocio_actual() and seccion_id = s.id and deleted_at is null and activa
      order by orden, created_at
    loop
      v_marcada := o.clave = any (v_marcas);
      v_claves_conocidas := array_append(v_claves_conocidas, o.clave);
      v_opciones := v_opciones || jsonb_build_object('clave', o.clave, 'texto', o.texto, 'icono', o.icono, 'marcada', v_marcada);
    end loop;
    if v_prev_sec is not null then
      for v_prev_op in select * from jsonb_array_elements(v_prev_sec -> 'opciones') loop
        if not (v_prev_op ->> 'clave' = any (v_claves_conocidas)) and (v_prev_op ->> 'clave') = any (v_marcas) then
          v_claves_conocidas := array_append(v_claves_conocidas, v_prev_op ->> 'clave');
          v_opciones := v_opciones || jsonb_build_object('clave', v_prev_op ->> 'clave', 'texto', v_prev_op ->> 'texto',
                                                         'icono', v_prev_op -> 'icono', 'marcada', true);
        end if;
      end loop;
    end if;
    -- Una clave que no existe ni existía: error, no se ignora en silencio.
    if exists (select 1 from unnest(v_marcas) m where not (m = any (v_claves_conocidas))) then
      raise exception 'En «%» hay una opción que ya no existe. Recarga el reporte.', s.titulo;
    end if;

    v_otro := nullif(btrim(coalesce(v_resp ->> 'otro', '')), '');
    if v_otro is not null and not s.permite_otro then
      raise exception 'La sección «%» no admite «Otro».', s.titulo;
    end if;
    if length(coalesce(v_otro, '')) > 80 then
      raise exception 'El «Otro» de «%» pasa de 80 caracteres.', s.titulo;
    end if;
    v_texto := nullif(btrim(coalesce(v_resp ->> 'texto', '')), '');
    if v_texto is not null and s.etiqueta_texto is null then
      raise exception 'La sección «%» no lleva texto.', s.titulo;
    end if;
    if length(coalesce(v_texto, '')) > 600 then
      raise exception 'El texto de «%» pasa de 600 caracteres.', s.titulo;
    end if;

    if cardinality(v_marcas) > 0 or v_otro is not null or v_texto is not null then
      v_algo := true;
    end if;
    if s.seleccion = 'una' and s.presentacion <> 'texto' and cardinality(v_marcas) = 0 then
      v_faltan := array_append(v_faltan, s.titulo);
    end if;

    v_secciones := v_secciones || jsonb_build_object(
      'clave', s.clave, 'titulo', s.titulo, 'presentacion', s.presentacion, 'seleccion', s.seleccion,
      'columna', s.columna, 'color', s.color, 'icono', s.icono, 'etiqueta_texto', s.etiqueta_texto,
      'permite_otro', s.permite_otro, 'opciones', v_opciones, 'otro', v_otro, 'texto', v_texto);
  end loop;

  if not v_algo then
    raise exception 'Marca algo antes de guardar el reporte.';
  end if;
  if p_estado = 'listo' and cardinality(v_faltan) > 0 then
    raise exception 'Para dejarlo listo falta elegir: %.', array_to_string(v_faltan, ', ');
  end if;

  v_contenido := jsonb_build_object(
    'titulo', coalesce(v_cfg.titulo, 'REPORTE DE COMPORTAMIENTO'),
    'subtitulo', coalesce(v_cfg.subtitulo, ''),
    'secciones', v_secciones);

  if not v_hay then
    insert into public.reportes_guarderia (perro_id, estancia_id, fecha, estado, contenido, llenado_por, llenado_por_nombre, actualizado_por)
    values (p_perro_id, v_estancia, v_hoy, p_estado, v_contenido, auth.uid(), v_nombre, auth.uid())
    returning id, version into v_id, v_version;
    return jsonb_build_object('id', v_id, 'version', v_version, 'estado', p_estado, 'nuevo', true);
  end if;

  v_id := v_previo.id;
  v_version := v_previo.version;
  if v_previo.contenido = v_contenido and v_previo.estado = p_estado then
    return jsonb_build_object('id', v_id, 'version', v_version, 'estado', v_previo.estado, 'nuevo', false, 'sin_cambios', true);
  end if;

  if v_previo.estado = 'enviado' then
    -- Ya se le mandó al dueño: lo anterior queda versionado y lo corregido
    -- hay que volver a mandarlo.
    insert into public.reportes_guarderia_versiones (reporte_id, version, estado, contenido, guardado_por, guardado_por_nombre, guardado_at)
    values (v_previo.id, v_previo.version, v_previo.estado, v_previo.contenido,
            coalesce(v_previo.actualizado_por, v_previo.llenado_por), v_previo.llenado_por_nombre, v_previo.contenido_at);
    v_version := v_previo.version + 1;
    v_estado := 'listo';
  end if;

  update public.reportes_guarderia
     set contenido = v_contenido, estado = v_estado, version = v_version, contenido_at = now(),
         actualizado_por = auth.uid(), llenado_por_nombre = case when v_previo.estado = 'enviado' then v_nombre else llenado_por_nombre end
   where id = v_id;
  return jsonb_build_object('id', v_id, 'version', v_version, 'estado', v_estado, 'nuevo', false);
end;
$$;
alter function public.reporte_guardar(uuid, jsonb, text) owner to peludesk_definer;
revoke execute on function public.reporte_guardar(uuid, jsonb, text) from public, anon;
grant execute on function public.reporte_guardar(uuid, jsonb, text) to authenticated;

-- ── 6c. La imagen del reporte y su liga ─────────────────────────────

-- Devuelve la ruta anterior (para que el servidor borre ese archivo).
create or replace function public.reporte_registrar_tarjeta(p_reporte_id uuid, p_path text, p_bytes bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viejo text;
  v_hay boolean;
begin
  if not public.tiene_permiso('reportes_guarderia') then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes de guardería», genera la imagen del reporte.';
  end if;
  if p_path is null or left(p_path, 37) <> public.negocio_actual()::text || '/' or p_path !~ '/tarjetas/' then
    raise exception 'La ruta de la imagen no es de este negocio.';
  end if;
  if p_bytes is null or p_bytes <= 0 or p_bytes > 10485760 then
    raise exception 'El tamaño de la imagen no es válido.';
  end if;
  select tarjeta_path into v_viejo from public.reportes_guarderia
  where id = p_reporte_id and negocio_id = public.negocio_actual() and deleted_at is null;
  v_hay := found;
  if not v_hay then
    raise exception 'No encontramos ese reporte.';
  end if;
  update public.reportes_guarderia
     set tarjeta_path = p_path, tarjeta_bytes = p_bytes, tarjeta_at = clock_timestamp(),
         tarjeta_expira_at = now() + make_interval(days => public.reporte_retencion_dias()), tarjeta_vencida_at = null
   where id = p_reporte_id;
  return v_viejo;
end;
$$;
alter function public.reporte_registrar_tarjeta(uuid, text, bigint) owner to peludesk_definer;
revoke execute on function public.reporte_registrar_tarjeta(uuid, text, bigint) from public, anon;
grant execute on function public.reporte_registrar_tarjeta(uuid, text, bigint) to authenticated;

create or replace function public.reporte_crear_enlace(p_reporte_id uuid, p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r record;
  v_hay boolean;
  v_expira timestamptz;
  v_nombre text := public.nombre_de_quien_llama();
begin
  if not public.tiene_permiso('reportes_guarderia') then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes de guardería», envía reportes.';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'El token no es válido.';
  end if;
  select * into v_r from public.reportes_guarderia
  where id = p_reporte_id and negocio_id = public.negocio_actual() and deleted_at is null;
  v_hay := found;
  if not v_hay then
    raise exception 'No encontramos ese reporte.';
  end if;
  if v_r.estado = 'borrador' then
    raise exception 'Deja el reporte listo antes de enviarlo.';
  end if;
  if v_r.tarjeta_path is null or v_r.tarjeta_vencida_at is not null or v_r.tarjeta_at < v_r.contenido_at then
    raise exception 'Genera de nuevo la imagen del reporte antes de enviarlo.';
  end if;
  v_expira := now() + make_interval(days => public.reporte_retencion_dias());
  insert into public.enlaces_cliente (tipo, reporte_id, token_hash, expira_at)
  values ('reporte', p_reporte_id, p_hash, v_expira);
  -- La imagen vive lo mismo que la liga nueva.
  update public.reportes_guarderia
     set estado = 'enviado', enviado_at = now(), enviado_por = auth.uid(), enviado_por_nombre = v_nombre,
         envios = envios + 1, tarjeta_expira_at = greatest(coalesce(tarjeta_expira_at, v_expira), v_expira)
   where id = p_reporte_id;
  return jsonb_build_object('expira_at', v_expira);
end;
$$;
alter function public.reporte_crear_enlace(uuid, text) owner to peludesk_definer;
revoke execute on function public.reporte_crear_enlace(uuid, text) from public, anon;
grant execute on function public.reporte_crear_enlace(uuid, text) to authenticated;

-- ── 6d. Fotos y videos ──────────────────────────────────────────────

create or replace function public.media_preparar(p_perro_id uuid, p_tipo text, p_mime text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hay boolean;
  v_estancia uuid;
  v_id uuid := gen_random_uuid();
  v_ext text;
  v_path text;
begin
  if not public.tiene_permiso('reportes_guarderia') then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes de guardería», sube fotos y videos.';
  end if;
  if p_tipo not in ('foto', 'video') then
    raise exception 'El tipo es foto o video.';
  end if;
  v_ext := case
    when p_tipo = 'foto' and p_mime = 'image/jpeg' then 'jpg'
    when p_tipo = 'video' and p_mime = 'video/mp4' then 'mp4'
    when p_tipo = 'video' and p_mime = 'video/quicktime' then 'mov'
    when p_tipo = 'video' and p_mime = 'video/webm' then 'webm'
    when p_tipo = 'video' and p_mime = 'video/x-m4v' then 'm4v'
    when p_tipo = 'video' and p_mime = 'video/3gpp' then '3gp'
    else null end;
  if v_ext is null then
    raise exception 'Ese tipo de archivo no se puede subir (%).', coalesce(p_mime, 'sin tipo');
  end if;
  perform 1 from public.perros where id = p_perro_id and deleted_at is null;
  if not found then
    raise exception 'No encontramos a ese perro.';
  end if;
  select e.id into v_estancia
  from public.estancias e join public.servicios sv on sv.id = e.servicio_id
  where e.perro_id = p_perro_id and e.deleted_at is null and e.estado = 'en_curso' and sv.categoria in ('guarderia', 'hotel')
  order by e.created_at desc limit 1;
  v_hay := found;
  if not v_hay then
    raise exception 'Este perro no está adentro ahora (guardería u hotel).';
  end if;
  v_path := public.negocio_actual()::text || '/media/' || p_perro_id::text || '/' || v_id::text || '.' || v_ext;
  insert into public.media_perro (id, perro_id, estancia_id, tipo, path, mime, expira_at, subido_por_nombre)
  values (v_id, p_perro_id, v_estancia, p_tipo, v_path, p_mime,
          now() + make_interval(days => public.reporte_retencion_dias()), public.nombre_de_quien_llama());
  return jsonb_build_object('id', v_id, 'path', v_path);
end;
$$;
alter function public.media_preparar(uuid, text, text) owner to peludesk_definer;
revoke execute on function public.media_preparar(uuid, text, text) from public, anon;
grant execute on function public.media_preparar(uuid, text, text) to authenticated;

create or replace function public.media_confirmar(p_id uuid, p_bytes bigint, p_duracion numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m record;
  v_hay boolean;
begin
  if not public.tiene_permiso('reportes_guarderia') then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes de guardería», sube fotos y videos.';
  end if;
  select * into v_m from public.media_perro where id = p_id and negocio_id = public.negocio_actual() and deleted_at is null;
  v_hay := found;
  if not v_hay then
    raise exception 'No encontramos ese archivo.';
  end if;
  if v_m.estado <> 'subiendo' then
    raise exception 'Ese archivo ya se confirmó o venció.';
  end if;
  if p_bytes is null or p_bytes <= 0
     or (v_m.tipo = 'foto' and p_bytes > 15728640)
     or (v_m.tipo = 'video' and p_bytes > 62914560) then
    raise exception 'El archivo pasa del tamaño permitido (fotos 15 MB, videos 60 MB).' using errcode = 'P0001';
  end if;
  if v_m.tipo = 'video' and p_duracion is not null and p_duracion > 46 then
    raise exception 'El video dura más de 45 segundos.' using errcode = 'P0001';
  end if;
  update public.media_perro set estado = 'lista', bytes = p_bytes, duracion_s = p_duracion where id = p_id;
end;
$$;
alter function public.media_confirmar(uuid, bigint, numeric) owner to peludesk_definer;
revoke execute on function public.media_confirmar(uuid, bigint, numeric) from public, anon;
grant execute on function public.media_confirmar(uuid, bigint, numeric) to authenticated;

-- Quitar uno (o descartar uno que falló): se borra de Storage en la siguiente corrida.
create or replace function public.media_quitar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('reportes_guarderia') then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes de guardería», quita fotos y videos.';
  end if;
  update public.media_perro set quitada_at = coalesce(quitada_at, now()), quitada_por = auth.uid()
   where id = p_id and negocio_id = public.negocio_actual() and deleted_at is null and vencida_at is null;
end;
$$;
alter function public.media_quitar(uuid) owner to peludesk_definer;
revoke execute on function public.media_quitar(uuid) from public, anon;
grant execute on function public.media_quitar(uuid) to authenticated;

-- Una galería con lo que el personal escogió y su liga.
create or replace function public.galeria_crear(p_perro_id uuid, p_media_ids uuid[], p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_galeria uuid;
  v_expira timestamptz;
  v_total int;
  v_buenos int;
  v_id uuid;
  v_orden int := 0;
begin
  if not public.tiene_permiso('reportes_guarderia') then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes de guardería», envía fotos y videos.';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'El token no es válido.';
  end if;
  v_total := coalesce(cardinality(p_media_ids), 0);
  if v_total = 0 then
    raise exception 'Escoge al menos una foto o un video.';
  end if;
  if v_total > 40 then
    raise exception 'Una galería lleva máximo 40 archivos.';
  end if;
  select count(*) into v_buenos from public.media_perro m
  where m.id = any (p_media_ids) and m.negocio_id = public.negocio_actual() and m.perro_id = p_perro_id
    and m.estado = 'lista' and m.quitada_at is null and m.vencida_at is null and m.deleted_at is null;
  if v_buenos <> (select count(distinct x) from unnest(p_media_ids) x) then
    raise exception 'Alguno de los archivos ya no está disponible o no es de este perro.';
  end if;
  v_expira := now() + make_interval(days => public.reporte_retencion_dias());
  insert into public.galerias_perro (perro_id, enviada_por_nombre) values (p_perro_id, public.nombre_de_quien_llama())
  returning id into v_galeria;
  for v_id in select distinct x from unnest(p_media_ids) x loop
    v_orden := v_orden + 1;
    insert into public.galeria_items (galeria_id, media_id, orden) values (v_galeria, v_id, v_orden);
  end loop;
  insert into public.enlaces_cliente (tipo, galeria_id, token_hash, expira_at) values ('galeria', v_galeria, p_hash, v_expira);
  return jsonb_build_object('galeria_id', v_galeria, 'expira_at', v_expira);
end;
$$;
alter function public.galeria_crear(uuid, uuid[], text) owner to peludesk_definer;
revoke execute on function public.galeria_crear(uuid, uuid[], text) from public, anon;
grant execute on function public.galeria_crear(uuid, uuid[], text) to authenticated;

-- ── 7. El espacio que usa cada negocio (administración de PeluDesk) ─

create or replace function public.plataforma_almacenamiento_reportes()
returns table (negocio_id uuid, nombre text, slug text, archivos bigint, bytes bigint, vencidos bigint, retencion_dias int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.es_admin_plataforma() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  return query
  select n.id, n.nombre, n.slug,
    coalesce(m.archivos, 0) + coalesce(r.archivos, 0),
    coalesce(m.bytes, 0) + coalesce(r.bytes, 0),
    coalesce(m.vencidos, 0) + coalesce(r.vencidos, 0),
    coalesce((select c.retencion_dias from public.reporte_config c where c.negocio_id = n.id and c.deleted_at is null), 7)
  from public.negocios n
  left join (
    select x.negocio_id,
      count(*) filter (where x.vencida_at is null and x.estado = 'lista') as archivos,
      coalesce(sum(x.bytes) filter (where x.vencida_at is null and x.estado = 'lista'), 0) as bytes,
      count(*) filter (where x.vencida_at is not null) as vencidos
    from public.media_perro x where x.deleted_at is null group by x.negocio_id
  ) m on m.negocio_id = n.id
  left join (
    select y.negocio_id,
      count(*) filter (where y.tarjeta_path is not null and y.tarjeta_vencida_at is null) as archivos,
      coalesce(sum(y.tarjeta_bytes) filter (where y.tarjeta_path is not null and y.tarjeta_vencida_at is null), 0) as bytes,
      count(*) filter (where y.tarjeta_vencida_at is not null) as vencidos
    from public.reportes_guarderia y where y.deleted_at is null group by y.negocio_id
  ) r on r.negocio_id = n.id
  where n.deleted_at is null
  order by 5 desc, n.nombre;
end;
$$;
revoke execute on function public.plataforma_almacenamiento_reportes() from public, anon;
grant execute on function public.plataforma_almacenamiento_reportes() to authenticated, service_role;

do $$
declare v_def text;
begin
  select pg_get_functiondef('public.auditoria_frontera()'::regprocedure) into v_def;
  if position('plataforma_almacenamiento_reportes' in v_def) = 0 then
    v_def := replace(v_def, $a$('resumen_datos')$a$, $b$('resumen_datos'), ('plataforma_almacenamiento_reportes')$b$);
    if position('plataforma_almacenamiento_reportes' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar el almacenamiento de reportes.';
    end if;
    execute v_def;
  end if;
end $$;
