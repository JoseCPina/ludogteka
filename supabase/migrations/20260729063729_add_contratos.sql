-- Fase 6, Bloque B: instancia real de un contrato para un perro.
--
-- Vigencia (decisión documentada también en docs/PROYECTO.md): el
-- contrato es POR PERRO, no por estancia. Cubre la relación general del
-- dueño con el negocio para ese perro (autorización médica, tope de
-- gasto, consentimiento de imagen son datos del perro/cliente, no de una
-- reserva puntual) y no vence solo — se vuelve a generar únicamente si el
-- negocio decide pedir una renovación (nueva plantilla, cambio de
-- condiciones) o si es un perro nuevo. Exigir firma por cada estancia
-- hubiera chocado de frente con las series recurrentes de Fase 4 (un
-- perro que viene cada martes no puede firmar papeleo cada martes).
--
-- El PDF real (sin firmar) NUNCA se guarda en Storage — se genera al
-- vuelo para mostrarlo/firmarlo (aplicación, no aquí). Storage solo
-- recibe el PDF FINAL: firmado digital (con firma+bloque de auditoría
-- ya sellados) o el escaneado de papel. Así nunca hay que reemplazar un
-- objeto ya subido — cada contrato firmado tiene una ruta propia y fija.
--
-- cliente_id es redundante con perros.cliente_id a propósito (igual que
-- reservas.cliente_id ya es redundante con perros.cliente_id en otras
-- tablas de este esquema): permite filtrar RLS sin JOIN y el contrato
-- sigue siendo consultable aunque el perro cambiara de dueño después
-- (perro_historial_dueno, Fase 2) — el contrato firmado retrata quién era
-- el dueño EN ESE MOMENTO, no quien sea ahora.
create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  perro_id uuid not null references public.perros(id),
  cliente_id uuid not null references public.clientes(id),
  plantilla_id uuid not null references public.plantillas_contrato(id),

  estado text not null default 'pendiente_firma'
    check (estado in ('pendiente_firma', 'firmado_digital', 'firmado_papel', 'cancelado')),

  storage_path text,
  hash_pdf text,
  fecha_firma timestamptz,
  ip_firma text,
  firmado_por uuid references auth.users(id),
  subido_por uuid references auth.users(id),
  motivo_cancelacion text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),

  check (estado <> 'cancelado' or motivo_cancelacion is not null),
  check (estado not in ('firmado_digital', 'firmado_papel') or (storage_path is not null and hash_pdf is not null and fecha_firma is not null)),
  check (estado <> 'firmado_digital' or (firmado_por is not null and ip_firma is not null)),
  check (estado <> 'firmado_papel' or subido_por is not null)
);

create trigger set_updated_at before insert or update on public.contratos
  for each row execute function public.set_updated_at();

create index contratos_perro_id_idx on public.contratos (perro_id);
create index contratos_cliente_id_idx on public.contratos (cliente_id);

alter table public.contratos enable row level security;

create policy contratos_select_staff on public.contratos
  for select to authenticated
  using (public.is_staff());

create policy contratos_select_propio on public.contratos
  for select to authenticated
  using (
    cliente_id = (select cliente_id from public.profiles where id = auth.uid())
  );

-- Sin política de INSERT/UPDATE para authenticated: generar, firmar,
-- subir de papel y cancelar son operaciones con reglas propias (una sola
-- pendiente a la vez, no reabrir un firmado, etc.) que viven en las
-- funciones de abajo, nunca en un INSERT/UPDATE directo desde la
-- pantalla.

-- Genera el registro pendiente de firma con la plantilla ACTIVA en este
-- momento — ese id queda fijo para siempre en este contrato, aunque se
-- publiquen versiones nuevas después.
create or replace function public.generar_contrato(p_perro_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente_id uuid;
  v_plantilla_id uuid;
  v_id uuid;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden generar un contrato.';
  end if;

  select cliente_id into v_cliente_id from public.perros where id = p_perro_id and deleted_at is null;
  if v_cliente_id is null then
    raise exception 'Perro no encontrado.';
  end if;

  select id into v_plantilla_id from public.plantillas_contrato where activa = true;
  if v_plantilla_id is null then
    raise exception 'No hay una plantilla de contrato publicada todavía.';
  end if;

  if exists (
    select 1 from public.contratos
    where perro_id = p_perro_id and estado = 'pendiente_firma'
  ) then
    raise exception 'Ya hay un contrato pendiente de firma para este perro. Cancélalo antes de generar otro.';
  end if;

  insert into public.contratos (perro_id, cliente_id, plantilla_id, created_by)
  values (p_perro_id, v_cliente_id, v_plantilla_id, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.generar_contrato(uuid) from public;
grant execute on function public.generar_contrato(uuid) to authenticated;

-- Cierra el ciclo de firma DIGITAL. La aplicación (no esta función) ya
-- generó el PDF con la firma dibujada y el bloque de auditoría impresos,
-- lo subió a Storage y calculó su hash — aquí solo se valida quién puede
-- hacerlo y se deja el registro consistente en una sola transacción.
-- Solo el dueño del perro (cliente_id propio) puede firmar el suyo.
create or replace function public.finalizar_firma_contrato(
  p_contrato_id uuid,
  p_storage_path text,
  p_hash_pdf text,
  p_ip text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contrato public.contratos%rowtype;
  v_cliente_id uuid;
begin
  select * into v_contrato from public.contratos where id = p_contrato_id;
  if not found then
    raise exception 'Contrato no encontrado.';
  end if;
  if v_contrato.estado <> 'pendiente_firma' then
    raise exception 'Este contrato ya no está pendiente de firma.';
  end if;

  select cliente_id into v_cliente_id from public.profiles where id = auth.uid();
  if v_cliente_id is null or v_cliente_id <> v_contrato.cliente_id then
    raise exception 'Solo el dueño de este perro puede firmar su contrato.';
  end if;

  if p_storage_path is null or btrim(p_storage_path) = '' then
    raise exception 'Falta la ruta del PDF firmado.';
  end if;
  if p_hash_pdf is null or btrim(p_hash_pdf) = '' then
    raise exception 'Falta el hash del PDF firmado.';
  end if;
  if p_ip is null or btrim(p_ip) = '' then
    raise exception 'No se pudo determinar la IP de la firma.';
  end if;

  update public.contratos
  set estado = 'firmado_digital',
      storage_path = p_storage_path,
      hash_pdf = p_hash_pdf,
      ip_firma = p_ip,
      fecha_firma = now(),
      firmado_por = auth.uid()
  where id = p_contrato_id;
end;
$$;

revoke execute on function public.finalizar_firma_contrato(uuid, text, text, text) from public;
grant execute on function public.finalizar_firma_contrato(uuid, text, text, text) to authenticated;

-- Caso "firmado en papel": staff ya subió el escaneado a Storage; aquí
-- solo se registra. Sin ip_firma (nadie firmó en pantalla) — el check de
-- la tabla exige subido_por en vez de firmado_por/ip_firma para este
-- estado, así los dos casos nunca se confunden entre sí en una consulta.
create or replace function public.subir_contrato_papel(
  p_contrato_id uuid,
  p_storage_path text,
  p_hash_pdf text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden registrar un contrato firmado en papel.';
  end if;

  select estado into v_estado from public.contratos where id = p_contrato_id;
  if v_estado is null then
    raise exception 'Contrato no encontrado.';
  end if;
  if v_estado <> 'pendiente_firma' then
    raise exception 'Este contrato ya no está pendiente de firma.';
  end if;

  if p_storage_path is null or btrim(p_storage_path) = '' then
    raise exception 'Falta la ruta del archivo escaneado.';
  end if;
  if p_hash_pdf is null or btrim(p_hash_pdf) = '' then
    raise exception 'Falta el hash del archivo escaneado.';
  end if;

  update public.contratos
  set estado = 'firmado_papel',
      storage_path = p_storage_path,
      hash_pdf = p_hash_pdf,
      fecha_firma = now(),
      subido_por = auth.uid()
  where id = p_contrato_id;
end;
$$;

revoke execute on function public.subir_contrato_papel(uuid, text, text) from public;
grant execute on function public.subir_contrato_papel(uuid, text, text) to authenticated;

-- Cancelar: un contrato generado por error, o que el negocio decide dar
-- de baja. Nunca se borra (deleted_at no se usa aquí a propósito, un
-- contrato cancelado sigue siendo historial relevante) y nunca se
-- reactiva — mismo criterio que cargos/descuentos cancelados.
create or replace function public.cancelar_contrato(
  p_contrato_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden cancelar un contrato.';
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe el motivo de la cancelación.';
  end if;

  select estado into v_estado from public.contratos where id = p_contrato_id;
  if v_estado is null then
    raise exception 'Contrato no encontrado.';
  end if;
  if v_estado = 'cancelado' then
    raise exception 'Este contrato ya está cancelado.';
  end if;

  update public.contratos
  set estado = 'cancelado', motivo_cancelacion = btrim(p_motivo)
  where id = p_contrato_id;
end;
$$;

revoke execute on function public.cancelar_contrato(uuid, text) from public;
grant execute on function public.cancelar_contrato(uuid, text) to authenticated;
