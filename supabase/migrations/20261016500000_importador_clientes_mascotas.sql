-- Importador de clientes y mascotas (carril B).
--
-- Una importación sube un Excel o CSV ya mapeado a campos del sistema: cada fila
-- del archivo es un dueño (y, si trae nombre de mascota, su mascota). Se procesa
-- por lotes desde la pantalla (cada lote es UNA llamada y UNA transacción), así
-- que cerrar la pestaña no deja nada a medias: se retoma desde el historial.
--
-- Reglas que esta migración fija:
--  · NO se altera ninguna tabla de clientes, mascotas (perros), inventario ni citas.
--    Solo se INSERTA en clientes, perros, pesos_registrados y perro_alergias por las
--    mismas reglas de siempre (sus triggers y políticas se aplican: la ficha clínica
--    sigue exigiendo «Editar ficha clínica» y el módulo Veterinaria prendido).
--  · Duplicados por teléfono normalizado (cliente) y por microchip (mascota); sin
--    microchip, por nombre dentro del mismo dueño. «Omitir» deja lo que ya hay;
--    «actualizar» llena lo que el archivo trae sin pisar con vacíos.
--  · Idempotente: cada fila se aplica en su propia transacción junto con su estado;
--    reintentar un lote no duplica, y volver a subir el mismo archivo reusa la
--    importación (huella).
--  · Reversible: cada fila guarda lo que creó o el valor anterior de lo que
--    actualizó. Deshacer una importación completa da de baja lo creado y restaura lo
--    actualizado SOLO si nadie lo modificó después y no tiene nada colgando.
--  · La raza se liga al catálogo por la misma normalización de siempre
--    (razas_variantes); lo que no coincide queda como texto y sale en el resumen.
--
-- Permiso NUEVO: importar_datos (admin siempre; recepción apagado por omisión).
-- También: formulario_borradores (autoguardado por usuario y por formulario).
--
-- REVERSA: drop de las funciones importacion_* y borrador_*, de las tablas
-- importacion_filas, importaciones y formulario_borradores, y la fila
-- 'importar_datos' de permisos_catalogo. Los clientes y mascotas ya importados se
-- dan de baja con «Deshacer» desde el historial, no con SQL.

-- ── 0. Permiso ───────────────────────────────────────────────────────────────
do $$
declare
  d text;
  v_def text;
begin
  if to_regclass('public.permisos_catalogo') is not null then
    insert into public.permisos_catalogo (clave, etiqueta, modulos, orden, updated_at) values
      ('importar_datos', 'Importar clientes y mascotas', '{}', 43, now())
    on conflict (clave) do nothing;
  else
    select pg_get_constraintdef(oid) into d from pg_constraint
    where conname = 'permisos_staff_permiso_check' and conrelid = 'public.permisos_staff'::regclass;
    if d is null then
      raise exception 'No existe permisos_staff_permiso_check.';
    end if;
    if position('''importar_datos''' in d) = 0 then
      d := replace(d, 'ARRAY[', 'ARRAY[''importar_datos''::text, ');
      alter table public.permisos_staff drop constraint permisos_staff_permiso_check;
      execute 'alter table public.permisos_staff add constraint permisos_staff_permiso_check ' || d;
    end if;
    select pg_get_functiondef('public.mis_permisos()'::regprocedure) into v_def;
    if position('''importar_datos''' in v_def) = 0 then
      v_def := replace(v_def, '''inventario_costos'',', '''inventario_costos'', ''importar_datos'',');
      if position('''importar_datos''' in v_def) = 0 then
        raise exception 'mis_permisos cambió: no se pudo agregar el permiso de importación.';
      end if;
      execute v_def;
    end if;
  end if;
end $$;

-- ── 1. Tablas ────────────────────────────────────────────────────────────────
create table public.importaciones (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  nombre_archivo text not null check (char_length(nombre_archivo) between 1 and 200),
  huella text not null,
  -- preparada: se están subiendo las filas · procesando · completada · deshecha · cancelada
  estado text not null default 'preparada' check (estado in ('preparada', 'procesando', 'completada', 'deshecha', 'cancelada')),
  modo_duplicados text not null check (modo_duplicados in ('omitir', 'actualizar')),
  con_clinicos boolean not null default false,
  mapeo jsonb not null default '{}'::jsonb,
  total_filas integer not null check (total_filas >= 0),
  iniciada_at timestamptz,
  terminada_at timestamptz,
  deshecha_at timestamptz,
  deshecha_por uuid references auth.users(id) on delete set null
);
create index importaciones_negocio_idx on public.importaciones (negocio_id, created_at desc);
-- Una huella viva por negocio: subir dos veces el mismo archivo reusa la importación.
create unique index importaciones_huella_viva on public.importaciones (negocio_id, huella)
  where estado in ('preparada', 'procesando', 'completada');

create table public.importacion_filas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  importacion_id uuid not null references public.importaciones(id) on delete cascade,
  n integer not null,
  datos jsonb not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'creada', 'actualizada', 'omitida', 'error', 'deshecha')),
  mensaje text,
  procesada_at timestamptz,
  -- Lo que esta fila hizo (para deshacer). Sin llaves foráneas a propósito: las
  -- tablas de clientes y mascotas no se tocan y una baja no debe trabarse aquí.
  cliente_id uuid,
  perro_id uuid,
  cliente_creado boolean not null default false,
  perro_creado boolean not null default false,
  antes jsonb not null default '{}'::jsonb,
  cliente_updated_at timestamptz,
  perro_updated_at timestamptz,
  -- El updated_at que tenían ANTES de esta fila: sirve para encadenar importaciones
  -- (si una posterior se deshace, la anterior vuelve a poder deshacerse).
  cliente_previo_updated_at timestamptz,
  perro_previo_updated_at timestamptz,
  peso_id uuid,
  alergia_ids uuid[] not null default '{}',
  unique (importacion_id, n)
);
create index importacion_filas_negocio_idx on public.importacion_filas (negocio_id);
create index importacion_filas_estado_idx on public.importacion_filas (importacion_id, estado, n);

create table public.formulario_borradores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  usuario_id uuid not null default auth.uid(),
  formulario text not null check (formulario ~ '^[a-z0-9_]{1,40}$'),
  clave text not null default '' check (clave ~ '^[A-Za-z0-9_:.-]{0,80}$'),
  datos jsonb not null,
  check (octet_length(datos::text) <= 200000),
  unique (negocio_id, usuario_id, formulario, clave)
);
create index formulario_borradores_negocio_idx on public.formulario_borradores (negocio_id);

do $$
declare
  t text;
  v_lee text;
begin
  foreach t in array array['importaciones', 'importacion_filas', 'formulario_borradores'] loop
    v_lee := case t
      when 'formulario_borradores' then $p$(usuario_id = (select auth.uid()))$p$
      else $p$((select coalesce(public.tiene_permiso('importar_datos'), false)))$p$ end;
    execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format($f$create policy %I on public.%I as restrictive for all to authenticated
      using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
      with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))$f$, t || '_negocio', t);
    execute format($f$create policy %I on public.%I for all to peludesk_definer
      using (negocio_id = (select public.negocio_actual()))
      with check (negocio_id = (select public.negocio_actual()))$f$, t || '_negocio_definer', t);
    execute format($f$create policy %I on public.%I as restrictive for insert to authenticated, peludesk_definer
      with check ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_ins', t);
    execute format($f$create policy %I on public.%I as restrictive for update to authenticated, peludesk_definer
      using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_upd', t);
    execute format($f$create policy %I on public.%I as restrictive for delete to authenticated, peludesk_definer
      using ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_del', t);
    execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_select', t, v_lee);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to peludesk_definer', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ── 2. Ayudantes (normalización y búsquedas; las usan la vista previa y el proceso) ──
create or replace function public.importacion_telefono(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  with d as (select regexp_replace(coalesce(p_texto, ''), '\D', '', 'g') as x)
  select case
    when length(x) = 10 then x
    when length(x) = 12 and x like '52%' then substr(x, 3)
    when length(x) = 13 and x like '521%' then substr(x, 4)
    else null end
  from d
$$;

create or replace function public.importacion_microchip(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(coalesce(p_texto, ''), '[\s\-]', '', 'g'), '')
$$;

-- Qué raza del catálogo es un texto: una sola coincidencia por nombre o alias
-- (misma normalización que /perros/razas). Nunca adivina entre dos.
create or replace function public.importacion_raza(p_texto text)
returns table (raza_id uuid, nombre text, estado text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_norm text := public.normalizar_raza(coalesce(p_texto, ''));
  v_n integer;
begin
  if v_norm = '' then
    return query select null::uuid, null::text, 'vacia'::text;
    return;
  end if;
  select count(distinct v.raza_id) into v_n from public.razas_variantes v where v.variante_norm = v_norm;
  if v_n = 1 then
    return query select v.raza_id, v.raza_nombre, 'catalogo'::text
      from public.razas_variantes v where v.variante_norm = v_norm limit 1;
  elsif v_n > 1 then
    return query select null::uuid, null::text, 'ambigua'::text;
  else
    return query select null::uuid, null::text, 'sin_coincidencia'::text;
  end if;
end;
$$;
alter function public.importacion_raza(text) owner to peludesk_definer;

create or replace function public.importacion_buscar_cliente(p_telefono text)
returns table (cliente_id uuid, nombre text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.nombre from public.clientes c
  where c.negocio_id = public.negocio_actual() and c.deleted_at is null and c.publico_general = false
    and c.telefono = p_telefono
  limit 1
$$;
alter function public.importacion_buscar_cliente(text) owner to peludesk_definer;

create or replace function public.importacion_buscar_perro(p_cliente uuid, p_microchip text, p_nombre text, p_especie text)
returns table (perro_id uuid, perro_cliente_id uuid, por text)
language sql
stable
security definer
set search_path = ''
as $$
  select x.id, x.cliente_id, x.por from (
    (select p.id, p.cliente_id, 'microchip'::text as por, 0 as o from public.perros p
      where p.negocio_id = public.negocio_actual() and p.deleted_at is null
        and public.importacion_microchip(p_microchip) is not null
        and lower(p.microchip) = lower(public.importacion_microchip(p_microchip))
      limit 1)
    union all
    (select p.id, p.cliente_id, 'nombre'::text, 1 from public.perros p
      where p.negocio_id = public.negocio_actual() and p.deleted_at is null
        and p_cliente is not null and p.cliente_id = p_cliente
        and lower(btrim(p.nombre)) = lower(btrim(coalesce(p_nombre, '')))
        and p.especie = coalesce(p_especie, 'perro')
      limit 1)
  ) x order by x.o limit 1
$$;
alter function public.importacion_buscar_perro(uuid, text, text, text) owner to peludesk_definer;

create or replace function public.importacion_mensaje_error(p_estado text, p_mensaje text, p_detalle text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_estado = '23505' and (p_mensaje ilike '%telefono%' or p_detalle ilike '%telefono%') then 'Ya hay un cliente activo con ese teléfono.'
    when p_estado = '23505' and (p_mensaje ilike '%microchip%' or p_detalle ilike '%microchip%') then 'Ese microchip ya está en otra ficha.'
    when p_estado = '23505' and (p_mensaje ilike '%email%' or p_detalle ilike '%email%') then 'Ese correo ya es de otro cliente.'
    when p_estado = '23514' then 'Un dato no cumple las reglas del sistema (' || coalesce(nullif(substr(p_mensaje, 1, 160), ''), 'revisa la fila') || ').'
    else coalesce(nullif(substr(p_mensaje, 1, 300), ''), 'No se pudo importar esta fila.') end
$$;

-- ── 3. Crear la importación (por partes, para archivos grandes) ──────────────
create or replace function public.importacion_crear(
  p_nombre_archivo text, p_huella text, p_modo text, p_con_clinicos boolean, p_mapeo jsonb, p_total integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_id uuid;
  v_est text;
  v_clin boolean := coalesce(p_con_clinicos, false);
  v_fecha timestamptz;
begin
  if not coalesce(public.tiene_permiso('importar_datos'), false) then
    raise exception 'Necesitas el permiso «Importar clientes y mascotas».' using errcode = '42501';
  end if;
  if p_modo not in ('omitir', 'actualizar') then
    raise exception 'El modo de duplicados es «omitir» o «actualizar».';
  end if;
  if p_total is null or p_total < 1 or p_total > 20000 then
    raise exception 'Una importación lleva de 1 a 20,000 filas.';
  end if;
  if coalesce(p_huella, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'La huella del archivo no es válida.';
  end if;
  if v_clin and not (public.modulo_activo('veterinaria') and coalesce(public.tiene_permiso('editar_ficha_clinica'), false)) then
    v_clin := false;
  end if;

  select i.id, i.estado, coalesce(i.terminada_at, i.created_at) into v_id, v_est, v_fecha
  from public.importaciones i
  where i.negocio_id = v_neg and i.huella = p_huella and i.estado in ('preparada', 'procesando', 'completada')
  limit 1;
  if found then
    return jsonb_build_object('id', v_id, 'estado', v_est, 'reusada', true, 'fecha', v_fecha);
  end if;

  insert into public.importaciones (nombre_archivo, huella, modo_duplicados, con_clinicos, mapeo, total_filas)
  values (left(p_nombre_archivo, 200), p_huella, p_modo, v_clin, coalesce(p_mapeo, '{}'::jsonb), p_total)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'estado', 'preparada', 'reusada', false, 'con_clinicos', v_clin);
end;
$$;
alter function public.importacion_crear(text, text, text, boolean, jsonb, integer) owner to peludesk_definer;

-- Agrega filas (idempotente por número de fila: reenviar un bloque no duplica).
create or replace function public.importacion_agregar_filas(p_id uuid, p_filas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_est text;
  v_n integer;
begin
  if not coalesce(public.tiene_permiso('importar_datos'), false) then
    raise exception 'Necesitas el permiso «Importar clientes y mascotas».' using errcode = '42501';
  end if;
  select i.estado into v_est from public.importaciones i where i.id = p_id and i.negocio_id = v_neg;
  if not found then
    raise exception 'Esa importación no existe.';
  end if;
  if v_est <> 'preparada' then
    raise exception 'Esta importación ya empezó: no se le pueden agregar filas.';
  end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) > 1000 then
    raise exception 'Las filas llegan en bloques de hasta 1,000.';
  end if;
  insert into public.importacion_filas (importacion_id, n, datos, estado, mensaje, procesada_at)
  select p_id, (e->>'n')::integer, coalesce(e->'datos', '{}'::jsonb),
         case when nullif(e->>'error', '') is not null then 'error' else 'pendiente' end,
         nullif(e->>'error', ''),
         case when nullif(e->>'error', '') is not null then now() end
  from jsonb_array_elements(p_filas) e
  on conflict (importacion_id, n) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
alter function public.importacion_agregar_filas(uuid, jsonb) owner to peludesk_definer;

-- ── 4. Una fila (interna: la llama el lote dentro de su propio sub-bloque) ───
create or replace function public.importacion_procesar_fila(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  f public.importacion_filas%rowtype;
  imp public.importaciones%rowtype;
  d jsonb;
  rc public.clientes%rowtype;
  rp public.perros%rowtype;
  v_hay boolean;
  v_cli uuid;
  v_cli_creado boolean := false;
  v_cli_cambio boolean := false;
  v_cli_antes jsonb := '{}'::jsonb;
  v_perro uuid;
  v_perro_creado boolean := false;
  v_perro_cambio boolean := false;
  v_perro_antes jsonb := '{}'::jsonb;
  v_avisos text[] := '{}';
  v_notas text[] := '{}';
  v_clin boolean;
  v_actualiza boolean;
  v_nombre text; v_email text; v_dir text;
  v_raza_id uuid; v_raza text; v_raza_estado text;
  v_tam uuid; v_pel uuid;
  v_peso_id uuid;
  v_alergias uuid[] := '{}';
  v_alergia text;
  v_aid uuid;
  v_esp text;
  v_h_id uuid;
  v_h_cli uuid;
  v_estado text;
  v_micro text;
  v_cli_previo timestamptz;
  v_perro_previo timestamptz;
begin
  select * into f from public.importacion_filas x where x.id = p_id and x.negocio_id = v_neg;
  select * into imp from public.importaciones x where x.id = f.importacion_id and x.negocio_id = v_neg;
  d := f.datos;
  v_clin := imp.con_clinicos;
  v_actualiza := imp.modo_duplicados = 'actualizar';

  if public.importacion_telefono(d->>'c_telefono') is null then
    raise exception 'El teléfono no tiene 10 dígitos.';
  end if;
  if nullif(btrim(coalesce(d->>'c_nombre', '')), '') is null then
    raise exception 'Falta el nombre del dueño.';
  end if;
  v_nombre := btrim(d->>'c_nombre');
  v_email := nullif(btrim(coalesce(d->>'c_email', '')), '');
  v_dir := nullif(btrim(coalesce(d->>'c_direccion', '')), '');

  -- ── Cliente ──
  select * into rc from public.clientes c
  where c.negocio_id = v_neg and c.deleted_at is null and c.publico_general = false
    and c.telefono = public.importacion_telefono(d->>'c_telefono')
  limit 1;
  v_hay := found;

  if v_email is not null and exists (
    select 1 from public.clientes c
    where c.negocio_id = v_neg and c.deleted_at is null and lower(c.email) = lower(v_email)
      and (not v_hay or c.id <> rc.id)
  ) then
    v_avisos := array_append(v_avisos, 'El correo ya es de otro cliente: no se guardó.');
    v_email := null;
  end if;

  if not v_hay then
    insert into public.clientes (nombre, telefono, email, direccion)
    values (v_nombre, public.importacion_telefono(d->>'c_telefono'), v_email, v_dir)
    returning id into v_cli;
    v_cli_creado := true;
    v_notas := array_append(v_notas, 'cliente nuevo');
  else
    v_cli := rc.id;
    v_cli_previo := rc.updated_at;
    if v_actualiza then
      if v_nombre is distinct from rc.nombre then v_cli_antes := v_cli_antes || jsonb_build_object('nombre', rc.nombre); v_cli_cambio := true; end if;
      if v_email is not null and v_email is distinct from rc.email then v_cli_antes := v_cli_antes || jsonb_build_object('email', rc.email); v_cli_cambio := true; end if;
      if v_dir is not null and v_dir is distinct from rc.direccion then v_cli_antes := v_cli_antes || jsonb_build_object('direccion', rc.direccion); v_cli_cambio := true; end if;
      if v_cli_cambio then
        update public.clientes c set
          nombre = v_nombre,
          email = coalesce(v_email, c.email),
          direccion = coalesce(v_dir, c.direccion)
        where c.id = rc.id;
        v_notas := array_append(v_notas, 'cliente actualizado');
      else
        v_notas := array_append(v_notas, 'cliente ya existía sin cambios');
      end if;
    else
      v_notas := array_append(v_notas, 'cliente ya existía');
    end if;
  end if;

  if nullif(btrim(coalesce(d->>'c_notas', '')), '') is not null then
    v_avisos := array_append(v_avisos, 'Las notas del cliente no se guardaron: el sistema aún no tiene dónde.');
  end if;

  -- ── Mascota ──
  if nullif(btrim(coalesce(d->>'m_nombre', '')), '') is not null then
    v_esp := case when v_clin then coalesce(nullif(d->>'m_especie', ''), 'perro') else 'perro' end;
    v_micro := case when v_clin then public.importacion_microchip(d->>'m_microchip') else null end;

    select r.raza_id, r.nombre, r.estado into v_raza_id, v_raza, v_raza_estado
    from public.importacion_raza(d->>'m_raza') r;
    if v_raza_estado = 'catalogo' then
      null;
    else
      v_raza_id := null;
      v_raza := nullif(btrim(coalesce(d->>'m_raza', '')), '');
      if v_raza_estado = 'ambigua' then
        v_avisos := array_append(v_avisos, 'La raza «' || v_raza || '» coincide con más de una del catálogo: quedó como texto.');
      end if;
    end if;
    select t.id into v_tam from public.tamanos_categoria t where t.clave = nullif(d->>'m_tamano', '') and t.deleted_at is null;
    select p.id into v_pel from public.tipos_pelaje p where p.clave = nullif(d->>'m_pelaje', '') and p.deleted_at is null;

    select b.perro_id, b.perro_cliente_id into v_h_id, v_h_cli from public.importacion_buscar_perro(v_cli, v_micro, d->>'m_nombre', v_esp) b;
    v_hay := found;

    if v_hay and v_h_cli <> v_cli then
      v_avisos := array_append(v_avisos, 'El microchip ya está en la ficha de otro dueño: la mascota no se importó.');
      v_notas := array_append(v_notas, 'mascota omitida');
    elsif v_hay then
      v_perro := v_h_id;
      select * into rp from public.perros p where p.id = v_perro;
      v_perro_previo := rp.updated_at;
      if v_actualiza then
        if v_raza_id is not null and rp.raza_id is distinct from v_raza_id then
          v_perro_antes := v_perro_antes || jsonb_build_object('raza_id', rp.raza_id, 'raza', rp.raza); v_perro_cambio := true;
        elsif v_raza_id is null and v_raza is not null and rp.raza_id is null and rp.raza is distinct from v_raza then
          v_perro_antes := v_perro_antes || jsonb_build_object('raza', rp.raza); v_perro_cambio := true;
        end if;
        if nullif(d->>'m_sexo', '') is not null and rp.sexo is distinct from d->>'m_sexo' then v_perro_antes := v_perro_antes || jsonb_build_object('sexo', rp.sexo); v_perro_cambio := true; end if;
        if d->>'m_esterilizado' is not null and rp.esterilizado is distinct from (d->>'m_esterilizado')::boolean then v_perro_antes := v_perro_antes || jsonb_build_object('esterilizado', rp.esterilizado); v_perro_cambio := true; end if;
        if nullif(d->>'m_nacimiento', '') is not null and rp.fecha_nacimiento is distinct from (d->>'m_nacimiento')::date then v_perro_antes := v_perro_antes || jsonb_build_object('fecha_nacimiento', rp.fecha_nacimiento); v_perro_cambio := true; end if;
        if v_tam is not null and rp.tamano_id is distinct from v_tam then v_perro_antes := v_perro_antes || jsonb_build_object('tamano_id', rp.tamano_id); v_perro_cambio := true; end if;
        if v_pel is not null and rp.pelaje_id is distinct from v_pel then v_perro_antes := v_perro_antes || jsonb_build_object('pelaje_id', rp.pelaje_id); v_perro_cambio := true; end if;
        if v_clin then
          if nullif(d->>'m_folio', '') is not null and rp.folio_registro is distinct from btrim(d->>'m_folio') then v_perro_antes := v_perro_antes || jsonb_build_object('folio_registro', rp.folio_registro); v_perro_cambio := true; end if;
          if v_micro is not null and rp.microchip is null then v_perro_antes := v_perro_antes || jsonb_build_object('microchip', rp.microchip); v_perro_cambio := true; end if;
        end if;
        if v_perro_cambio then
          update public.perros p set
            raza_id = case when v_perro_antes ? 'raza_id' then v_raza_id else p.raza_id end,
            raza = case when v_perro_antes ? 'raza' then v_raza else p.raza end,
            sexo = case when v_perro_antes ? 'sexo' then d->>'m_sexo' else p.sexo end,
            esterilizado = case when v_perro_antes ? 'esterilizado' then (d->>'m_esterilizado')::boolean else p.esterilizado end,
            fecha_nacimiento = case when v_perro_antes ? 'fecha_nacimiento' then (d->>'m_nacimiento')::date else p.fecha_nacimiento end,
            tamano_id = case when v_perro_antes ? 'tamano_id' then v_tam else p.tamano_id end,
            pelaje_id = case when v_perro_antes ? 'pelaje_id' then v_pel else p.pelaje_id end,
            folio_registro = case when v_perro_antes ? 'folio_registro' then btrim(d->>'m_folio') else p.folio_registro end,
            microchip = case when v_perro_antes ? 'microchip' then v_micro else p.microchip end
          where p.id = v_perro;
          v_notas := array_append(v_notas, 'mascota actualizada');
        else
          v_notas := array_append(v_notas, 'mascota ya existía sin cambios');
        end if;
      else
        v_notas := array_append(v_notas, 'mascota ya existía');
      end if;
    else
      insert into public.perros (cliente_id, nombre, raza, raza_id, sexo, esterilizado, fecha_nacimiento, tamano_id, pelaje_id,
                                 especie, especie_detalle, microchip, folio_registro)
      values (
        v_cli, btrim(d->>'m_nombre'), v_raza, v_raza_id, nullif(d->>'m_sexo', ''),
        case when d->>'m_esterilizado' is null then null else (d->>'m_esterilizado')::boolean end,
        nullif(d->>'m_nacimiento', '')::date, v_tam, v_pel,
        v_esp,
        case when v_clin and v_esp = 'otro' then nullif(btrim(coalesce(d->>'m_especie_detalle', '')), '') end,
        v_micro,
        case when v_clin then nullif(btrim(coalesce(d->>'m_folio', '')), '') end
      ) returning id into v_perro;
      v_perro_creado := true;
      v_notas := array_append(v_notas, 'mascota nueva');
    end if;

    -- Peso y alergias: datos clínicos, solo con Veterinaria prendida y el permiso.
    if v_clin and v_perro is not null and (v_perro_creado or v_actualiza) then
      if nullif(d->>'m_peso', '') is not null then
        insert into public.pesos_registrados (perro_id, peso_kg) values (v_perro, (d->>'m_peso')::numeric) returning id into v_peso_id;
        v_notas := array_append(v_notas, 'peso registrado');
      end if;
      if jsonb_typeof(d->'m_alergias') = 'array' then
        for v_alergia in select jsonb_array_elements_text(d->'m_alergias') loop
          v_alergia := nullif(btrim(v_alergia), '');
          continue when v_alergia is null;
          continue when exists (select 1 from public.perro_alergias a where a.perro_id = v_perro and a.deleted_at is null and lower(a.alergeno) = lower(v_alergia));
          insert into public.perro_alergias (perro_id, alergeno) values (v_perro, left(v_alergia, 120)) returning id into v_aid;
          v_alergias := array_append(v_alergias, v_aid);
        end loop;
        if cardinality(v_alergias) > 0 then v_notas := array_append(v_notas, 'alergias registradas'); end if;
      end if;
    end if;
  end if;

  v_estado := case
    when v_cli_creado or v_perro_creado then 'creada'
    when v_cli_cambio or v_perro_cambio or v_peso_id is not null or cardinality(v_alergias) > 0 then 'actualizada'
    else 'omitida' end;

  update public.importacion_filas x set
    estado = v_estado,
    mensaje = nullif(array_to_string(array_cat(v_notas, v_avisos), ' · '), ''),
    procesada_at = now(),
    cliente_id = v_cli,
    perro_id = v_perro,
    cliente_creado = v_cli_creado,
    perro_creado = v_perro_creado,
    antes = jsonb_build_object('cliente', v_cli_antes, 'perro', v_perro_antes),
    cliente_updated_at = (select c.updated_at from public.clientes c where c.id = v_cli),
    perro_updated_at = (select p.updated_at from public.perros p where p.id = v_perro),
    cliente_previo_updated_at = v_cli_previo,
    perro_previo_updated_at = v_perro_previo,
    peso_id = v_peso_id,
    alergia_ids = v_alergias
  where x.id = p_id;
end;
$$;
alter function public.importacion_procesar_fila(uuid) owner to peludesk_definer;
revoke execute on function public.importacion_procesar_fila(uuid) from public, anon, authenticated;
grant execute on function public.importacion_procesar_fila(uuid) to peludesk_definer;

-- ── 5. Progreso y lote ───────────────────────────────────────────────────────
create or replace function public.importacion_progreso(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  imp public.importaciones%rowtype;
  v_razas jsonb;
begin
  if not coalesce(public.tiene_permiso('importar_datos'), false) then
    raise exception 'Necesitas el permiso «Importar clientes y mascotas».' using errcode = '42501';
  end if;
  select * into imp from public.importaciones i where i.id = p_id and i.negocio_id = v_neg;
  if not found then
    raise exception 'Esa importación no existe.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('texto', x.texto, 'cuenta', x.cuenta) order by x.cuenta desc, x.texto), '[]'::jsonb) into v_razas
  from (
    select min(btrim(f.datos->>'m_raza')) as texto, count(*) as cuenta
    from public.importacion_filas f
    join public.perros p on p.id = f.perro_id
    where f.importacion_id = p_id and f.negocio_id = v_neg and f.estado in ('creada', 'actualizada')
      and nullif(btrim(coalesce(f.datos->>'m_raza', '')), '') is not null and p.raza_id is null
    group by public.normalizar_raza(f.datos->>'m_raza')
  ) x;
  return jsonb_build_object(
    'id', imp.id, 'estado', imp.estado, 'total', imp.total_filas, 'modo', imp.modo_duplicados, 'con_clinicos', imp.con_clinicos,
    'nombre_archivo', imp.nombre_archivo, 'creada_at', imp.created_at, 'terminada_at', imp.terminada_at, 'deshecha_at', imp.deshecha_at,
    'filas', (select count(*) from public.importacion_filas f where f.importacion_id = p_id and f.negocio_id = v_neg),
    'pendientes', (select count(*) from public.importacion_filas f where f.importacion_id = p_id and f.negocio_id = v_neg and f.estado = 'pendiente'),
    'creadas', (select count(*) from public.importacion_filas f where f.importacion_id = p_id and f.negocio_id = v_neg and f.estado = 'creada'),
    'actualizadas', (select count(*) from public.importacion_filas f where f.importacion_id = p_id and f.negocio_id = v_neg and f.estado = 'actualizada'),
    'omitidas', (select count(*) from public.importacion_filas f where f.importacion_id = p_id and f.negocio_id = v_neg and f.estado = 'omitida'),
    'errores', (select count(*) from public.importacion_filas f where f.importacion_id = p_id and f.negocio_id = v_neg and f.estado = 'error'),
    'deshechas', (select count(*) from public.importacion_filas f where f.importacion_id = p_id and f.negocio_id = v_neg and f.estado = 'deshecha'),
    'clientes_creados', (select count(*) from public.importacion_filas f where f.importacion_id = p_id and f.negocio_id = v_neg and f.cliente_creado and f.estado <> 'deshecha'),
    'mascotas_creadas', (select count(*) from public.importacion_filas f where f.importacion_id = p_id and f.negocio_id = v_neg and f.perro_creado and f.estado <> 'deshecha'),
    'razas_sin_catalogo', v_razas
  );
end;
$$;
alter function public.importacion_progreso(uuid) owner to peludesk_definer;

create or replace function public.importacion_procesar_lote(p_id uuid, p_max integer default 40)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  imp public.importaciones%rowtype;
  r record;
  v_estado text;
  v_msg text;
  v_det text;
begin
  if not coalesce(public.tiene_permiso('importar_datos'), false) then
    raise exception 'Necesitas el permiso «Importar clientes y mascotas».' using errcode = '42501';
  end if;
  select * into imp from public.importaciones i where i.id = p_id and i.negocio_id = v_neg for update;
  if not found then
    raise exception 'Esa importación no existe.';
  end if;
  if imp.estado not in ('preparada', 'procesando') then
    return public.importacion_progreso(p_id);
  end if;
  if (select count(*) from public.importacion_filas f where f.importacion_id = p_id and f.negocio_id = v_neg) < imp.total_filas then
    raise exception 'Faltan filas por subir de esta importación: vuelve a subir el archivo.';
  end if;
  if imp.estado = 'preparada' then
    update public.importaciones i set estado = 'procesando', iniciada_at = now() where i.id = p_id;
  end if;

  for r in
    select f.id from public.importacion_filas f
    where f.importacion_id = p_id and f.negocio_id = v_neg and f.estado = 'pendiente'
    order by f.n
    limit greatest(1, least(coalesce(p_max, 40), 100))
  loop
    begin
      perform public.importacion_procesar_fila(r.id);
    exception when others then
      get stacked diagnostics v_det = pg_exception_detail;
      v_msg := public.importacion_mensaje_error(sqlstate, sqlerrm, v_det);
      update public.importacion_filas f set estado = 'error', mensaje = v_msg, procesada_at = now() where f.id = r.id;
    end;
  end loop;

  if not exists (select 1 from public.importacion_filas f where f.importacion_id = p_id and f.negocio_id = v_neg and f.estado = 'pendiente') then
    update public.importaciones i set estado = 'completada', terminada_at = now() where i.id = p_id;
  end if;
  return public.importacion_progreso(p_id);
end;
$$;
alter function public.importacion_procesar_lote(uuid, integer) owner to peludesk_definer;

-- Detener una importación a medias: lo ya hecho se queda (y se puede deshacer).
create or replace function public.importacion_cancelar(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  imp public.importaciones%rowtype;
  v_hechas integer;
begin
  if not coalesce(public.tiene_permiso('importar_datos'), false) then
    raise exception 'Necesitas el permiso «Importar clientes y mascotas».' using errcode = '42501';
  end if;
  select * into imp from public.importaciones i where i.id = p_id and i.negocio_id = v_neg for update;
  if not found then
    raise exception 'Esa importación no existe.';
  end if;
  if imp.estado not in ('preparada', 'procesando') then
    raise exception 'Esta importación ya terminó.';
  end if;
  update public.importacion_filas f set estado = 'omitida', mensaje = 'Importación detenida antes de llegar a esta fila.', procesada_at = now()
  where f.importacion_id = p_id and f.negocio_id = v_neg and f.estado = 'pendiente';
  select count(*) into v_hechas from public.importacion_filas f
  where f.importacion_id = p_id and f.negocio_id = v_neg and f.estado in ('creada', 'actualizada');
  update public.importaciones i set
    estado = case when v_hechas = 0 then 'cancelada' else 'completada' end,
    terminada_at = now()
  where i.id = p_id;
  return public.importacion_progreso(p_id);
end;
$$;
alter function public.importacion_cancelar(uuid) owner to peludesk_definer;

-- ── 6. Vista previa de duplicados y razas (mismas búsquedas que el proceso) ──
create or replace function public.importacion_revisar(p_filas jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e jsonb;
  v_salida jsonb := '[]'::jsonb;
  v_cli uuid;
  v_cli_nombre text;
  v_tel text;
  v_perro uuid;
  v_perro_cli uuid;
  v_por text;
  v_raza uuid;
  v_raza_nombre text;
  v_raza_estado text;
begin
  if not coalesce(public.tiene_permiso('importar_datos'), false) then
    raise exception 'Necesitas el permiso «Importar clientes y mascotas».' using errcode = '42501';
  end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) > 1000 then
    raise exception 'La vista previa llega en bloques de hasta 1,000 filas.';
  end if;
  for e in select * from jsonb_array_elements(p_filas) loop
    v_tel := public.importacion_telefono(e->>'telefono');
    v_cli := null; v_cli_nombre := null; v_perro := null; v_perro_cli := null; v_por := null;
    select b.cliente_id, b.nombre into v_cli, v_cli_nombre from public.importacion_buscar_cliente(v_tel) b;
    if nullif(btrim(coalesce(e->>'mascota', '')), '') is not null then
      select b.perro_id, b.perro_cliente_id, b.por into v_perro, v_perro_cli, v_por
      from public.importacion_buscar_perro(v_cli, e->>'microchip', e->>'mascota', coalesce(nullif(e->>'especie', ''), 'perro')) b;
    end if;
    select r.raza_id, r.nombre, r.estado into v_raza, v_raza_nombre, v_raza_estado from public.importacion_raza(e->>'raza') r;
    v_salida := v_salida || jsonb_build_array(jsonb_build_object(
      'n', (e->>'n')::integer,
      'cliente_id', v_cli,
      'cliente_nombre', v_cli_nombre,
      'perro_id', v_perro,
      'perro_por', v_por,
      'perro_de_otro', (v_perro is not null and v_perro_cli is distinct from v_cli),
      'raza_id', v_raza,
      'raza_nombre', v_raza_nombre,
      'raza_estado', v_raza_estado
    ));
  end loop;
  return v_salida;
end;
$$;
alter function public.importacion_revisar(jsonb) owner to peludesk_definer;

-- ── 7. Deshacer ──────────────────────────────────────────────────────────────
-- Qué impediría deshacer: algo se modificó después de la importación, o tiene algo
-- colgando (citas, estancias, cobros, vacunas…) que NO creó la importación.
create or replace function public.importacion_deshacer_revisar(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  imp public.importaciones%rowtype;
  f record;
  fk record;
  v_bloqueos jsonb := '[]'::jsonb;
  v_n bigint;
  v_cli_ids uuid[];
  v_perro_ids uuid[];
  v_perros_nuestros uuid[];
  v_pesos uuid[];
  v_alergias uuid[];
  v_max timestamptz;
  v_actual timestamptz;
  v_etiqueta text;
begin
  if not coalesce(public.tiene_permiso('importar_datos'), false) then
    raise exception 'Necesitas el permiso «Importar clientes y mascotas».' using errcode = '42501';
  end if;
  select * into imp from public.importaciones i where i.id = p_id and i.negocio_id = v_neg;
  if not found then
    raise exception 'Esa importación no existe.';
  end if;
  if imp.estado <> 'completada' then
    return jsonb_build_object('puede', false, 'bloqueos', jsonb_build_array(jsonb_build_object(
      'motivo', case imp.estado when 'deshecha' then 'Esta importación ya se deshizo.' when 'cancelada' then 'No hizo nada que deshacer.' else 'Todavía no termina: espera a que acabe o deténla.' end)));
  end if;

  -- 1) Cualquier cliente o mascota tocado por la importación: ¿alguien lo cambió después?
  for f in
    select ff.cliente_id as id, 'cliente'::text as tipo, max(ff.cliente_updated_at) as sello
    from public.importacion_filas ff
    where ff.importacion_id = p_id and ff.negocio_id = v_neg and ff.estado in ('creada', 'actualizada') and ff.cliente_id is not null
      and (ff.cliente_creado or ff.antes->'cliente' <> '{}'::jsonb)
    group by ff.cliente_id
    union all
    select ff.perro_id, 'mascota', max(ff.perro_updated_at)
    from public.importacion_filas ff
    where ff.importacion_id = p_id and ff.negocio_id = v_neg and ff.estado in ('creada', 'actualizada') and ff.perro_id is not null
      and (ff.perro_creado or ff.antes->'perro' <> '{}'::jsonb)
    group by ff.perro_id
  loop
    if f.tipo = 'cliente' then
      select c.updated_at, c.nombre into v_actual, v_etiqueta from public.clientes c where c.id = f.id;
    else
      select p.updated_at, p.nombre into v_actual, v_etiqueta from public.perros p where p.id = f.id;
    end if;
    if v_actual is null then
      v_bloqueos := v_bloqueos || jsonb_build_array(jsonb_build_object('tipo', f.tipo, 'id', f.id, 'motivo', 'Ya no existe.'));
    elsif v_actual > f.sello then
      v_bloqueos := v_bloqueos || jsonb_build_array(jsonb_build_object('tipo', f.tipo, 'id', f.id, 'nombre', v_etiqueta, 'motivo', 'Se modificó después de la importación.'));
    end if;
  end loop;

  -- 2) Lo que cuelga de lo CREADO y no es de la importación.
  select coalesce(array_agg(distinct ff.cliente_id), '{}') into v_cli_ids
  from public.importacion_filas ff where ff.importacion_id = p_id and ff.negocio_id = v_neg and ff.estado = 'creada' and ff.cliente_creado;
  select coalesce(array_agg(distinct ff.perro_id), '{}') into v_perros_nuestros
  from public.importacion_filas ff where ff.importacion_id = p_id and ff.negocio_id = v_neg and ff.estado = 'creada' and ff.perro_creado;
  select coalesce(array_agg(ff.peso_id) filter (where ff.peso_id is not null), '{}') into v_pesos
  from public.importacion_filas ff where ff.importacion_id = p_id and ff.negocio_id = v_neg and ff.estado in ('creada', 'actualizada');
  select coalesce(array_agg(a), '{}') into v_alergias
  from public.importacion_filas ff, unnest(ff.alergia_ids) a where ff.importacion_id = p_id and ff.negocio_id = v_neg and ff.estado in ('creada', 'actualizada');

  for fk in
    select con.conrelid::regclass::text as tabla, a.attname as columna, con.confrelid::regclass::text as destino
    from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'f' and cardinality(con.conkey) = 1
      and con.confrelid in ('public.clientes'::regclass, 'public.perros'::regclass)
      and con.conrelid::regclass::text not in ('public.importacion_filas')
      and con.connamespace = 'public'::regnamespace
  loop
    if fk.destino = 'public.clientes' then
      if cardinality(v_cli_ids) = 0 then continue; end if;
      -- Las mascotas creadas por esta importación cuelgan de su dueño: no cuentan.
      execute format(
        'select count(*) from %s t where t.%I = any($1) and not ((to_jsonb(t)->>''id'') = any($2::text[]) and $3)',
        fk.tabla, fk.columna)
        into v_n using v_cli_ids, (select coalesce(array_agg(x::text), '{}') from unnest(v_perros_nuestros) x), (fk.tabla = 'public.perros');
    else
      if cardinality(v_perros_nuestros) = 0 then continue; end if;
      execute format(
        'select count(*) from %s t where t.%I = any($1) and not (case %L
            when ''public.pesos_registrados'' then (to_jsonb(t)->>''id'') = any($2::text[])
            when ''public.perro_alergias'' then (to_jsonb(t)->>''id'') = any($3::text[])
            else false end)',
        fk.tabla, fk.columna, fk.tabla)
        into v_n using v_perros_nuestros, (select coalesce(array_agg(x::text), '{}') from unnest(v_pesos) x), (select coalesce(array_agg(x::text), '{}') from unnest(v_alergias) x);
    end if;
    if v_n > 0 then
      v_bloqueos := v_bloqueos || jsonb_build_array(jsonb_build_object(
        'tipo', fk.destino, 'tabla', fk.tabla, 'cuenta', v_n,
        'motivo', 'Ya tiene registros que no son de la importación (' || replace(fk.tabla, 'public.', '') || ').'));
    end if;
  end loop;

  return jsonb_build_object('puede', jsonb_array_length(v_bloqueos) = 0, 'bloqueos', v_bloqueos);
end;
$$;
alter function public.importacion_deshacer_revisar(uuid) owner to peludesk_definer;

create or replace function public.importacion_deshacer(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_rev jsonb;
  f record;
  a jsonb;
  v_bajas integer := 0;
  v_restauradas integer := 0;
  v_nuevo timestamptz;
begin
  if not coalesce(public.tiene_permiso('importar_datos'), false) then
    raise exception 'Necesitas el permiso «Importar clientes y mascotas».' using errcode = '42501';
  end if;
  perform 1 from public.importaciones i where i.id = p_id and i.negocio_id = v_neg for update;
  v_rev := public.importacion_deshacer_revisar(p_id);
  if not (v_rev->>'puede')::boolean then
    raise exception 'No se puede deshacer: %', coalesce(v_rev->'bloqueos'->0->>'motivo', 'algo cambió')
      using detail = v_rev::text;
  end if;

  -- Restaurar lo actualizado (en orden inverso: el valor MÁS VIEJO gana).
  for f in
    select * from public.importacion_filas ff
    where ff.importacion_id = p_id and ff.negocio_id = v_neg and ff.estado = 'actualizada'
    order by ff.n desc
  loop
    a := f.antes->'cliente';
    if a is not null and a <> '{}'::jsonb and f.cliente_id is not null then
      update public.clientes c set
        nombre = case when a ? 'nombre' then a->>'nombre' else c.nombre end,
        email = case when a ? 'email' then a->>'email' else c.email end,
        direccion = case when a ? 'direccion' then a->>'direccion' else c.direccion end
      where c.id = f.cliente_id
      returning c.updated_at into v_nuevo;
      -- Una importación anterior sobre este dueño sigue "sin tocar" si nadie más lo cambió entre las dos.
      update public.importacion_filas g set cliente_updated_at = v_nuevo
      where g.negocio_id = v_neg and g.cliente_id = f.cliente_id and g.importacion_id <> p_id
        and g.estado in ('creada', 'actualizada') and g.cliente_updated_at = f.cliente_previo_updated_at;
      v_restauradas := v_restauradas + 1;
    end if;
    a := f.antes->'perro';
    if a is not null and a <> '{}'::jsonb and f.perro_id is not null then
      update public.perros p set
        raza_id = case when a ? 'raza_id' then (a->>'raza_id')::uuid else p.raza_id end,
        raza = case when a ? 'raza' then a->>'raza' else p.raza end,
        sexo = case when a ? 'sexo' then a->>'sexo' else p.sexo end,
        esterilizado = case when a ? 'esterilizado' then (a->>'esterilizado')::boolean else p.esterilizado end,
        fecha_nacimiento = case when a ? 'fecha_nacimiento' then (a->>'fecha_nacimiento')::date else p.fecha_nacimiento end,
        tamano_id = case when a ? 'tamano_id' then (a->>'tamano_id')::uuid else p.tamano_id end,
        pelaje_id = case when a ? 'pelaje_id' then (a->>'pelaje_id')::uuid else p.pelaje_id end,
        folio_registro = case when a ? 'folio_registro' then a->>'folio_registro' else p.folio_registro end,
        microchip = case when a ? 'microchip' then a->>'microchip' else p.microchip end
      where p.id = f.perro_id
      returning p.updated_at into v_nuevo;
      update public.importacion_filas g set perro_updated_at = v_nuevo
      where g.negocio_id = v_neg and g.perro_id = f.perro_id and g.importacion_id <> p_id
        and g.estado in ('creada', 'actualizada') and g.perro_updated_at = f.perro_previo_updated_at;
      v_restauradas := v_restauradas + 1;
    end if;
  end loop;

  -- Pesos y alergias que la importación agregó (de mascotas nuevas o existentes).
  update public.pesos_registrados w set deleted_at = now()
  where w.negocio_id = v_neg and w.deleted_at is null and w.id in (
    select ff.peso_id from public.importacion_filas ff
    where ff.importacion_id = p_id and ff.negocio_id = v_neg and ff.peso_id is not null and ff.estado in ('creada', 'actualizada'));
  update public.perro_alergias w set deleted_at = now()
  where w.negocio_id = v_neg and w.deleted_at is null and w.id in (
    select a2 from public.importacion_filas ff, unnest(ff.alergia_ids) a2
    where ff.importacion_id = p_id and ff.negocio_id = v_neg and ff.estado in ('creada', 'actualizada'));

  -- Mascotas y clientes creados: baja lógica (nunca se borra).
  update public.perros p set deleted_at = now()
  where p.negocio_id = v_neg and p.deleted_at is null and p.id in (
    select ff.perro_id from public.importacion_filas ff
    where ff.importacion_id = p_id and ff.negocio_id = v_neg and ff.estado = 'creada' and ff.perro_creado);
  get diagnostics v_bajas = row_count;
  update public.clientes c set deleted_at = now()
  where c.negocio_id = v_neg and c.deleted_at is null and c.id in (
    select ff.cliente_id from public.importacion_filas ff
    where ff.importacion_id = p_id and ff.negocio_id = v_neg and ff.estado = 'creada' and ff.cliente_creado);

  update public.importacion_filas ff set estado = 'deshecha'
  where ff.importacion_id = p_id and ff.negocio_id = v_neg and ff.estado in ('creada', 'actualizada');
  update public.importaciones i set estado = 'deshecha', deshecha_at = now(), deshecha_por = auth.uid() where i.id = p_id;
  return public.importacion_progreso(p_id);
end;
$$;
alter function public.importacion_deshacer(uuid) owner to peludesk_definer;

-- ── 8. Autoguardado de formularios ───────────────────────────────────────────
create or replace function public.borrador_guardar(p_formulario text, p_clave text, p_datos jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_uid uuid := auth.uid();
  v_ahora timestamptz := now();
begin
  if v_uid is null or not public.es_miembro() then
    raise exception 'Inicia sesión para guardar un borrador.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_datos) <> 'object' then
    raise exception 'El borrador debe ser un objeto.';
  end if;
  -- Los borradores viejos se limpian solos (30 días).
  delete from public.formulario_borradores b where b.negocio_id = v_neg and b.usuario_id = v_uid and b.updated_at < now() - interval '30 days';
  insert into public.formulario_borradores (usuario_id, formulario, clave, datos)
  values (v_uid, p_formulario, coalesce(p_clave, ''), p_datos)
  on conflict (negocio_id, usuario_id, formulario, clave)
  do update set datos = excluded.datos, deleted_at = null;
  return v_ahora;
end;
$$;
alter function public.borrador_guardar(text, text, jsonb) owner to peludesk_definer;

create or replace function public.borrador_leer(p_formulario text, p_clave text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('datos', b.datos, 'guardado_at', b.updated_at)
  from public.formulario_borradores b
  where b.negocio_id = public.negocio_actual() and b.usuario_id = auth.uid()
    and b.formulario = p_formulario and b.clave = coalesce(p_clave, '') and b.deleted_at is null
$$;
alter function public.borrador_leer(text, text) owner to peludesk_definer;

create or replace function public.borrador_descartar(p_formulario text, p_clave text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.formulario_borradores b
  where b.negocio_id = public.negocio_actual() and b.usuario_id = auth.uid()
    and b.formulario = p_formulario and b.clave = coalesce(p_clave, '')
$$;
alter function public.borrador_descartar(text, text) owner to peludesk_definer;

-- ── 9. Permisos de ejecución ─────────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'importacion_telefono(text)', 'importacion_microchip(text)', 'importacion_raza(text)', 'importacion_buscar_cliente(text)',
    'importacion_buscar_perro(uuid, text, text, text)', 'importacion_mensaje_error(text, text, text)',
    'importacion_crear(text, text, text, boolean, jsonb, integer)', 'importacion_agregar_filas(uuid, jsonb)',
    'importacion_progreso(uuid)', 'importacion_procesar_lote(uuid, integer)', 'importacion_cancelar(uuid)',
    'importacion_revisar(jsonb)', 'importacion_deshacer_revisar(uuid)', 'importacion_deshacer(uuid)',
    'borrador_guardar(text, text, jsonb)', 'borrador_leer(text, text)', 'borrador_descartar(text, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role, peludesk_definer', f);
  end loop;
  -- Los ayudantes que consultan tablas no se ofrecen a la API: solo los usan las funciones.
  foreach f in array array['importacion_raza(text)', 'importacion_buscar_cliente(text)', 'importacion_buscar_perro(uuid, text, text, text)'] loop
    execute format('revoke execute on function public.%s from authenticated', f);
  end loop;
end $$;

-- ── 10. demo_vaciar ──────────────────────────────────────────────────────────
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.demo_vaciar(uuid)'::regprocedure) into v_def;
  if position('importacion_filas' in v_def) = 0 then
    v_def := replace(v_def, $a$'adelantos', 'asistencia_correcciones'$a$,
      $b$'importacion_filas', 'importaciones', 'formulario_borradores', 'adelantos', 'asistencia_correcciones'$b$);
    if position('importacion_filas' in v_def) = 0 then
      raise exception 'demo_vaciar cambió: no se pudieron agregar las tablas del importador.';
    end if;
    execute v_def;
  end if;
end $$;
