-- Veterinaria, Fase 3 · parte 3: estimados de consulta y cirugía (carril A).
--
-- · ESTIMADO VERSIONADO. Un estimado (consulta o cirugía) es una lista de líneas —servicios,
--   procedimientos e insumos del inventario— cada una con un MÍNIMO y un MÁXIMO. Nace como
--   borrador, se envía (liga con token, solo se guarda su sha256) y queda CONGELADO: cambiarlo es
--   crear una versión nueva, que reemplaza a la anterior y apaga su liga. Un estimado aceptado no
--   se toca; si hay más que cobrar se hace otro (una ampliación).
-- · ACEPTACIÓN. El dueño lo acepta por la liga (nombre escrito + firma dibujada, con hora, IP y
--   navegador) o en el mostrador (la persona que lo registra deja su nombre; la firma es opcional).
--   La base comprueba que el contenido no cambió desde que se envió (hash).
-- · AL ACEPTAR, cada línea pasa a un CARGO de la cuenta de la mascota con su MÍNIMO (lo seguro; lo
--   demás se agrega como cargo cuando ocurre, hasta el máximo sin pedir otra aceptación). Usa las
--   cuentas (`reservas`) y los cargos (`cargos_aplicados`) de siempre —como la hospitalización—, así
--   que se cobra en Caja y en «cobrar junto» y se factura como cualquier cuenta: aquí no se toca
--   ninguna tabla de cobros, caja ni facturación. Si la mascota está hospitalizada, los cargos van a
--   la cuenta de su hospitalización (una sola cuenta de la mascota); si no, se abre una cuenta para
--   el estimado. Un insumo en el estimado NO descuenta existencias: eso ocurre cuando se usa.
-- · Las lecturas se anotan (`vet_lecturas`) y el estimado no se lee directo por la API: todo pasa por
--   funciones que comprueban «Crear estimados» (o leer el expediente).

create table public.vet_estimados (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  perro_id uuid not null references public.perros(id),
  cliente_id uuid not null references public.clientes(id),
  consulta_id uuid references public.vet_consultas(id),
  cita_id uuid references public.vet_citas(id),
  -- Todas las versiones de un mismo estimado comparten `grupo_id`.
  grupo_id uuid not null,
  version int not null default 1 check (version >= 1),
  tipo text not null check (tipo in ('consulta', 'cirugia')),
  titulo text not null check (btrim(titulo) <> ''),
  notas text,
  medico_id uuid references public.medicos_veterinarios(id),
  estado text not null default 'borrador' check (estado in ('borrador', 'enviado', 'aceptado', 'rechazado', 'reemplazado', 'cancelado')),
  vigente_hasta date not null,
  total_min numeric(12,2) not null default 0 check (total_min >= 0),
  total_max numeric(12,2) not null default 0 check (total_max >= total_min),
  hash_contenido text,
  token_hash text,
  enviado_at timestamptz,
  enviado_por uuid references auth.users(id) on delete set null,
  aceptado_at timestamptz,
  aceptado_via text check (aceptado_via in ('liga', 'mostrador')),
  aceptado_nombre text,
  firma_png text check (firma_png is null or length(firma_png) <= 300000),
  aceptado_ip text,
  aceptado_ua text,
  aceptado_por uuid references auth.users(id) on delete set null,
  reserva_id uuid references public.reservas(id),
  rechazado_at timestamptz,
  rechazo_motivo text,
  cancelado_at timestamptz,
  cancelado_por uuid references auth.users(id) on delete set null,
  cancelado_motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (grupo_id, version),
  check (estado <> 'aceptado' or (aceptado_at is not null and aceptado_via is not null and aceptado_nombre is not null and reserva_id is not null)),
  check (estado <> 'cancelado' or cancelado_motivo is not null)
);
create unique index vet_estimados_vigente on public.vet_estimados (grupo_id) where estado in ('borrador', 'enviado', 'aceptado') and deleted_at is null;
create unique index vet_estimados_token on public.vet_estimados (token_hash) where token_hash is not null;
create index vet_estimados_perro_idx on public.vet_estimados (perro_id, created_at desc);
create index vet_estimados_estado_idx on public.vet_estimados (negocio_id, estado, enviado_at);
select public._vet_redes('vet_estimados', 'false');

create table public.vet_estimado_lineas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  estimado_id uuid not null references public.vet_estimados(id),
  orden int not null default 0,
  tipo text not null check (tipo in ('servicio', 'procedimiento', 'insumo')),
  descripcion text not null check (btrim(descripcion) <> ''),
  cantidad numeric(10,2) not null check (cantidad > 0),
  unidad text,
  precio_min numeric(12,2) not null check (precio_min >= 0),
  precio_max numeric(12,2) not null check (precio_max >= precio_min),
  insumo_id uuid references public.insumos(id),
  -- El cargo en que se convirtió la línea al aceptar el estimado.
  cargo_id uuid references public.cargos_aplicados(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index vet_estimado_lineas_idx on public.vet_estimado_lineas (estimado_id, orden);
select public._vet_redes('vet_estimado_lineas', 'false');

-- Un estimado enviado o resuelto no se edita: se hace otra versión. Un borrador sí.
create or replace function public.vet_estimado_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_libres text[] := array['estado', 'updated_at', 'aceptado_at', 'aceptado_via', 'aceptado_nombre', 'firma_png', 'aceptado_ip', 'aceptado_ua', 'aceptado_por',
                           'reserva_id', 'rechazado_at', 'rechazo_motivo', 'cancelado_at', 'cancelado_por', 'cancelado_motivo', 'token_hash'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Un estimado no se borra: se cancela con un motivo o se hace una versión nueva.' using errcode = '42501';
  end if;
  if old.estado = 'borrador' then
    return new;
  end if;
  if old.estado = 'enviado' then
    -- La liga se puede renovar (token_hash/enviado_*) mientras sigue enviado; el contenido no cambia.
    if new.estado = 'enviado' then
      if (to_jsonb(new) - v_libres - 'enviado_at' - 'enviado_por') is distinct from (to_jsonb(old) - v_libres - 'enviado_at' - 'enviado_por') then
        raise exception 'Un estimado enviado no se edita: haz una versión nueva.' using errcode = '42501';
      end if;
      return new;
    end if;
    if new.estado in ('aceptado', 'rechazado', 'reemplazado', 'cancelado')
       and (to_jsonb(new) - v_libres) is not distinct from (to_jsonb(old) - v_libres) then
      return new;
    end if;
  end if;
  raise exception 'Este estimado ya está resuelto y no se edita.' using errcode = '42501';
end;
$$;
revoke execute on function public.vet_estimado_inmutable() from public, anon, authenticated;
alter function public.vet_estimado_inmutable() owner to peludesk_definer;
create trigger vet_estimado_inmutable before update or delete on public.vet_estimados
  for each row execute function public.vet_estimado_inmutable();

create or replace function public.vet_estimado_linea_guarda()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_estado text;
  v_id uuid := coalesce(new.estimado_id, old.estimado_id);
begin
  select e.estado into v_estado from public.vet_estimados e where e.id = v_id;
  if v_estado = 'borrador' then
    return coalesce(new, old);
  end if;
  -- Al aceptar, cada línea guarda su cargo; nada más cambia.
  if tg_op = 'UPDATE' and v_estado in ('enviado', 'aceptado')
     and (to_jsonb(new) - 'cargo_id' - 'updated_at') is not distinct from (to_jsonb(old) - 'cargo_id' - 'updated_at') then
    return new;
  end if;
  raise exception 'Las líneas de un estimado enviado no se editan: haz una versión nueva.' using errcode = '42501';
end;
$$;
revoke execute on function public.vet_estimado_linea_guarda() from public, anon, authenticated;
alter function public.vet_estimado_linea_guarda() owner to peludesk_definer;
create trigger vet_estimado_linea_guarda before insert or update or delete on public.vet_estimado_lineas
  for each row execute function public.vet_estimado_linea_guarda();

-- ── Funciones ────────────────────────────────────────────────────────

-- Lo que el dueño acepta: el título, las líneas y la vigencia, tal cual.
create or replace function public.vet_estimado_hash(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'id', e.id, 'version', e.version, 'tipo', e.tipo, 'titulo', e.titulo, 'notas', e.notas, 'vigente_hasta', e.vigente_hasta,
    'lineas', coalesce((select jsonb_agg(jsonb_build_array(l.tipo, l.descripcion, l.cantidad, l.unidad, l.precio_min, l.precio_max) order by l.orden, l.id)
                        from public.vet_estimado_lineas l where l.estimado_id = e.id and l.deleted_at is null), '[]'::jsonb))::text, 'UTF8')), 'hex')
  from public.vet_estimados e where e.id = p_id;
$$;

create or replace function public.vet_estimado_puede()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.vet_puede('crear_estimados'), false);
$$;

create or replace function public.vet_estimado_poner_lineas(p_id uuid, p_lineas jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_x jsonb;
  v_i int := 0;
  v_min numeric;
  v_max numeric;
  v_cant numeric;
  v_insumo uuid;
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) not between 1 and 60 then
    raise exception 'El estimado lleva de 1 a 60 líneas.';
  end if;
  delete from public.vet_estimado_lineas where estimado_id = p_id;
  for v_x in select * from jsonb_array_elements(p_lineas) loop
    v_i := v_i + 1;
    if coalesce(v_x ->> 'tipo', '') not in ('servicio', 'procedimiento', 'insumo') then
      raise exception 'Línea %: el tipo es servicio, procedimiento o insumo.', v_i;
    end if;
    if btrim(coalesce(v_x ->> 'descripcion', '')) = '' or length(v_x ->> 'descripcion') > 200 then
      raise exception 'Línea %: escribe qué es (hasta 200 caracteres).', v_i;
    end if;
    begin
      v_cant := (v_x ->> 'cantidad')::numeric;
      v_min := (v_x ->> 'precio_min')::numeric;
      v_max := coalesce(nullif(v_x ->> 'precio_max', '')::numeric, v_min);
    exception when others then
      raise exception 'Línea %: cantidad y precios tienen que ser números.', v_i;
    end;
    if v_cant is null or v_cant <= 0 or v_cant > 100000 then
      raise exception 'Línea %: la cantidad tiene que ser mayor a cero.', v_i;
    end if;
    if v_min is null or v_min < 0 or v_max < v_min or v_max > 10000000 then
      raise exception 'Línea %: el precio mínimo no puede ser mayor al máximo ni negativo.', v_i;
    end if;
    v_insumo := nullif(v_x ->> 'insumo_id', '')::uuid;
    if v_insumo is not null and not exists (select 1 from public.insumos s where s.id = v_insumo and s.negocio_id = public.negocio_actual() and s.deleted_at is null) then
      raise exception 'Línea %: ese insumo no existe.', v_i;
    end if;
    insert into public.vet_estimado_lineas (estimado_id, orden, tipo, descripcion, cantidad, unidad, precio_min, precio_max, insumo_id)
    values (p_id, v_i, v_x ->> 'tipo', btrim(v_x ->> 'descripcion'), v_cant, nullif(btrim(coalesce(v_x ->> 'unidad', '')), ''), v_min, v_max, v_insumo);
  end loop;
  update public.vet_estimados e set
    total_min = coalesce((select sum(round(l.cantidad * l.precio_min, 2)) from public.vet_estimado_lineas l where l.estimado_id = p_id), 0),
    total_max = coalesce((select sum(round(l.cantidad * l.precio_max, 2)) from public.vet_estimado_lineas l where l.estimado_id = p_id), 0)
   where e.id = p_id;
end;
$$;

create or replace function public.vet_estimado_guardar(
  p_id uuid, p_perro uuid, p_consulta uuid, p_cita uuid, p_tipo text, p_titulo text, p_notas text, p_vigente_hasta date, p_medico uuid, p_lineas jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_perro record;
  v_e record;
  v_medico uuid;
  v_vigente date;
begin
  if not public.vet_estimado_puede() then
    raise exception 'Crear estimados es de un médico veterinario, de admin o de quien tenga «Crear estimados».' using errcode = '42501';
  end if;
  if p_tipo not in ('consulta', 'cirugia') then
    raise exception 'El estimado es de consulta o de cirugía.';
  end if;
  if btrim(coalesce(p_titulo, '')) = '' then
    raise exception 'Escribe un título para el estimado.';
  end if;
  v_vigente := coalesce(p_vigente_hasta, public.fecha_negocio() + 15);
  if v_vigente < public.fecha_negocio() then
    raise exception 'La vigencia no puede ser anterior a hoy.';
  end if;
  v_medico := public.vet_medico_firma(p_medico, false);
  if v_medico is null then
    v_medico := public.vet_mi_medico();
  end if;
  if p_id is null then
    select p.id, p.cliente_id, p.fallecido into v_perro from public.perros p
     where p.id = p_perro and p.negocio_id = public.negocio_actual() and p.deleted_at is null;
    if v_perro.id is null then
      raise exception 'Esa mascota no existe.';
    end if;
    if p_consulta is not null and not exists (select 1 from public.vet_consultas c where c.id = p_consulta and c.perro_id = p_perro and c.negocio_id = public.negocio_actual() and c.deleted_at is null) then
      raise exception 'Esa consulta no es de esa mascota.';
    end if;
    if p_cita is not null and not exists (select 1 from public.vet_citas c where c.id = p_cita and c.perro_id = p_perro and c.negocio_id = public.negocio_actual() and c.deleted_at is null) then
      raise exception 'Esa cita no es de esa mascota.';
    end if;
    v_id := gen_random_uuid();
    insert into public.vet_estimados (id, perro_id, cliente_id, consulta_id, cita_id, grupo_id, tipo, titulo, notas, medico_id, vigente_hasta)
    values (v_id, p_perro, v_perro.cliente_id, p_consulta, p_cita, v_id, p_tipo, btrim(p_titulo), nullif(btrim(coalesce(p_notas, '')), ''), v_medico, v_vigente);
  else
    select e.id, e.estado into v_e from public.vet_estimados e where e.id = p_id and e.negocio_id = public.negocio_actual() and e.deleted_at is null;
    if v_e.id is null then
      raise exception 'Ese estimado no existe.';
    end if;
    if v_e.estado <> 'borrador' then
      raise exception 'Solo se edita un borrador: haz una versión nueva.';
    end if;
    update public.vet_estimados set tipo = p_tipo, titulo = btrim(p_titulo), notas = nullif(btrim(coalesce(p_notas, '')), ''), vigente_hasta = v_vigente, medico_id = v_medico
     where id = p_id;
  end if;
  perform public.vet_estimado_poner_lineas(v_id, p_lineas);
  return v_id;
end;
$$;

-- Envía el estimado (o renueva su liga): congela el contenido y guarda el hash del token.
create or replace function public.vet_estimado_enviar(p_id uuid, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e record;
  v_hash text;
begin
  if not public.vet_estimado_puede() then
    raise exception 'Enviar estimados es de un médico veterinario, de admin o de quien tenga «Crear estimados».' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Token inválido.';
  end if;
  select e.id, e.estado, e.total_max, e.vigente_hasta, e.perro_id into v_e from public.vet_estimados e
   where e.id = p_id and e.negocio_id = public.negocio_actual() and e.deleted_at is null;
  if v_e.id is null then
    raise exception 'Ese estimado no existe.';
  end if;
  if v_e.estado not in ('borrador', 'enviado') then
    raise exception 'Ese estimado ya está resuelto: haz uno nuevo.';
  end if;
  if v_e.total_max <= 0 then
    raise exception 'El estimado no tiene importes: agrega los precios antes de enviarlo.';
  end if;
  if v_e.vigente_hasta < public.fecha_negocio() then
    raise exception 'La vigencia ya pasó: cambia la fecha o haz una versión nueva.';
  end if;
  v_hash := public.vet_estimado_hash(p_id);
  update public.vet_estimados set estado = 'enviado', hash_contenido = coalesce(hash_contenido, v_hash), token_hash = p_token_hash, enviado_at = now(), enviado_por = auth.uid()
   where id = p_id;
  perform public.vet_registrar_lectura(v_e.perro_id, 'estimado', p_id);
  return jsonb_build_object('id', p_id, 'hash', coalesce((select hash_contenido from public.vet_estimados where id = p_id), v_hash));
end;
$$;

create or replace function public.vet_estimado_nueva_version(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e record;
  v_id uuid := gen_random_uuid();
begin
  if not public.vet_estimado_puede() then
    raise exception 'Crear estimados es de un médico veterinario, de admin o de quien tenga «Crear estimados».' using errcode = '42501';
  end if;
  select e.* into v_e from public.vet_estimados e where e.id = p_id and e.negocio_id = public.negocio_actual() and e.deleted_at is null;
  if v_e.id is null then
    raise exception 'Ese estimado no existe.';
  end if;
  if v_e.estado = 'aceptado' then
    raise exception 'Ese estimado ya fue aceptado y sus cargos están en la cuenta: para agregar algo, crea un estimado nuevo.';
  end if;
  if v_e.estado in ('reemplazado', 'cancelado') then
    raise exception 'Esa versión ya no está vigente: parte de la última.';
  end if;
  if v_e.estado = 'borrador' then
    raise exception 'Ese estimado es un borrador: edítalo directamente.';
  end if;
  if exists (select 1 from public.vet_estimados x where x.grupo_id = v_e.grupo_id and x.version > v_e.version and x.deleted_at is null) then
    raise exception 'Ya hay una versión más nueva de este estimado.';
  end if;
  -- La versión enviada deja de valer (su liga se apaga); una rechazada se queda como historia.
  if v_e.estado = 'enviado' then
    update public.vet_estimados set estado = 'reemplazado', token_hash = null where id = p_id;
  end if;
  insert into public.vet_estimados (id, perro_id, cliente_id, consulta_id, cita_id, grupo_id, version, tipo, titulo, notas, medico_id, vigente_hasta, total_min, total_max)
  values (v_id, v_e.perro_id, v_e.cliente_id, v_e.consulta_id, v_e.cita_id, v_e.grupo_id, v_e.version + 1, v_e.tipo, v_e.titulo, v_e.notas, v_e.medico_id,
          greatest(v_e.vigente_hasta, public.fecha_negocio() + 15), v_e.total_min, v_e.total_max);
  insert into public.vet_estimado_lineas (estimado_id, orden, tipo, descripcion, cantidad, unidad, precio_min, precio_max, insumo_id)
  select v_id, l.orden, l.tipo, l.descripcion, l.cantidad, l.unidad, l.precio_min, l.precio_max, l.insumo_id
    from public.vet_estimado_lineas l where l.estimado_id = p_id and l.deleted_at is null;
  return v_id;
end;
$$;

create or replace function public.vet_estimado_cancelar(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e record;
begin
  if not public.vet_estimado_puede() then
    raise exception 'Cancelar un estimado es de un médico veterinario, de admin o de quien tenga «Crear estimados».' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribe por qué se cancela.';
  end if;
  select e.id, e.estado into v_e from public.vet_estimados e where e.id = p_id and e.negocio_id = public.negocio_actual() and e.deleted_at is null;
  if v_e.id is null then
    raise exception 'Ese estimado no existe.';
  end if;
  if v_e.estado not in ('borrador', 'enviado') then
    raise exception 'Solo se cancela un borrador o un estimado enviado sin respuesta.';
  end if;
  update public.vet_estimados set estado = 'cancelado', token_hash = null, cancelado_at = now(), cancelado_por = auth.uid(), cancelado_motivo = btrim(p_motivo) where id = p_id;
end;
$$;

-- Los conceptos de monto libre con que el estimado entra a la cuenta.
create or replace function public.vet_servicio_cargo_estimado(p_tipo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clave text := 'vet_est_' || p_tipo;
  v_nombre text := case p_tipo
    when 'servicio' then 'Servicios veterinarios (estimado)'
    when 'procedimiento' then 'Procedimientos veterinarios (estimado)'
    else 'Insumos y medicamentos (estimado)' end;
  v_id uuid;
begin
  select s.id into v_id from public.servicios s where s.negocio_id = public.negocio_actual() and s.clave = v_clave and s.deleted_at is null;
  if v_id is null then
    insert into public.servicios (clave, nombre, categoria, unidad, monto_libre, orden)
    values (v_clave, v_nombre, 'cargo', 'evento', true, 910)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Acepta el estimado y lo pasa a la cuenta de la mascota. Lo llaman la aceptación en mostrador y la
-- de la liga (cada una ya comprobó lo suyo).
create or replace function public.vet_estimado_aceptar_interno(
  p_id uuid, p_via text, p_nombre text, p_firma text, p_ip text, p_ua text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e record;
  v_perro record;
  v_reserva uuid;
  v_l record;
  v_cargo uuid;
  v_importe numeric;
  v_n int := 0;
begin
  select e.* into v_e from public.vet_estimados e where e.id = p_id and e.negocio_id = public.negocio_actual() and e.deleted_at is null for update;
  if v_e.id is null then
    raise exception 'Ese estimado no existe.';
  end if;
  if v_e.estado not in ('borrador', 'enviado') then
    raise exception 'Ese estimado ya no se puede aceptar (está %).', v_e.estado;
  end if;
  if v_e.vigente_hasta < public.fecha_negocio() then
    raise exception 'La vigencia de este estimado ya pasó.';
  end if;
  select p.nombre, p.cliente_id into v_perro from public.perros p where p.id = v_e.perro_id;
  -- La cuenta: la de su hospitalización si está internada; si no, una cuenta nueva para el estimado.
  select h.reserva_id into v_reserva from public.hospitalizaciones h
   where h.perro_id = v_e.perro_id and h.estado = 'ingresado' and h.deleted_at is null and h.negocio_id = public.negocio_actual() limit 1;
  if v_reserva is null then
    insert into public.reservas (cliente_id, notas) values (v_e.cliente_id, 'Estimado: ' || v_e.titulo || ' — ' || v_perro.nombre) returning id into v_reserva;
  end if;
  for v_l in select * from public.vet_estimado_lineas l where l.estimado_id = p_id and l.deleted_at is null order by l.orden loop
    v_importe := round(v_l.cantidad * v_l.precio_min, 2);
    if v_importe > 0 then
      insert into public.cargos_aplicados (reserva_id, perro_id, servicio_id, cantidad, precio, descripcion)
      values (v_reserva, v_e.perro_id, public.vet_servicio_cargo_estimado(v_l.tipo), 1, v_importe,
              case when v_l.cantidad = 1 then v_l.descripcion else trim(trailing '.' from trim(trailing '0' from v_l.cantidad::text)) || ' × ' || v_l.descripcion end)
      returning id into v_cargo;
      update public.vet_estimado_lineas set cargo_id = v_cargo where id = v_l.id;
      v_n := v_n + 1;
    end if;
  end loop;
  update public.vet_estimados set
    estado = 'aceptado', aceptado_at = now(), aceptado_via = p_via, aceptado_nombre = btrim(p_nombre), firma_png = nullif(p_firma, ''),
    aceptado_ip = p_ip, aceptado_ua = left(p_ua, 300), aceptado_por = case when p_via = 'mostrador' then auth.uid() else null end,
    reserva_id = v_reserva, hash_contenido = coalesce(hash_contenido, public.vet_estimado_hash(p_id))
   where id = p_id;
  return jsonb_build_object('id', p_id, 'reserva_id', v_reserva, 'cargos', v_n);
end;
$$;

create or replace function public.vet_estimado_aceptar_mostrador(p_id uuid, p_nombre text, p_firma text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e record;
begin
  if not public.vet_estimado_puede() then
    raise exception 'Registrar la aceptación es de un médico veterinario, de admin o de quien tenga «Crear estimados».' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'Escribe el nombre de quien acepta el estimado.';
  end if;
  select e.id, e.estado, e.total_max, e.perro_id into v_e from public.vet_estimados e where e.id = p_id and e.negocio_id = public.negocio_actual() and e.deleted_at is null;
  if v_e.id is null then
    raise exception 'Ese estimado no existe.';
  end if;
  if v_e.total_max <= 0 then
    raise exception 'El estimado no tiene importes.';
  end if;
  perform public.vet_registrar_lectura(v_e.perro_id, 'estimado', p_id);
  return public.vet_estimado_aceptar_interno(p_id, 'mostrador', p_nombre, p_firma, null, null);
end;
$$;

-- Lecturas para el equipo.
create or replace function public.vet_estimado_detalle(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e record;
begin
  if not (public.vet_estimado_puede() or public.vet_puede_leer()) then
    raise exception 'Ver estimados es de un médico veterinario, de admin o de quien tenga «Crear estimados».' using errcode = '42501';
  end if;
  select e.* into v_e from public.vet_estimados e where e.id = p_id and e.negocio_id = public.negocio_actual() and e.deleted_at is null;
  if v_e.id is null then
    raise exception 'Ese estimado no existe.';
  end if;
  perform public.vet_registrar_lectura(v_e.perro_id, 'estimado', p_id);
  return jsonb_build_object(
    'estimado', to_jsonb(v_e) - 'negocio_id' - 'token_hash' - 'created_by' - 'deleted_at' - 'firma_png',
    'tiene_firma', v_e.firma_png is not null,
    'firma_png', v_e.firma_png,
    'enviado_con_liga', v_e.token_hash is not null,
    'vencido', v_e.estado in ('borrador', 'enviado') and v_e.vigente_hasta < public.fecha_negocio(),
    'integro', v_e.hash_contenido is null or v_e.hash_contenido = public.vet_estimado_hash(p_id),
    'lineas', coalesce((select jsonb_agg(to_jsonb(l) - 'negocio_id' - 'created_by' - 'deleted_at' order by l.orden) from public.vet_estimado_lineas l where l.estimado_id = p_id and l.deleted_at is null), '[]'::jsonb),
    'mascota', (select jsonb_build_object('id', p.id, 'nombre', p.nombre, 'especie', p.especie) from public.perros p where p.id = v_e.perro_id),
    'dueno', (select jsonb_build_object('id', c.id, 'nombre', c.nombre, 'telefono', c.telefono) from public.clientes c where c.id = v_e.cliente_id),
    'medico', (select jsonb_build_object('id', m.id, 'nombre', coalesce(pr.nombre_completo, 'Sin nombre'), 'cedula', m.cedula_profesional)
               from public.medicos_veterinarios m left join public.profiles pr on pr.id = m.profile_id where m.id = v_e.medico_id),
    'versiones', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'version', x.version, 'estado', x.estado, 'total_min', x.total_min, 'total_max', x.total_max) order by x.version)
                           from public.vet_estimados x where x.grupo_id = v_e.grupo_id and x.deleted_at is null), '[]'::jsonb),
    'cuenta', case when v_e.reserva_id is not null then (select jsonb_build_object('reserva_id', v_e.reserva_id) ) else null end
  );
end;
$$;

create or replace function public.vet_estimados_de_mascota(p_perro uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.vet_estimado_puede() or public.vet_puede_leer()) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'titulo', e.titulo, 'tipo', e.tipo, 'version', e.version, 'estado', e.estado, 'total_min', e.total_min,
        'total_max', e.total_max, 'vigente_hasta', e.vigente_hasta, 'consulta_id', e.consulta_id, 'creado', e.created_at,
        'vencido', e.estado in ('borrador', 'enviado') and e.vigente_hasta < public.fecha_negocio()) order by e.created_at desc)
    from public.vet_estimados e where e.perro_id = p_perro and e.negocio_id = public.negocio_actual() and e.deleted_at is null
  ), '[]'::jsonb);
end;
$$;

create or replace function public.vet_estimados_lista(p_estado text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vet_estimado_puede() then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'titulo', e.titulo, 'tipo', e.tipo, 'version', e.version, 'estado', e.estado, 'total_min', e.total_min,
        'total_max', e.total_max, 'vigente_hasta', e.vigente_hasta, 'creado', e.created_at, 'enviado_at', e.enviado_at, 'mascota', p.nombre, 'perro_id', e.perro_id,
        'dueno', c.nombre, 'vencido', e.estado in ('borrador', 'enviado') and e.vigente_hasta < public.fecha_negocio()) order by e.created_at desc)
    from (select * from public.vet_estimados x where x.negocio_id = public.negocio_actual() and x.deleted_at is null
            and (p_estado is null or x.estado = p_estado) order by x.created_at desc limit 300) e
    join public.perros p on p.id = e.perro_id join public.clientes c on c.id = e.cliente_id
  ), '[]'::jsonb);
end;
$$;

-- ── La liga del dueño (solo el servidor, con el hash del token) ──────

create or replace function public.estimado_publico(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  select e.* into v_e from public.vet_estimados e
   where e.token_hash = p_token_hash and e.negocio_id = public.negocio_actual() and e.deleted_at is null;
  if v_e.id is null or not coalesce(public.modulo_activo('veterinaria'), false) then
    return null;
  end if;
  return jsonb_build_object(
    'negocio', (select n.nombre from public.negocios n where n.id = v_e.negocio_id),
    'mascota', (select p.nombre from public.perros p where p.id = v_e.perro_id),
    'dueno', (select c.nombre from public.clientes c where c.id = v_e.cliente_id),
    'medico', (select jsonb_build_object('nombre', coalesce(pr.nombre_completo, 'Médico veterinario'), 'cedula', m.cedula_profesional)
               from public.medicos_veterinarios m left join public.profiles pr on pr.id = m.profile_id where m.id = v_e.medico_id),
    'tipo', v_e.tipo, 'titulo', v_e.titulo, 'notas', v_e.notas, 'version', v_e.version, 'estado', v_e.estado,
    'vigente_hasta', v_e.vigente_hasta,
    'vencido', v_e.estado = 'enviado' and v_e.vigente_hasta < public.fecha_negocio(),
    'integro', v_e.hash_contenido is not null and v_e.hash_contenido = public.vet_estimado_hash(v_e.id),
    'total_min', v_e.total_min, 'total_max', v_e.total_max,
    'aceptado_at', v_e.aceptado_at, 'aceptado_nombre', v_e.aceptado_nombre, 'rechazado_at', v_e.rechazado_at,
    'lineas', coalesce((select jsonb_agg(jsonb_build_object('tipo', l.tipo, 'descripcion', l.descripcion, 'cantidad', l.cantidad, 'unidad', l.unidad,
                                                           'precio_min', l.precio_min, 'precio_max', l.precio_max) order by l.orden)
                        from public.vet_estimado_lineas l where l.estimado_id = v_e.id and l.deleted_at is null), '[]'::jsonb)
  );
end;
$$;

create or replace function public.estimado_aceptar_publico(p_token_hash text, p_nombre text, p_firma text, p_ip text, p_ua text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'Escribe tu nombre completo para aceptar.';
  end if;
  if p_firma is null or length(p_firma) < 200 or length(p_firma) > 300000 or p_firma not like 'data:image/png;base64,%' then
    raise exception 'Dibuja tu firma para aceptar.';
  end if;
  select e.id, e.estado, e.hash_contenido, e.vigente_hasta into v_e from public.vet_estimados e
   where e.token_hash = p_token_hash and e.negocio_id = public.negocio_actual() and e.deleted_at is null;
  if v_e.id is null then
    raise exception 'Esta liga ya no es válida.';
  end if;
  if v_e.estado <> 'enviado' then
    raise exception 'Este estimado ya no está disponible para aceptar.';
  end if;
  if v_e.hash_contenido is null or v_e.hash_contenido <> public.vet_estimado_hash(v_e.id) then
    raise exception 'El contenido del estimado cambió después de enviarlo: pide uno nuevo a la clínica.';
  end if;
  return public.vet_estimado_aceptar_interno(v_e.id, 'liga', p_nombre, p_firma, p_ip, p_ua);
end;
$$;

create or replace function public.estimado_rechazar_publico(p_token_hash text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  select e.id, e.estado into v_e from public.vet_estimados e
   where e.token_hash = p_token_hash and e.negocio_id = public.negocio_actual() and e.deleted_at is null;
  if v_e.id is null or v_e.estado <> 'enviado' then
    raise exception 'Este estimado ya no está disponible.';
  end if;
  update public.vet_estimados set estado = 'rechazado', rechazado_at = now(), rechazo_motivo = nullif(left(btrim(coalesce(p_motivo, '')), 500), '') where id = v_e.id;
end;
$$;

-- ── «Necesita atención»: estimados enviados sin respuesta ────────────
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.veterinaria_atencion()'::regprocedure);
  if v_def not like '%estimados_sin_respuesta%' then
    v_def := replace(v_def,
      E'else null end\n  );\nend;',
      E'else null end,\n    -- Estimados enviados que el dueño no ha contestado en tres días.\n    ''estimados_sin_respuesta'', case when public.vet_puede(''crear_estimados'') then\n        (select count(*) from public.vet_estimados e where e.negocio_id = public.negocio_actual() and e.deleted_at is null and e.estado = ''enviado''\n            and e.enviado_at < now() - interval ''72 hours'') else 0 end,\n    ''estimado_mas_viejo'', case when public.vet_puede(''crear_estimados'') then\n        (select min(e.enviado_at) from public.vet_estimados e where e.negocio_id = public.negocio_actual() and e.deleted_at is null and e.estado = ''enviado''\n            and e.enviado_at < now() - interval ''72 hours'') else null end\n  );\nend;');
    if v_def not like '%estimados_sin_respuesta%' then
      raise exception 'No se pudo parchar veterinaria_atencion: cambió su texto.';
    end if;
    execute v_def;
  end if;
end;
$$;

-- ── Dueños y grants ──────────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'vet_estimado_hash(uuid)', 'vet_estimado_puede()', 'vet_estimado_poner_lineas(uuid,jsonb)',
    'vet_estimado_guardar(uuid,uuid,uuid,uuid,text,text,text,date,uuid,jsonb)', 'vet_estimado_enviar(uuid,text)',
    'vet_estimado_nueva_version(uuid)', 'vet_estimado_cancelar(uuid,text)', 'vet_servicio_cargo_estimado(text)',
    'vet_estimado_aceptar_interno(uuid,text,text,text,text,text)', 'vet_estimado_aceptar_mostrador(uuid,text,text)',
    'vet_estimado_detalle(uuid)', 'vet_estimados_de_mascota(uuid)', 'vet_estimados_lista(text)',
    'estimado_publico(text)', 'estimado_aceptar_publico(text,text,text,text,text)', 'estimado_rechazar_publico(text,text)',
    'veterinaria_atencion()'
  ] loop
    execute format('alter function public.%s owner to peludesk_definer', f);
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  -- Internas: solo las llaman otras funciones, ya con sus permisos comprobados.
  foreach f in array array['vet_estimado_poner_lineas(uuid,jsonb)', 'vet_servicio_cargo_estimado(text)', 'vet_estimado_aceptar_interno(uuid,text,text,text,text,text)'] loop
    execute format('revoke execute on function public.%s from authenticated', f);
  end loop;
  -- Solo el servidor (la liga del dueño).
  foreach f in array array['estimado_publico(text)', 'estimado_aceptar_publico(text,text,text,text,text)', 'estimado_rechazar_publico(text,text)'] loop
    execute format('revoke execute on function public.%s from authenticated', f);
  end loop;
end;
$$;

-- El ayudante de redes ya no hace falta.
drop function public._vet_redes(text, text);
