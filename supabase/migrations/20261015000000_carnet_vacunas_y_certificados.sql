-- Veterinaria, Fase 1 · parte 1: carnet de la mascota (vacunas y desparasitaciones),
-- recordatorios de próxima dosis, carnet verificable y certificado de salud (carril A).
--
-- · CARNET. Dos libros por mascota: vacunas (biológico, lote, laboratorio, fecha,
--   próxima dosis, médico que aplica) y desparasitaciones (producto, dosis, fecha,
--   próxima). Un registro NO se edita ni se borra: se ANULA con motivo y se captura
--   de nuevo (queda quién, cuándo y por qué). Producto y lote salen del inventario con
--   lotes cuando existen (y descuentan una dosis del lote); si no, texto libre.
-- · «El carnet reemplaza al comprobante» (opción por negocio, apagada): una vacuna del
--   carnet ligada a un requisito sanitario del negocio (antirrábica, etc.) crea la
--   aplicación del requisito, así que el check-in de Hotel / Guardería la acepta sin que
--   nadie suba el documento a mano. Anular la vacuna anula esa aplicación.
-- · RECORDATORIOS. `carnet_recordatorios` es la cola: una fila por dosis próxima
--   (única por registro y fecha: nunca dos veces). Los genera `carnet_generar_recordatorios`
--   según los ajustes del negocio (días de anticipación, apagado general, apagado por
--   mascota); el envío automático lo hace la tarea de Vercel con la API de WhatsApp y
--   la deja anotada aquí; la misma cola alimenta la lista para mandarlo a mano (wa.me).
-- · CARNET VERIFICABLE. Un enlace público con token (solo se guarda su sha256) que
--   enseña nombre de la mascota, nombre del dueño, vacunas vigentes y negocio emisor:
--   nada de dinero ni de datos clínicos. Lo resuelve el servidor con la secret key.
-- · CERTIFICADO DE SALUD. Imprimible, con vigencia configurable, a nombre de un médico
--   veterinario (cédula) y con los datos del establecimiento. Se guarda una FOTO de todo
--   lo que dice (snapshot) y no se edita: se anula con motivo y se emite otro.
--
-- Permisos nuevos (apagados salvo admin y médico veterinario designado):
--   registrar_vacunas · emitir_certificados · hospitalizar (lo usa la parte 2).

-- ── 0. Ayudante de esta migración y las dos siguientes ───────────────
create or replace function public._vet_redes(p_tabla text, p_lectura text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('create index %I on public.%I (negocio_id)', p_tabla || '_negocio_idx', p_tabla);
  execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function public.set_updated_at()', p_tabla);
  execute format('alter table public.%I enable row level security', p_tabla);
  execute format('create policy %I on public.%I as restrictive for all to authenticated using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro())) with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))', p_tabla || '_negocio', p_tabla);
  execute format('create policy %I on public.%I for all to peludesk_definer using (negocio_id = (select public.negocio_actual())) with check (negocio_id = (select public.negocio_actual()))', p_tabla || '_negocio_definer', p_tabla);
  execute format('create policy %I on public.%I as restrictive for insert to authenticated, peludesk_definer with check ((select public.exigir_negocio_escribible()))', p_tabla || '_escritura_ins', p_tabla);
  execute format('create policy %I on public.%I as restrictive for update to authenticated, peludesk_definer using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()))', p_tabla || '_escritura_upd', p_tabla);
  execute format('create policy %I on public.%I as restrictive for delete to authenticated, peludesk_definer using ((select public.exigir_negocio_escribible()))', p_tabla || '_escritura_del', p_tabla);
  execute format('create policy %I on public.%I for select to authenticated using (%s)', p_tabla || '_select', p_tabla, p_lectura);
  execute format('revoke all on public.%I from anon, authenticated', p_tabla);
  execute format('grant select on public.%I to authenticated', p_tabla);
  execute format('grant select, insert, update, delete on public.%I to peludesk_definer', p_tabla);
  execute format('create trigger exigir_modulo before insert or update on public.%I for each row execute function public.exigir_modulo_tabla(%L)', p_tabla, 'veterinaria');
end;
$$;
revoke execute on function public._vet_redes(text, text) from public, anon, authenticated;

-- ── 1. Permisos ──────────────────────────────────────────────────────
insert into public.permisos_catalogo (clave, etiqueta, modulos, orden) values
  ('registrar_vacunas', 'Registrar vacunas y desparasitaciones', '{veterinaria}', 24),
  ('emitir_certificados', 'Emitir certificados', '{veterinaria}', 25),
  ('hospitalizar', 'Hospitalizar y medicar', '{veterinaria}', 26);

-- ¿Puede hacer esto en Veterinaria? El permiso, o ser médico veterinario designado
-- (el médico tiene estos tres por serlo), y siempre con el módulo prendido.
create or replace function public.vet_puede(p_permiso text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.modulo_activo('veterinaria'), false)
    and (coalesce(public.tiene_permiso(p_permiso), false) or coalesce(public.es_medico_veterinario(), false));
$$;

-- ── 2. Ajustes de Veterinaria (uno por negocio) ──────────────────────
create table public.veterinaria_ajustes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  -- Recordatorios de próxima dosis (apagados por omisión: cada negocio decide).
  recordatorios_activos boolean not null default false,
  dias_anticipacion int not null default 7 check (dias_anticipacion between 0 and 60),
  -- Cuántos días vale un certificado de salud al emitirlo.
  certificado_vigencia_dias int not null default 30 check (certificado_vigencia_dias between 1 and 365),
  -- Una vacuna del carnet cuenta como el comprobante que pide el check-in.
  carnet_reemplaza_comprobante boolean not null default false,
  -- Precio de un día de hospitalización (vacío = no se cobra el día solo).
  hospitalizacion_precio_dia numeric(12,2) check (hospitalizacion_precio_dia is null or hospitalizacion_precio_dia >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index veterinaria_ajustes_negocio on public.veterinaria_ajustes (negocio_id) where deleted_at is null;
select public._vet_redes('veterinaria_ajustes', '(select public.is_staff())');

-- ── 3. Preferencias por mascota ──────────────────────────────────────
create table public.carnet_mascota (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  perro_id uuid not null references public.perros(id),
  recordatorios_apagados boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index carnet_mascota_perro on public.carnet_mascota (negocio_id, perro_id) where deleted_at is null;
select public._vet_redes('carnet_mascota', '(select public.is_staff())');

-- ── 4. Libros del carnet ─────────────────────────────────────────────
create table public.carnet_vacunas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  perro_id uuid not null references public.perros(id),
  biologico text not null check (btrim(biologico) <> ''),
  -- Si es de un requisito sanitario del negocio (antirrábica…), para el check-in.
  tipo_requisito_id uuid references public.tipos_requisito_sanitario(id),
  insumo_id uuid references public.insumos(id),
  lote_id uuid references public.insumo_lotes(id),
  lote_texto text,
  laboratorio text,
  dosis text,
  fecha_aplicacion date not null,
  proxima_dosis date,
  -- Hasta cuándo cuenta como vigente (la próxima dosis, o la vigencia del requisito, o 12 meses).
  vigente_hasta date not null,
  medico_id uuid not null references public.medicos_veterinarios(id),
  notas text,
  lote_movimiento_id uuid references public.movimientos_inventario(id),
  requisito_aplicado_id uuid references public.requisitos_sanitarios_aplicados(id),
  anulada_at timestamptz,
  anulada_por uuid references auth.users(id) on delete set null,
  anulada_motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (proxima_dosis is null or proxima_dosis > fecha_aplicacion),
  check ((anulada_at is null) = (anulada_motivo is null))
);
create index carnet_vacunas_perro_idx on public.carnet_vacunas (perro_id, fecha_aplicacion desc);
select public._vet_redes('carnet_vacunas', '(select public.is_staff())');

create table public.carnet_desparasitaciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  perro_id uuid not null references public.perros(id),
  tipo text not null default 'interna' check (tipo in ('interna', 'externa', 'ambas')),
  producto text not null check (btrim(producto) <> ''),
  insumo_id uuid references public.insumos(id),
  lote_id uuid references public.insumo_lotes(id),
  lote_texto text,
  dosis text,
  fecha_aplicacion date not null,
  proxima_dosis date,
  vigente_hasta date not null,
  medico_id uuid references public.medicos_veterinarios(id),
  notas text,
  lote_movimiento_id uuid references public.movimientos_inventario(id),
  anulada_at timestamptz,
  anulada_por uuid references auth.users(id) on delete set null,
  anulada_motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (proxima_dosis is null or proxima_dosis > fecha_aplicacion),
  check ((anulada_at is null) = (anulada_motivo is null))
);
create index carnet_desparasitaciones_perro_idx on public.carnet_desparasitaciones (perro_id, fecha_aplicacion desc);
select public._vet_redes('carnet_desparasitaciones', '(select public.is_staff())');

-- Un registro clínico no se edita ni se borra: solo se anula.
create or replace function public.vet_registro_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_libres text[] := array['anulada_at', 'anulada_por', 'anulada_motivo', 'requisito_aplicado_id', 'updated_at', 'estado', 'anulado_at', 'anulado_por', 'anulado_motivo'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Un registro clínico no se borra: se anula con un motivo.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - v_libres) is distinct from (to_jsonb(old) - v_libres) then
    raise exception 'Un registro clínico no se edita: se anula con un motivo y se captura de nuevo.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.vet_registro_inmutable() from public, anon, authenticated;
create trigger vet_registro_inmutable before update or delete on public.carnet_vacunas
  for each row execute function public.vet_registro_inmutable();
create trigger vet_registro_inmutable before update or delete on public.carnet_desparasitaciones
  for each row execute function public.vet_registro_inmutable();

-- ── 5. Recordatorios de próxima dosis ────────────────────────────────
create table public.carnet_recordatorios (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  perro_id uuid not null references public.perros(id),
  origen_tipo text not null check (origen_tipo in ('vacuna', 'desparasitacion')),
  origen_id uuid not null,
  detalle text not null,
  proxima_dosis date not null,
  -- pendiente: por mandar · enviado: salió por la API · manual: lo mandó una persona con wa.me
  -- omitido: la persona lo descartó · fallido: la API no lo aceptó (se reintenta una vez)
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'manual', 'omitido', 'fallido')),
  enviado_at timestamptz,
  intentos int not null default 0,
  error text,
  wa_message_id text,
  resuelto_por uuid references auth.users(id) on delete set null,
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (negocio_id, origen_tipo, origen_id, proxima_dosis)
);
create index carnet_recordatorios_estado_idx on public.carnet_recordatorios (negocio_id, estado, proxima_dosis);
select public._vet_redes('carnet_recordatorios', '(select public.is_staff())');

-- ── 6. Enlace verificable del carnet ─────────────────────────────────
create table public.carnet_enlaces (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  perro_id uuid not null references public.perros(id),
  -- Solo el sha256 del token; el token en claro se muestra una vez al generarlo.
  token_hash text not null unique,
  revocado_at timestamptz,
  revocado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index carnet_enlaces_uno_vigente on public.carnet_enlaces (perro_id) where revocado_at is null and deleted_at is null;
select public._vet_redes('carnet_enlaces', '(select public.is_staff())');
-- El hash del token no se lee por la API: el servidor lo consulta con la secret key.
revoke select on public.carnet_enlaces from authenticated;
grant select (id, negocio_id, perro_id, revocado_at, created_at) on public.carnet_enlaces to authenticated;

-- ── 7. Certificados de salud ─────────────────────────────────────────
create table public.certificados_salud (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  perro_id uuid not null references public.perros(id),
  cliente_id uuid not null references public.clientes(id),
  medico_id uuid not null references public.medicos_veterinarios(id),
  numero int not null,
  folio_medico text,
  motivo text not null default 'general' check (motivo in ('general', 'viaje', 'hospedaje', 'exposicion', 'otro')),
  destino text,
  exploracion text not null check (btrim(exploracion) <> ''),
  observaciones text,
  fecha_emision date not null default public.fecha_negocio(),
  vigente_hasta date not null,
  -- Todo lo que dice el certificado, tal como estaba al emitirlo.
  snapshot jsonb not null,
  estado text not null default 'vigente' check (estado in ('vigente', 'anulado')),
  anulado_at timestamptz,
  anulado_por uuid references auth.users(id) on delete set null,
  anulado_motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (vigente_hasta >= fecha_emision),
  check ((estado = 'anulado') = (anulado_at is not null))
);
create unique index certificados_salud_numero on public.certificados_salud (negocio_id, numero);
create index certificados_salud_perro_idx on public.certificados_salud (perro_id, fecha_emision desc);
select public._vet_redes('certificados_salud', '(select public.is_staff())');
create trigger vet_registro_inmutable before update or delete on public.certificados_salud
  for each row execute function public.vet_registro_inmutable();

-- ── 8. Funciones ─────────────────────────────────────────────────────

create or replace function public.veterinaria_ajustes_actuales()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not coalesce(public.is_staff(), false) then '{}'::jsonb else
    coalesce((
      select jsonb_build_object(
        'recordatorios_activos', a.recordatorios_activos, 'dias_anticipacion', a.dias_anticipacion,
        'certificado_vigencia_dias', a.certificado_vigencia_dias, 'carnet_reemplaza_comprobante', a.carnet_reemplaza_comprobante,
        'hospitalizacion_precio_dia', a.hospitalizacion_precio_dia)
      from public.veterinaria_ajustes a where a.negocio_id = public.negocio_actual() and a.deleted_at is null
    ), jsonb_build_object('recordatorios_activos', false, 'dias_anticipacion', 7, 'certificado_vigencia_dias', 30,
                          'carnet_reemplaza_comprobante', false, 'hospitalizacion_precio_dia', null))
  end;
$$;

create or replace function public.guardar_veterinaria_ajustes(
  p_recordatorios_activos boolean, p_dias_anticipacion int, p_certificado_vigencia_dias int,
  p_carnet_reemplaza_comprobante boolean, p_precio_dia numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.modulo_activo('veterinaria'), false) then
    raise exception 'Veterinaria está apagada en este negocio.';
  end if;
  if not coalesce(public.tiene_permiso('configuracion_negocio'), false) then
    raise exception 'Cambiar los ajustes de Veterinaria es de admin o de quien tenga «Configuración del negocio».' using errcode = '42501';
  end if;
  if p_dias_anticipacion is null or p_dias_anticipacion not between 0 and 60 then
    raise exception 'Los días de anticipación van de 0 a 60.';
  end if;
  if p_certificado_vigencia_dias is null or p_certificado_vigencia_dias not between 1 and 365 then
    raise exception 'La vigencia del certificado va de 1 a 365 días.';
  end if;
  if p_precio_dia is not null and p_precio_dia < 0 then
    raise exception 'El precio del día no puede ser negativo.';
  end if;
  if exists (select 1 from public.veterinaria_ajustes where negocio_id = public.negocio_actual() and deleted_at is null) then
    update public.veterinaria_ajustes
       set recordatorios_activos = coalesce(p_recordatorios_activos, false), dias_anticipacion = p_dias_anticipacion,
           certificado_vigencia_dias = p_certificado_vigencia_dias,
           carnet_reemplaza_comprobante = coalesce(p_carnet_reemplaza_comprobante, false), hospitalizacion_precio_dia = p_precio_dia
     where negocio_id = public.negocio_actual() and deleted_at is null;
  else
    insert into public.veterinaria_ajustes (recordatorios_activos, dias_anticipacion, certificado_vigencia_dias, carnet_reemplaza_comprobante, hospitalizacion_precio_dia)
    values (coalesce(p_recordatorios_activos, false), p_dias_anticipacion, p_certificado_vigencia_dias, coalesce(p_carnet_reemplaza_comprobante, false), p_precio_dia);
  end if;
end;
$$;

-- ¿Quién firma? Si quien llama es médico veterinario, él mismo; si no, el que escoja.
create or replace function public.vet_medico_firma(p_medico_id uuid, p_obligatorio boolean)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_medico_id;
begin
  if v_id is null then
    select m.id into v_id from public.medicos_veterinarios m
    where m.profile_id = auth.uid() and m.negocio_id = public.negocio_actual() and m.deleted_at is null;
  end if;
  if v_id is null then
    if p_obligatorio then
      raise exception 'Elige al médico veterinario que aplica o firma.';
    end if;
    return null;
  end if;
  if not exists (select 1 from public.medicos_veterinarios m where m.id = v_id and m.negocio_id = public.negocio_actual() and m.deleted_at is null) then
    raise exception 'Ese médico veterinario no existe.';
  end if;
  return v_id;
end;
$$;

-- El médico veterinario que es quien llama (para preseleccionarlo en los formularios).
create or replace function public.vet_mi_medico()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.medicos_veterinarios m
  where m.profile_id = auth.uid() and m.negocio_id = public.negocio_actual() and m.deleted_at is null
    and coalesce(public.modulo_activo('veterinaria'), false);
$$;

-- Descuenta una dosis (en la unidad de consumo) de un lote y deja el movimiento en el libro de lotes.
-- Interna: ya comprobó permisos quien la llama.
create or replace function public.vet_descontar_lote(p_lote_id uuid, p_cantidad_consumo numeric, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote record;
  v_equiv numeric;
  v_base numeric;
  v_saldo numeric;
  v_mov uuid;
begin
  select l.id, l.insumo_id, l.fecha_caducidad into v_lote from public.insumo_lotes l
  where l.id = p_lote_id and l.negocio_id = public.negocio_actual() and l.deleted_at is null;
  if v_lote.id is null then
    raise exception 'Ese lote no existe.';
  end if;
  select um.equivalencia_en_base into v_equiv from public.insumos i join public.unidades_medida um on um.id = i.unidad_consumo_id where i.id = v_lote.insumo_id;
  if v_equiv is null then
    raise exception 'El producto de ese lote no tiene unidad de consumo.';
  end if;
  v_base := p_cantidad_consumo * v_equiv;
  perform pg_advisory_xact_lock(hashtextextended(v_lote.insumo_id::text, 0));
  select s.saldo into v_saldo from public.insumo_lotes_saldo s where s.lote_id = p_lote_id;
  if v_base > coalesce(v_saldo, 0) then
    raise exception 'El lote no tiene suficiente existencia.';
  end if;
  perform set_config('app.lote_mov', '1', true);
  insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, motivo)
  values (v_lote.insumo_id, 'salida_consumo', v_base, nullif(btrim(coalesce(p_motivo, '')), ''))
  returning id into v_mov;
  perform set_config('app.lote_mov', '', true);
  insert into public.lotes_movimientos (lote_id, insumo_id, tipo, cantidad_base, motivo, movimiento_inventario_id)
  values (p_lote_id, v_lote.insumo_id, 'salida_surtido', v_base, nullif(btrim(coalesce(p_motivo, '')), ''), v_mov);
  return v_mov;
end;
$$;

create or replace function public.registrar_vacuna(
  p_perro_id uuid, p_biologico text, p_tipo_requisito_id uuid, p_insumo_id uuid, p_lote_id uuid, p_lote_texto text,
  p_laboratorio text, p_fecha date, p_proxima date, p_medico_id uuid, p_dosis text, p_notas text, p_descontar boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perro record;
  v_medico uuid;
  v_bio text := nullif(btrim(coalesce(p_biologico, '')), '');
  v_insumo uuid := p_insumo_id;
  v_lote_insumo uuid;
  v_lote_codigo text;
  v_lote_cad date;
  v_hoy date := public.fecha_negocio();
  v_vigencia_meses int := 12;
  v_hasta date;
  v_mov uuid;
  v_id uuid;
  v_req uuid;
  v_ajustes record;
  v_aviso text;
begin
  if not public.vet_puede('registrar_vacunas') then
    raise exception 'Registrar vacunas es de un médico veterinario, de admin o de quien tenga «Registrar vacunas y desparasitaciones».' using errcode = '42501';
  end if;
  select * into v_perro from public.perros p where p.id = p_perro_id and p.negocio_id = public.negocio_actual() and p.deleted_at is null;
  if not found then
    raise exception 'Esa mascota no existe.';
  end if;
  if p_fecha is null or p_fecha > v_hoy then
    raise exception 'La fecha de aplicación no puede ser futura.';
  end if;
  if p_fecha < date '1990-01-01' then
    raise exception 'La fecha de aplicación no es válida.';
  end if;
  if p_proxima is not null and p_proxima <= p_fecha then
    raise exception 'La próxima dosis tiene que ser después de la fecha de aplicación.';
  end if;
  v_medico := public.vet_medico_firma(p_medico_id, true);

  if p_lote_id is not null then
    select l.insumo_id, l.codigo, l.fecha_caducidad into v_lote_insumo, v_lote_codigo, v_lote_cad from public.insumo_lotes l
    where l.id = p_lote_id and l.negocio_id = public.negocio_actual() and l.deleted_at is null;
    if v_lote_insumo is null then
      raise exception 'Ese lote no existe.';
    end if;
    if v_insumo is not null and v_insumo <> v_lote_insumo then
      raise exception 'Ese lote es de otro producto.';
    end if;
    v_insumo := v_lote_insumo;
    if v_lote_cad is not null and v_lote_cad < p_fecha then
      raise exception 'Ese lote ya estaba caducado el día de la aplicación.';
    end if;
  end if;
  if v_insumo is not null then
    if not exists (select 1 from public.insumos i where i.id = v_insumo and i.negocio_id = public.negocio_actual() and i.deleted_at is null) then
      raise exception 'Ese producto no existe.';
    end if;
    if v_bio is null then
      select i.nombre into v_bio from public.insumos i where i.id = v_insumo;
    end if;
  end if;
  if v_bio is null then
    raise exception 'Escribe qué vacuna se aplicó.';
  end if;

  if p_tipo_requisito_id is not null then
    select t.vigencia_meses into v_vigencia_meses from public.tipos_requisito_sanitario t
    where t.id = p_tipo_requisito_id and t.negocio_id = public.negocio_actual() and t.deleted_at is null;
    if not found then
      raise exception 'Ese requisito sanitario no existe.';
    end if;
    v_vigencia_meses := coalesce(v_vigencia_meses, 12);
  end if;
  v_hasta := coalesce(p_proxima, (p_fecha + make_interval(months => v_vigencia_meses))::date);

  if p_lote_id is not null and coalesce(p_descontar, true) then
    v_mov := public.vet_descontar_lote(p_lote_id, 1, 'Vacuna aplicada a ' || v_perro.nombre);
  end if;

  insert into public.carnet_vacunas (perro_id, biologico, tipo_requisito_id, insumo_id, lote_id, lote_texto, laboratorio, dosis,
                                     fecha_aplicacion, proxima_dosis, vigente_hasta, medico_id, notas, lote_movimiento_id)
  values (p_perro_id, v_bio, p_tipo_requisito_id, v_insumo, p_lote_id,
          coalesce(nullif(btrim(coalesce(p_lote_texto, '')), ''), v_lote_codigo), nullif(btrim(coalesce(p_laboratorio, '')), ''),
          nullif(btrim(coalesce(p_dosis, '')), ''), p_fecha, p_proxima, v_hasta, v_medico, nullif(btrim(coalesce(p_notas, '')), ''), v_mov)
  returning id into v_id;

  -- «El carnet reemplaza al comprobante»: la vacuna del carnet cubre el requisito del check-in.
  select a.carnet_reemplaza_comprobante into v_ajustes from public.veterinaria_ajustes a
  where a.negocio_id = public.negocio_actual() and a.deleted_at is null;
  if p_tipo_requisito_id is not null and coalesce(v_ajustes.carnet_reemplaza_comprobante, false) then
    insert into public.requisitos_sanitarios_aplicados (perro_id, tipo_requisito_id, fecha_aplicacion, detalle, notas)
    values (p_perro_id, p_tipo_requisito_id, p_fecha, 'Carnet: ' || v_bio || coalesce(' · lote ' || nullif(btrim(coalesce(p_lote_texto, v_lote_codigo, '')), ''), ''), 'Registrada en el carnet de la mascota')
    returning id into v_req;
    update public.carnet_vacunas set requisito_aplicado_id = v_req where id = v_id;
  end if;

  if p_lote_id is null and v_insumo is not null then
    v_aviso := 'Sin lote: no se descontó nada del inventario.';
  end if;
  return jsonb_build_object('id', v_id, 'vigente_hasta', v_hasta, 'requisito_aplicado_id', v_req, 'aviso', v_aviso);
end;
$$;

create or replace function public.registrar_desparasitacion(
  p_perro_id uuid, p_tipo text, p_producto text, p_insumo_id uuid, p_lote_id uuid, p_lote_texto text, p_dosis text,
  p_fecha date, p_proxima date, p_medico_id uuid, p_notas text, p_descontar boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perro record;
  v_medico uuid;
  v_prod text := nullif(btrim(coalesce(p_producto, '')), '');
  v_insumo uuid := p_insumo_id;
  v_lote_insumo uuid;
  v_lote_codigo text;
  v_lote_cad date;
  v_hoy date := public.fecha_negocio();
  v_hasta date;
  v_mov uuid;
  v_id uuid;
begin
  if not public.vet_puede('registrar_vacunas') then
    raise exception 'Registrar desparasitaciones es de un médico veterinario, de admin o de quien tenga «Registrar vacunas y desparasitaciones».' using errcode = '42501';
  end if;
  select * into v_perro from public.perros p where p.id = p_perro_id and p.negocio_id = public.negocio_actual() and p.deleted_at is null;
  if not found then
    raise exception 'Esa mascota no existe.';
  end if;
  if p_tipo not in ('interna', 'externa', 'ambas') then
    raise exception 'El tipo de desparasitación es interna, externa o ambas.';
  end if;
  if p_fecha is null or p_fecha > v_hoy then
    raise exception 'La fecha de aplicación no puede ser futura.';
  end if;
  if p_fecha < date '1990-01-01' then
    raise exception 'La fecha de aplicación no es válida.';
  end if;
  if p_proxima is not null and p_proxima <= p_fecha then
    raise exception 'La próxima dosis tiene que ser después de la fecha de aplicación.';
  end if;
  v_medico := public.vet_medico_firma(p_medico_id, false);

  if p_lote_id is not null then
    select l.insumo_id, l.codigo, l.fecha_caducidad into v_lote_insumo, v_lote_codigo, v_lote_cad from public.insumo_lotes l
    where l.id = p_lote_id and l.negocio_id = public.negocio_actual() and l.deleted_at is null;
    if v_lote_insumo is null then
      raise exception 'Ese lote no existe.';
    end if;
    if v_insumo is not null and v_insumo <> v_lote_insumo then
      raise exception 'Ese lote es de otro producto.';
    end if;
    v_insumo := v_lote_insumo;
    if v_lote_cad is not null and v_lote_cad < p_fecha then
      raise exception 'Ese lote ya estaba caducado el día de la aplicación.';
    end if;
  end if;
  if v_insumo is not null then
    if not exists (select 1 from public.insumos i where i.id = v_insumo and i.negocio_id = public.negocio_actual() and i.deleted_at is null) then
      raise exception 'Ese producto no existe.';
    end if;
    if v_prod is null then
      select i.nombre into v_prod from public.insumos i where i.id = v_insumo;
    end if;
  end if;
  if v_prod is null then
    raise exception 'Escribe qué producto se aplicó.';
  end if;
  v_hasta := coalesce(p_proxima, (p_fecha + interval '3 months')::date);

  if p_lote_id is not null and coalesce(p_descontar, true) then
    v_mov := public.vet_descontar_lote(p_lote_id, 1, 'Desparasitación aplicada a ' || v_perro.nombre);
  end if;

  insert into public.carnet_desparasitaciones (perro_id, tipo, producto, insumo_id, lote_id, lote_texto, dosis, fecha_aplicacion,
                                               proxima_dosis, vigente_hasta, medico_id, notas, lote_movimiento_id)
  values (p_perro_id, p_tipo, v_prod, v_insumo, p_lote_id, coalesce(nullif(btrim(coalesce(p_lote_texto, '')), ''), v_lote_codigo),
          nullif(btrim(coalesce(p_dosis, '')), ''), p_fecha, p_proxima, v_hasta, v_medico, nullif(btrim(coalesce(p_notas, '')), ''), v_mov)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'vigente_hasta', v_hasta);
end;
$$;

-- Anula una vacuna o una desparasitación (con motivo). Si había creado la aplicación de un
-- requisito sanitario, también la da de baja. Lo que se descontó del lote NO regresa solo:
-- se corrige en el inventario clínico, que es donde queda la historia.
create or replace function public.anular_registro_carnet(p_tipo text, p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not public.vet_puede('registrar_vacunas') then
    raise exception 'Anular un registro del carnet es de un médico veterinario, de admin o de quien tenga «Registrar vacunas y desparasitaciones».' using errcode = '42501';
  end if;
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'Escribe el motivo de la anulación.';
  end if;
  if p_tipo = 'vacuna' then
    update public.carnet_vacunas set anulada_at = now(), anulada_por = auth.uid(), anulada_motivo = v_motivo
    where id = p_id and negocio_id = public.negocio_actual() and anulada_at is null and deleted_at is null
    returning requisito_aplicado_id into v_req;
    if not found then
      raise exception 'Esa vacuna no existe o ya estaba anulada.';
    end if;
    if v_req is not null then
      update public.requisitos_sanitarios_aplicados set deleted_at = now() where id = v_req and deleted_at is null;
    end if;
  elsif p_tipo = 'desparasitacion' then
    update public.carnet_desparasitaciones set anulada_at = now(), anulada_por = auth.uid(), anulada_motivo = v_motivo
    where id = p_id and negocio_id = public.negocio_actual() and anulada_at is null and deleted_at is null;
    if not found then
      raise exception 'Esa desparasitación no existe o ya estaba anulada.';
    end if;
  else
    raise exception 'Tipo de registro inválido.';
  end if;
  -- Sus recordatorios pendientes ya no tienen sentido.
  update public.carnet_recordatorios set estado = 'omitido', nota = 'El registro se anuló', resuelto_por = auth.uid()
  where origen_id = p_id and estado in ('pendiente', 'fallido') and negocio_id = public.negocio_actual();
end;
$$;

-- El carnet completo de una mascota (para personal). Los registros anulados se ven aparte.
create or replace function public.carnet_de_mascota(p_perro_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := public.fecha_negocio();
  v_ok boolean;
begin
  if not coalesce(public.is_staff(), false) or not coalesce(public.modulo_activo('veterinaria'), false) then
    raise exception 'Solo el personal del negocio con Veterinaria prendida.' using errcode = '42501';
  end if;
  select exists (select 1 from public.perros p where p.id = p_perro_id and p.negocio_id = public.negocio_actual() and p.deleted_at is null) into v_ok;
  if not v_ok then
    raise exception 'Esa mascota no existe.';
  end if;
  return jsonb_build_object(
    'vacunas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'biologico', v.biologico, 'laboratorio', v.laboratorio, 'lote', coalesce(v.lote_texto, l.codigo), 'dosis', v.dosis,
        'fecha_aplicacion', v.fecha_aplicacion, 'proxima_dosis', v.proxima_dosis, 'vigente_hasta', v.vigente_hasta,
        'estado', case when v.anulada_at is not null then 'anulada' when v.vigente_hasta < v_hoy then 'vencida'
                       when v.vigente_hasta < v_hoy + 30 then 'por_vencer' else 'vigente' end,
        'medico', pm.nombre_completo, 'cedula', mv.cedula_profesional, 'notas', v.notas,
        'anulada_motivo', v.anulada_motivo, 'anulada_at', v.anulada_at, 'cubre_requisito', v.requisito_aplicado_id is not null
      ) order by v.fecha_aplicacion desc, v.created_at desc)
      from public.carnet_vacunas v
      left join public.insumo_lotes l on l.id = v.lote_id
      left join public.medicos_veterinarios mv on mv.id = v.medico_id
      left join public.profiles pm on pm.id = mv.profile_id
      where v.perro_id = p_perro_id and v.negocio_id = public.negocio_actual() and v.deleted_at is null
    ), '[]'::jsonb),
    'desparasitaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'tipo', d.tipo, 'producto', d.producto, 'lote', coalesce(d.lote_texto, l.codigo), 'dosis', d.dosis,
        'fecha_aplicacion', d.fecha_aplicacion, 'proxima_dosis', d.proxima_dosis, 'vigente_hasta', d.vigente_hasta,
        'estado', case when d.anulada_at is not null then 'anulada' when d.vigente_hasta < v_hoy then 'vencida'
                       when d.vigente_hasta < v_hoy + 15 then 'por_vencer' else 'vigente' end,
        'medico', pm.nombre_completo, 'notas', d.notas, 'anulada_motivo', d.anulada_motivo, 'anulada_at', d.anulada_at
      ) order by d.fecha_aplicacion desc, d.created_at desc)
      from public.carnet_desparasitaciones d
      left join public.insumo_lotes l on l.id = d.lote_id
      left join public.medicos_veterinarios mv on mv.id = d.medico_id
      left join public.profiles pm on pm.id = mv.profile_id
      where d.perro_id = p_perro_id and d.negocio_id = public.negocio_actual() and d.deleted_at is null
    ), '[]'::jsonb),
    'recordatorios_apagados', coalesce((select c.recordatorios_apagados from public.carnet_mascota c
                                        where c.perro_id = p_perro_id and c.negocio_id = public.negocio_actual() and c.deleted_at is null), false)
  );
end;
$$;

-- Lo que ve el dueño en su portal: solo lo vigente o lo ya aplicado, sin notas, sin anuladas.
create or replace function public.mi_carnet(p_perro_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := public.fecha_negocio();
  v_cliente uuid := public.mi_cliente_id();
begin
  if v_cliente is null or not coalesce(public.modulo_activo('veterinaria'), false) then
    return null;
  end if;
  if not exists (
    select 1 from public.perros p
    where p.id = p_perro_id and p.negocio_id = public.negocio_actual() and p.deleted_at is null
      and (p.cliente_id = v_cliente or exists (
        select 1 from public.perro_accesos_compartidos pac
        where pac.perro_id = p.id and pac.cliente_id = v_cliente and pac.deleted_at is null))
  ) then
    return null;
  end if;
  return jsonb_build_object(
    'vacunas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'biologico', v.biologico, 'fecha_aplicacion', v.fecha_aplicacion, 'proxima_dosis', v.proxima_dosis, 'vigente_hasta', v.vigente_hasta,
        'estado', case when v.vigente_hasta < v_hoy then 'vencida' when v.vigente_hasta < v_hoy + 30 then 'por_vencer' else 'vigente' end
      ) order by v.fecha_aplicacion desc)
      from public.carnet_vacunas v
      where v.perro_id = p_perro_id and v.negocio_id = public.negocio_actual() and v.deleted_at is null and v.anulada_at is null
    ), '[]'::jsonb),
    'desparasitaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tipo', d.tipo, 'producto', d.producto, 'fecha_aplicacion', d.fecha_aplicacion, 'proxima_dosis', d.proxima_dosis, 'vigente_hasta', d.vigente_hasta,
        'estado', case when d.vigente_hasta < v_hoy then 'vencida' when d.vigente_hasta < v_hoy + 15 then 'por_vencer' else 'vigente' end
      ) order by d.fecha_aplicacion desc)
      from public.carnet_desparasitaciones d
      where d.perro_id = p_perro_id and d.negocio_id = public.negocio_actual() and d.deleted_at is null and d.anulada_at is null
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.carnet_recordatorios_mascota(p_perro_id uuid, p_apagados boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vet_puede('registrar_vacunas') then
    raise exception 'Cambiar los recordatorios de una mascota es de un médico veterinario, de admin o de quien tenga «Registrar vacunas y desparasitaciones».' using errcode = '42501';
  end if;
  if not exists (select 1 from public.perros p where p.id = p_perro_id and p.negocio_id = public.negocio_actual() and p.deleted_at is null) then
    raise exception 'Esa mascota no existe.';
  end if;
  insert into public.carnet_mascota (perro_id, recordatorios_apagados) values (p_perro_id, coalesce(p_apagados, false))
  on conflict (negocio_id, perro_id) where deleted_at is null do update set recordatorios_apagados = excluded.recordatorios_apagados;
  if coalesce(p_apagados, false) then
    update public.carnet_recordatorios set estado = 'omitido', nota = 'Recordatorios apagados para esta mascota', resuelto_por = auth.uid()
    where perro_id = p_perro_id and estado in ('pendiente', 'fallido') and negocio_id = public.negocio_actual();
  end if;
end;
$$;

-- ── 9. Recordatorios: generar, listar, marcar y enviar ───────────────

-- Agrega a la cola las dosis que ya caen dentro de la anticipación (o vencieron hace poco).
-- Idempotente: la unicidad impide repetir. Una dosis ya renovada (hay una aplicación más
-- nueva del mismo producto) no se recuerda.
create or replace function public.carnet_generar_recordatorios()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy date := public.fecha_negocio();
  v_dias int;
  v_n int := 0;
  v_k int;
begin
  if not coalesce(public.modulo_activo('veterinaria'), false) then
    return 0;
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal del negocio.' using errcode = '42501';
  end if;
  select a.dias_anticipacion into v_dias from public.veterinaria_ajustes a where a.negocio_id = public.negocio_actual() and a.deleted_at is null;
  v_dias := coalesce(v_dias, 7);

  insert into public.carnet_recordatorios (perro_id, origen_tipo, origen_id, detalle, proxima_dosis)
  select v.perro_id, 'vacuna', v.id, v.biologico, v.proxima_dosis
  from public.carnet_vacunas v
  join public.perros p on p.id = v.perro_id and p.deleted_at is null and not p.fallecido
  where v.negocio_id = public.negocio_actual() and v.deleted_at is null and v.anulada_at is null
    and v.proxima_dosis is not null and v.proxima_dosis between v_hoy - 30 and v_hoy + v_dias
    and not exists (select 1 from public.carnet_mascota c where c.perro_id = v.perro_id and c.negocio_id = v.negocio_id and c.deleted_at is null and c.recordatorios_apagados)
    and not exists (select 1 from public.carnet_vacunas n where n.perro_id = v.perro_id and n.negocio_id = v.negocio_id and n.deleted_at is null and n.anulada_at is null
                      and lower(n.biologico) = lower(v.biologico) and n.fecha_aplicacion > v.fecha_aplicacion)
  on conflict (negocio_id, origen_tipo, origen_id, proxima_dosis) do nothing;
  get diagnostics v_k = row_count;
  v_n := v_n + v_k;

  insert into public.carnet_recordatorios (perro_id, origen_tipo, origen_id, detalle, proxima_dosis)
  select d.perro_id, 'desparasitacion', d.id, d.producto, d.proxima_dosis
  from public.carnet_desparasitaciones d
  join public.perros p on p.id = d.perro_id and p.deleted_at is null and not p.fallecido
  where d.negocio_id = public.negocio_actual() and d.deleted_at is null and d.anulada_at is null
    and d.proxima_dosis is not null and d.proxima_dosis between v_hoy - 30 and v_hoy + v_dias
    and not exists (select 1 from public.carnet_mascota c where c.perro_id = d.perro_id and c.negocio_id = d.negocio_id and c.deleted_at is null and c.recordatorios_apagados)
    and not exists (select 1 from public.carnet_desparasitaciones n where n.perro_id = d.perro_id and n.negocio_id = d.negocio_id and n.deleted_at is null and n.anulada_at is null
                      and lower(n.producto) = lower(d.producto) and n.fecha_aplicacion > d.fecha_aplicacion)
  on conflict (negocio_id, origen_tipo, origen_id, proxima_dosis) do nothing;
  get diagnostics v_k = row_count;
  v_n := v_n + v_k;
  return v_n;
end;
$$;

-- La lista para el personal (con el WhatsApp del dueño para mandarlo a mano).
create or replace function public.carnet_recordatorios_lista()
returns table (
  id uuid, perro_id uuid, perro_nombre text, cliente_nombre text, cliente_telefono text,
  origen_tipo text, detalle text, proxima_dosis date, dias int, estado text, enviado_at timestamptz, error text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_staff(), false) or not coalesce(public.modulo_activo('veterinaria'), false) then
    raise exception 'Solo el personal del negocio con Veterinaria prendida.' using errcode = '42501';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is not null and not public.vet_puede('registrar_vacunas') then
    -- Quien solo mira la lista sin registrar vacunas no necesita el teléfono del dueño.
    return;
  end if;
  if public.negocio_escribible() then
    perform public.carnet_generar_recordatorios();
  end if;
  return query
  select r.id, r.perro_id, p.nombre, c.nombre, c.telefono, r.origen_tipo, r.detalle, r.proxima_dosis,
         (r.proxima_dosis - public.fecha_negocio())::int, r.estado, r.enviado_at, r.error
  from public.carnet_recordatorios r
  join public.perros p on p.id = r.perro_id
  join public.clientes c on c.id = p.cliente_id
  where r.negocio_id = public.negocio_actual() and r.deleted_at is null
    and (r.estado in ('pendiente', 'fallido') or r.resuelto_por is not null or r.enviado_at > now() - interval '14 days')
  order by (r.estado in ('pendiente', 'fallido')) desc, r.proxima_dosis, p.nombre;
end;
$$;

create or replace function public.carnet_recordatorio_marcar(p_id uuid, p_estado text, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vet_puede('registrar_vacunas') then
    raise exception 'Resolver un recordatorio es de un médico veterinario, de admin o de quien tenga «Registrar vacunas y desparasitaciones».' using errcode = '42501';
  end if;
  if p_estado not in ('manual', 'omitido') then
    raise exception 'Un recordatorio se marca como mandado a mano o como omitido.';
  end if;
  update public.carnet_recordatorios
     set estado = p_estado, enviado_at = case when p_estado = 'manual' then now() else enviado_at end,
         resuelto_por = auth.uid(), nota = nullif(btrim(coalesce(p_nota, '')), '')
   where id = p_id and negocio_id = public.negocio_actual() and estado in ('pendiente', 'fallido') and deleted_at is null;
  if not found then
    raise exception 'Ese recordatorio no existe o ya se resolvió.';
  end if;
end;
$$;

-- Para la tarea de envío (SOLO el servidor): lo pendiente de un negocio con los recordatorios
-- automáticos prendidos, ya con el teléfono, y apartado para que dos corridas no lo manden dos veces.
create or replace function public.carnet_recordatorios_para_enviar(p_limite int default 50)
returns table (
  id uuid, perro_nombre text, cliente_nombre text, cliente_telefono text, negocio_nombre text,
  origen_tipo text, detalle text, proxima_dosis date, intentos int
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  if not coalesce(public.modulo_activo('veterinaria'), false)
     or not exists (select 1 from public.veterinaria_ajustes a where a.negocio_id = public.negocio_actual() and a.deleted_at is null and a.recordatorios_activos) then
    return;
  end if;
  perform public.carnet_generar_recordatorios();
  return query
  with tomados as (
    select r.id from public.carnet_recordatorios r
    where r.negocio_id = public.negocio_actual() and r.deleted_at is null
      and ((r.estado = 'pendiente' and r.intentos = 0) or (r.estado = 'fallido' and r.intentos < 2 and r.updated_at < now() - interval '30 minutes'))
      and r.proxima_dosis between public.fecha_negocio() - 30 and public.fecha_negocio() + 60
    order by r.proxima_dosis
    limit greatest(1, least(coalesce(p_limite, 50), 200))
    for update skip locked
  ), marcados as (
    update public.carnet_recordatorios r set intentos = r.intentos + 1, estado = 'pendiente'
    from tomados t where t.id = r.id
    returning r.*
  )
  select m.id, p.nombre, c.nombre, c.telefono, n.nombre, m.origen_tipo, m.detalle, m.proxima_dosis, m.intentos
  from marcados m
  join public.perros p on p.id = m.perro_id
  join public.clientes c on c.id = p.cliente_id and c.deleted_at is null
  join public.negocios n on n.id = m.negocio_id
  order by m.proxima_dosis;
end;
$$;

create or replace function public.carnet_recordatorio_resultado(p_id uuid, p_ok boolean, p_error text, p_wa_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  update public.carnet_recordatorios
     set estado = case when p_ok then 'enviado' else 'fallido' end,
         enviado_at = case when p_ok then now() else enviado_at end,
         error = case when p_ok then null else left(coalesce(p_error, 'La API no lo aceptó'), 300) end,
         wa_message_id = coalesce(p_wa_id, wa_message_id)
   where id = p_id and negocio_id = public.negocio_actual();
end;
$$;

-- Negocios con Veterinaria y recordatorios prendidos (para que la tarea los recorra).
create or replace function public.carnet_negocios_con_recordatorios()
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
  select a.negocio_id from public.veterinaria_ajustes a
  join public.negocios n on n.id = a.negocio_id and n.deleted_at is null and n.activo
  join public.negocio_modulos nm on nm.negocio_id = a.negocio_id and nm.modulo = 'veterinaria' and nm.activo
  where a.deleted_at is null and a.recordatorios_activos;
end;
$$;

-- ── 10. Carnet verificable (enlace público) ──────────────────────────

-- El servidor genera el token; aquí solo se guarda su hash. Un enlace vigente por mascota.
create or replace function public.carnet_registrar_enlace(p_perro_id uuid, p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.vet_puede('registrar_vacunas') then
    raise exception 'Generar el enlace del carnet es de un médico veterinario, de admin o de quien tenga «Registrar vacunas y desparasitaciones».' using errcode = '42501';
  end if;
  if not exists (select 1 from public.perros p where p.id = p_perro_id and p.negocio_id = public.negocio_actual() and p.deleted_at is null) then
    raise exception 'Esa mascota no existe.';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Token inválido.';
  end if;
  update public.carnet_enlaces set revocado_at = now(), revocado_por = auth.uid()
  where perro_id = p_perro_id and negocio_id = public.negocio_actual() and revocado_at is null and deleted_at is null;
  insert into public.carnet_enlaces (perro_id, token_hash) values (p_perro_id, p_token_hash) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.carnet_revocar_enlace(p_perro_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vet_puede('registrar_vacunas') then
    raise exception 'Revocar el enlace del carnet es de un médico veterinario, de admin o de quien tenga «Registrar vacunas y desparasitaciones».' using errcode = '42501';
  end if;
  update public.carnet_enlaces set revocado_at = now(), revocado_por = auth.uid()
  where perro_id = p_perro_id and negocio_id = public.negocio_actual() and revocado_at is null and deleted_at is null;
end;
$$;

-- Lo que enseña el enlace público (SOLO el servidor, con el hash del token): la mascota, el
-- nombre del dueño, el negocio emisor y las vacunas vigentes. Nada de dinero ni de datos clínicos.
create or replace function public.carnet_publico(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e record;
  v_hoy date := public.fecha_negocio();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  select e.perro_id, e.negocio_id into v_e from public.carnet_enlaces e
  where e.token_hash = p_token_hash and e.negocio_id = public.negocio_actual() and e.revocado_at is null and e.deleted_at is null;
  if v_e.perro_id is null or not coalesce(public.modulo_activo('veterinaria'), false) then
    return null;
  end if;
  return (
    select jsonb_build_object(
      'mascota', p.nombre,
      'especie', p.especie,
      'dueno', c.nombre,
      'negocio', n.nombre,
      'consultado', v_hoy,
      'vacunas', coalesce((
        select jsonb_agg(jsonb_build_object('biologico', v.biologico, 'fecha_aplicacion', v.fecha_aplicacion, 'vigente_hasta', v.vigente_hasta)
                         order by v.vigente_hasta desc)
        from public.carnet_vacunas v
        where v.perro_id = p.id and v.negocio_id = p.negocio_id and v.deleted_at is null and v.anulada_at is null and v.vigente_hasta >= v_hoy
      ), '[]'::jsonb)
    )
    from public.perros p
    join public.clientes c on c.id = p.cliente_id
    join public.negocios n on n.id = p.negocio_id
    where p.id = v_e.perro_id and p.deleted_at is null
  );
end;
$$;

-- ── 11. Certificado de salud ─────────────────────────────────────────

create or replace function public.emitir_certificado(
  p_perro_id uuid, p_medico_id uuid, p_motivo text, p_destino text, p_exploracion text, p_observaciones text, p_dias_vigencia int default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perro record;
  v_cliente record;
  v_medico record;
  v_negocio record;
  v_est record;
  v_ajustes record;
  v_hoy date := public.fecha_negocio();
  v_dias int;
  v_num int;
  v_folio text;
  v_id uuid := gen_random_uuid();
  v_snapshot jsonb;
  v_es_el_medico boolean;
begin
  if not public.vet_puede('emitir_certificados') then
    raise exception 'Emitir certificados es de un médico veterinario, de admin o de quien tenga «Emitir certificados».' using errcode = '42501';
  end if;
  select p.*, rz.nombre as raza_nombre, ps.peso_kg into v_perro
  from public.perros p
  left join public.razas rz on rz.id = p.raza_id
  left join lateral (select x.peso_kg from public.pesos_registrados x where x.perro_id = p.id and x.deleted_at is null order by x.fecha desc, x.created_at desc limit 1) ps on true
  where p.id = p_perro_id and p.negocio_id = public.negocio_actual() and p.deleted_at is null;
  if v_perro.id is null then
    raise exception 'Esa mascota no existe.';
  end if;
  if v_perro.fallecido then
    raise exception 'Esa mascota está marcada como fallecida.';
  end if;
  if btrim(coalesce(p_exploracion, '')) = '' then
    raise exception 'Escribe lo que encontraste en la exploración.';
  end if;
  if p_motivo not in ('general', 'viaje', 'hospedaje', 'exposicion', 'otro') then
    raise exception 'Motivo inválido.';
  end if;
  select c.id, c.nombre into v_cliente from public.clientes c where c.id = v_perro.cliente_id;
  select m.id, m.cedula_profesional, m.cpa_sitpv, m.profile_id, pr.nombre_completo as nombre
    into v_medico
    from public.medicos_veterinarios m join public.profiles pr on pr.id = m.profile_id
   where m.id = public.vet_medico_firma(p_medico_id, true);
  select n.nombre, n.ciudad into v_negocio from public.negocios n where n.id = public.negocio_actual();
  select e.aviso_funcionamiento_senasica, e.aviso_funcionamiento_fecha, e.mvra_nombre, e.mvra_cedula into v_est
    from public.negocio_establecimiento e where e.negocio_id = public.negocio_actual() and e.deleted_at is null;
  select a.certificado_vigencia_dias into v_ajustes from public.veterinaria_ajustes a where a.negocio_id = public.negocio_actual() and a.deleted_at is null;
  v_dias := coalesce(p_dias_vigencia, v_ajustes.certificado_vigencia_dias, 30);
  if v_dias not between 1 and 365 then
    raise exception 'La vigencia va de 1 a 365 días.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('certificado:' || public.negocio_actual()::text, 0));
  select coalesce(max(numero), 0) + 1 into v_num from public.certificados_salud where negocio_id = public.negocio_actual();

  -- Si quien emite es el propio médico y tiene folios, el certificado lleva uno de los suyos.
  v_es_el_medico := exists (select 1 from public.medicos_veterinarios m where m.id = v_medico.id and m.profile_id = auth.uid());
  if v_es_el_medico and exists (select 1 from public.medico_folios_resumen r where r.medico_id = v_medico.id and r.disponibles > 0) then
    v_folio := public.usar_folio_medico('certificado', v_id);
  end if;

  v_snapshot := jsonb_build_object(
    'establecimiento', jsonb_build_object('nombre', v_negocio.nombre, 'ciudad', v_negocio.ciudad,
                         'aviso_funcionamiento', v_est.aviso_funcionamiento_senasica, 'aviso_fecha', v_est.aviso_funcionamiento_fecha,
                         'mvra', v_est.mvra_nombre, 'mvra_cedula', v_est.mvra_cedula),
    'medico', jsonb_build_object('nombre', v_medico.nombre, 'cedula', v_medico.cedula_profesional, 'cpa', v_medico.cpa_sitpv),
    'mascota', jsonb_build_object('nombre', v_perro.nombre, 'especie', v_perro.especie, 'raza', coalesce(v_perro.raza_nombre, v_perro.raza),
                         'sexo', v_perro.sexo, 'esterilizado', v_perro.esterilizado, 'fecha_nacimiento', v_perro.fecha_nacimiento,
                         'microchip', v_perro.microchip, 'peso_kg', v_perro.peso_kg),
    'propietario', jsonb_build_object('nombre', v_cliente.nombre),
    'vacunas', coalesce((
      select jsonb_agg(jsonb_build_object('biologico', v.biologico, 'fecha_aplicacion', v.fecha_aplicacion, 'vigente_hasta', v.vigente_hasta,
                                          'lote', v.lote_texto) order by v.fecha_aplicacion desc)
      from public.carnet_vacunas v
      where v.perro_id = p_perro_id and v.negocio_id = public.negocio_actual() and v.deleted_at is null and v.anulada_at is null and v.vigente_hasta >= v_hoy
    ), '[]'::jsonb),
    'desparasitaciones', coalesce((
      select jsonb_agg(jsonb_build_object('producto', d.producto, 'tipo', d.tipo, 'fecha_aplicacion', d.fecha_aplicacion, 'vigente_hasta', d.vigente_hasta)
                       order by d.fecha_aplicacion desc)
      from public.carnet_desparasitaciones d
      where d.perro_id = p_perro_id and d.negocio_id = public.negocio_actual() and d.deleted_at is null and d.anulada_at is null and d.vigente_hasta >= v_hoy
    ), '[]'::jsonb)
  );

  insert into public.certificados_salud (id, perro_id, cliente_id, medico_id, numero, folio_medico, motivo, destino, exploracion,
                                         observaciones, fecha_emision, vigente_hasta, snapshot)
  values (v_id, p_perro_id, v_cliente.id, v_medico.id, v_num, v_folio, p_motivo, nullif(btrim(coalesce(p_destino, '')), ''),
          btrim(p_exploracion), nullif(btrim(coalesce(p_observaciones, '')), ''), v_hoy, v_hoy + v_dias, v_snapshot);
  return jsonb_build_object('id', v_id, 'numero', v_num, 'folio_medico', v_folio, 'vigente_hasta', v_hoy + v_dias);
end;
$$;

create or replace function public.anular_certificado(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vet_puede('emitir_certificados') then
    raise exception 'Anular un certificado es de un médico veterinario, de admin o de quien tenga «Emitir certificados».' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo de la anulación.';
  end if;
  update public.certificados_salud
     set estado = 'anulado', anulado_at = now(), anulado_por = auth.uid(), anulado_motivo = btrim(p_motivo)
   where id = p_id and negocio_id = public.negocio_actual() and estado = 'vigente' and deleted_at is null;
  if not found then
    raise exception 'Ese certificado no existe o ya estaba anulado.';
  end if;
end;
$$;

-- ── 12. Dueños, propietarios y grants ────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'vet_puede(text)', 'veterinaria_ajustes_actuales()', 'guardar_veterinaria_ajustes(boolean,int,int,boolean,numeric)',
    'vet_medico_firma(uuid,boolean)', 'vet_descontar_lote(uuid,numeric,text)', 'vet_mi_medico()',
    'registrar_vacuna(uuid,text,uuid,uuid,uuid,text,text,date,date,uuid,text,text,boolean)',
    'registrar_desparasitacion(uuid,text,text,uuid,uuid,text,text,date,date,uuid,text,boolean)',
    'anular_registro_carnet(text,uuid,text)', 'carnet_de_mascota(uuid)', 'mi_carnet(uuid)',
    'carnet_recordatorios_mascota(uuid,boolean)', 'carnet_generar_recordatorios()', 'carnet_recordatorios_lista()',
    'carnet_recordatorio_marcar(uuid,text,text)', 'carnet_recordatorios_para_enviar(int)',
    'carnet_recordatorio_resultado(uuid,boolean,text,text)', 'carnet_negocios_con_recordatorios()',
    'carnet_registrar_enlace(uuid,text)', 'carnet_revocar_enlace(uuid)', 'carnet_publico(text)',
    'emitir_certificado(uuid,uuid,text,text,text,text,int)', 'anular_certificado(uuid,text)'
  ] loop
    execute format('alter function public.%s owner to peludesk_definer', f);
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  -- Internas: solo las llaman otras funciones (ya con sus permisos comprobados).
  foreach f in array array['vet_medico_firma(uuid,boolean)', 'vet_descontar_lote(uuid,numeric,text)'] loop
    execute format('revoke execute on function public.%s from authenticated', f);
  end loop;
  -- Solo el servidor.
  foreach f in array array['carnet_recordatorios_para_enviar(int)', 'carnet_recordatorio_resultado(uuid,boolean,text,text)',
                           'carnet_negocios_con_recordatorios()', 'carnet_publico(text)'] loop
    execute format('revoke execute on function public.%s from authenticated', f);
  end loop;
end;
$$;
alter function public.vet_registro_inmutable() owner to peludesk_definer;
