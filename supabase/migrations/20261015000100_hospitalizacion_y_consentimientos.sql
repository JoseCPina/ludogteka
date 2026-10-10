-- Veterinaria, Fase 1 · parte 2: hospitalización y consentimientos informados (carril A).
--
-- · HOSPITALIZACIÓN propia del módulo (funciona con Hotel apagado). Cada ingreso abre
--   una CUENTA (`reservas`) de su dueño y todo lo que se cobra cuelga de ella como
--   cargos de monto libre (`cargos_aplicados`), así que se cobra en Caja y en «cobrar
--   junto» como cualquier cuenta: aquí no se toca ninguna tabla de cobros.
--     ingreso → motivo, médico responsable, ubicación, depósito opcional
--     hoja de medicación → indicaciones con sus dosis programadas por horario; marcar una
--       dosis guarda quién y cuándo, descuenta el lote y (si lleva precio) la cobra
--     monitoreo → temperatura, peso, frecuencias y notas, con el turno
--     alta → resumen, cierra las dosis pendientes, completa los días y aplica el depósito
-- · DEPÓSITO. Se cobra como una línea de la cuenta («Depósito de hospitalización»). Al dar
--   el alta esa línea se cancela (con motivo) y lo que se debe lo dicen los cargos reales:
--   si el depósito fue mayor, queda un saldo a favor que se devuelve con la devolución de siempre.
-- · CONSENTIMIENTOS. Plantillas por negocio y versionadas (hospitalización, cirugía,
--   anestesia, eutanasia) que se editan con el permiso de plantillas de contrato. Cada
--   consentimiento guarda una FOTO del texto vigente; se firma con el mismo PDF y la misma
--   evidencia (hora, IP, hash) que un contrato.

-- ── 1. Hospitalizaciones ─────────────────────────────────────────────
create table public.hospitalizaciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  perro_id uuid not null references public.perros(id),
  cliente_id uuid not null references public.clientes(id),
  reserva_id uuid not null references public.reservas(id),
  medico_id uuid not null references public.medicos_veterinarios(id),
  motivo text not null check (btrim(motivo) <> ''),
  ubicacion text,
  estado text not null default 'ingresado' check (estado in ('ingresado', 'alta')),
  ingreso_at timestamptz not null default now(),
  alta_at timestamptz,
  alta_por uuid references auth.users(id) on delete set null,
  resumen_alta text,
  precio_dia numeric(12,2) check (precio_dia is null or precio_dia >= 0),
  deposito numeric(12,2) not null default 0 check (deposito >= 0),
  deposito_cargo_id uuid references public.cargos_aplicados(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check ((estado = 'alta') = (alta_at is not null))
);
create unique index hospitalizaciones_uno_por_perro on public.hospitalizaciones (perro_id) where estado = 'ingresado' and deleted_at is null;
create index hospitalizaciones_estado_idx on public.hospitalizaciones (negocio_id, estado, ingreso_at);
select public._vet_redes('hospitalizaciones', '(select public.is_staff())');

create table public.hospitalizacion_medicacion (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  hospitalizacion_id uuid not null references public.hospitalizaciones(id),
  producto text not null check (btrim(producto) <> ''),
  insumo_id uuid references public.insumos(id),
  dosis text not null check (btrim(dosis) <> ''),
  via text,
  -- Cada cuántas horas (vacío = una sola dosis).
  frecuencia_horas int check (frecuencia_horas is null or frecuencia_horas between 1 and 168),
  primera_dosis_at timestamptz not null,
  num_dosis int not null default 1 check (num_dosis between 1 and 200),
  -- Lo que se cobra por cada dosis aplicada (vacío = no se cobra aparte).
  precio_dosis numeric(12,2) check (precio_dosis is null or precio_dosis >= 0),
  indicaciones text,
  medico_id uuid not null references public.medicos_veterinarios(id),
  suspendida_at timestamptz,
  suspendida_por uuid references auth.users(id) on delete set null,
  suspendida_motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check ((suspendida_at is null) = (suspendida_motivo is null))
);
create index hospitalizacion_medicacion_hosp_idx on public.hospitalizacion_medicacion (hospitalizacion_id);
select public._vet_redes('hospitalizacion_medicacion', '(select public.is_staff())');

create table public.hospitalizacion_cargos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  hospitalizacion_id uuid not null references public.hospitalizaciones(id),
  cargo_id uuid not null references public.cargos_aplicados(id),
  tipo text not null check (tipo in ('deposito', 'dia', 'medicamento', 'procedimiento', 'otro')),
  fecha date,
  descripcion text not null,
  importe numeric(12,2) not null check (importe >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index hospitalizacion_cargos_un_dia on public.hospitalizacion_cargos (hospitalizacion_id, fecha) where tipo = 'dia' and deleted_at is null;
create index hospitalizacion_cargos_hosp_idx on public.hospitalizacion_cargos (hospitalizacion_id);
select public._vet_redes('hospitalizacion_cargos', '(select public.is_staff())');

create table public.hospitalizacion_dosis (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  hospitalizacion_id uuid not null references public.hospitalizaciones(id),
  medicacion_id uuid not null references public.hospitalizacion_medicacion(id),
  programada_at timestamptz not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aplicada', 'omitida')),
  aplicada_at timestamptz,
  aplicada_por uuid references auth.users(id) on delete set null,
  lote_id uuid references public.insumo_lotes(id),
  lote_texto text,
  lote_movimiento_id uuid references public.movimientos_inventario(id),
  cargo_id uuid references public.cargos_aplicados(id),
  motivo_omision text,
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check ((estado = 'aplicada') = (aplicada_at is not null)),
  check (estado <> 'omitida' or motivo_omision is not null)
);
create index hospitalizacion_dosis_hosp_idx on public.hospitalizacion_dosis (hospitalizacion_id, programada_at);
create index hospitalizacion_dosis_pendientes_idx on public.hospitalizacion_dosis (negocio_id, programada_at) where estado = 'pendiente';
select public._vet_redes('hospitalizacion_dosis', '(select public.is_staff())');

create table public.hospitalizacion_monitoreo (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  hospitalizacion_id uuid not null references public.hospitalizaciones(id),
  registrado_at timestamptz not null default now(),
  turno text not null check (turno in ('matutino', 'vespertino', 'nocturno')),
  temperatura_c numeric(4,1) check (temperatura_c is null or temperatura_c between 30 and 45),
  peso_kg numeric(6,2) check (peso_kg is null or peso_kg > 0),
  frecuencia_cardiaca int check (frecuencia_cardiaca is null or frecuencia_cardiaca between 10 and 400),
  frecuencia_respiratoria int check (frecuencia_respiratoria is null or frecuencia_respiratoria between 2 and 200),
  notas text,
  registrado_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (temperatura_c is not null or peso_kg is not null or frecuencia_cardiaca is not null or frecuencia_respiratoria is not null or nullif(btrim(coalesce(notas, '')), '') is not null)
);
create index hospitalizacion_monitoreo_hosp_idx on public.hospitalizacion_monitoreo (hospitalizacion_id, registrado_at desc);
select public._vet_redes('hospitalizacion_monitoreo', '(select public.is_staff())');

-- El monitoreo solo se agrega: una lectura mal tomada se corrige con otra y una nota.
create or replace function public.vet_solo_agregar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Este registro clínico no se edita ni se borra: agrega uno nuevo.' using errcode = '42501';
end;
$$;
revoke execute on function public.vet_solo_agregar() from public, anon, authenticated;
create trigger vet_solo_agregar before update or delete on public.hospitalizacion_monitoreo
  for each row execute function public.vet_solo_agregar();
create trigger vet_solo_agregar before update or delete on public.hospitalizacion_cargos
  for each row execute function public.vet_solo_agregar();

-- ── 2. Consentimientos ───────────────────────────────────────────────
create table public.consentimientos_plantillas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  tipo text not null check (tipo in ('hospitalizacion', 'cirugia', 'anestesia', 'eutanasia')),
  version int not null,
  titulo text not null check (btrim(titulo) <> ''),
  cuerpo text not null check (btrim(cuerpo) <> ''),
  activa boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (negocio_id, tipo, version)
);
create unique index consentimientos_plantillas_activa on public.consentimientos_plantillas (negocio_id, tipo) where activa and deleted_at is null;
select public._vet_redes('consentimientos_plantillas', '(select public.is_staff())');

create table public.consentimientos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  perro_id uuid not null references public.perros(id),
  cliente_id uuid not null references public.clientes(id),
  hospitalizacion_id uuid references public.hospitalizaciones(id),
  tipo text not null check (tipo in ('hospitalizacion', 'cirugia', 'anestesia', 'eutanasia')),
  plantilla_id uuid not null references public.consentimientos_plantillas(id),
  titulo text not null,
  cuerpo text not null,
  procedimiento text,
  medico_id uuid not null references public.medicos_veterinarios(id),
  estado text not null default 'pendiente_firma' check (estado in ('pendiente_firma', 'firmado', 'cancelado')),
  firmante_nombre text,
  firmado_at timestamptz,
  firmado_por uuid references auth.users(id) on delete set null,
  firma_metodo text check (firma_metodo is null or firma_metodo in ('mostrador', 'papel')),
  ip_firma text,
  hash_pdf text,
  storage_path text,
  cancelado_at timestamptz,
  cancelado_motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check ((estado = 'firmado') = (firmado_at is not null)),
  check ((estado = 'cancelado') = (cancelado_at is not null))
);
create index consentimientos_perro_idx on public.consentimientos (perro_id, created_at desc);
create index consentimientos_hosp_idx on public.consentimientos (hospitalizacion_id) where hospitalizacion_id is not null;
select public._vet_redes('consentimientos', '(select public.is_staff())');

-- Firmado es firmado: solo cambia pendiente → firmado o cancelado.
create or replace function public.consentimiento_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un consentimiento no se borra: se cancela con motivo.' using errcode = '42501';
  end if;
  if old.estado <> 'pendiente_firma' then
    raise exception 'Un consentimiento %s ya no se modifica.', old.estado using errcode = '42501';
  end if;
  if new.titulo is distinct from old.titulo or new.cuerpo is distinct from old.cuerpo or new.perro_id <> old.perro_id
     or new.tipo <> old.tipo or new.procedimiento is distinct from old.procedimiento or new.medico_id <> old.medico_id then
    raise exception 'El texto de un consentimiento no se cambia: cancélalo y crea otro.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.consentimiento_inmutable() from public, anon, authenticated;
create trigger consentimiento_inmutable before update or delete on public.consentimientos
  for each row execute function public.consentimiento_inmutable();

-- Textos base (neutros) por tipo. El negocio los edita y su asesor legal los revisa.
create or replace function public.vet_sembrar_consentimientos()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t text;
  v_titulo text;
  v_cuerpo text;
begin
  for v_t in select unnest(array['hospitalizacion', 'cirugia', 'anestesia', 'eutanasia']) loop
    if exists (select 1 from public.consentimientos_plantillas p where p.negocio_id = public.negocio_actual() and p.tipo = v_t and p.deleted_at is null) then
      continue;
    end if;
    v_titulo := case v_t
      when 'hospitalizacion' then 'Consentimiento informado para hospitalización'
      when 'cirugia' then 'Consentimiento informado para cirugía'
      when 'anestesia' then 'Consentimiento informado para anestesia'
      else 'Consentimiento informado para eutanasia' end;
    v_cuerpo := case v_t
      when 'hospitalizacion' then
'Yo, {{cliente_nombre}}, propietario(a) o responsable de la mascota {{mascota_nombre}} ({{especie}}, {{raza}}), autorizo su hospitalización en {{establecimiento}} por el siguiente motivo: {{motivo}}.

Fui informado(a) por el médico veterinario {{medico_nombre}} (cédula profesional {{medico_cedula}}) de la condición de mi mascota, de la atención que recibirá durante su estancia, de que puede haber estudios, medicamentos y procedimientos adicionales según su evolución, y de que todo tratamiento implica riesgos que no pueden descartarse por completo.

Entiendo que los costos de la hospitalización se acumulan en una cuenta que se liquida al dar el alta, y que debo mantenerme localizable en el teléfono que dejé registrado.

Fecha: {{fecha}}'
      when 'cirugia' then
'Yo, {{cliente_nombre}}, propietario(a) o responsable de la mascota {{mascota_nombre}} ({{especie}}, {{raza}}), autorizo que se le practique el siguiente procedimiento quirúrgico: {{procedimiento}}, en {{establecimiento}}.

El médico veterinario {{medico_nombre}} (cédula profesional {{medico_cedula}}) me explicó en qué consiste, para qué se hace, sus alternativas y los riesgos propios de toda cirugía y de la anestesia, incluida la posibilidad de complicaciones graves o de muerte. Pude hacer preguntas y fueron contestadas.

Autorizo que, si durante el procedimiento se presenta una situación imprevista que ponga en riesgo la vida de mi mascota, el equipo médico actúe como considere necesario.

Fecha: {{fecha}}'
      when 'anestesia' then
'Yo, {{cliente_nombre}}, propietario(a) o responsable de la mascota {{mascota_nombre}} ({{especie}}, {{raza}}), autorizo que se le administre anestesia o sedación para el siguiente fin: {{procedimiento}}, en {{establecimiento}}.

El médico veterinario {{medico_nombre}} (cédula profesional {{medico_cedula}}) me explicó que toda anestesia o sedación conlleva riesgos, aun en animales sanos, que pueden incluir reacciones adversas, complicaciones respiratorias o cardiacas y, en casos poco frecuentes, la muerte. Informé de buena fe las condiciones de salud, medicamentos y alimentación reciente de mi mascota.

Fecha: {{fecha}}'
      else
'Yo, {{cliente_nombre}}, propietario(a) o responsable de la mascota {{mascota_nombre}} ({{especie}}, {{raza}}), solicito y autorizo su eutanasia en {{establecimiento}}.

El médico veterinario {{medico_nombre}} (cédula profesional {{medico_cedula}}) me explicó la condición de mi mascota, las alternativas disponibles y en qué consiste el procedimiento. Entiendo que es irreversible y que lo decido de manera libre e informada. Declaro que soy el(la) propietario(a) o tengo la facultad de decidir sobre esta mascota.

Fecha: {{fecha}}'
      end;
    insert into public.consentimientos_plantillas (tipo, version, titulo, cuerpo, activa) values (v_t, 1, v_titulo, v_cuerpo, true);
  end loop;
end;
$$;

create or replace function public.consentimientos_plantillas_lista()
returns table (id uuid, tipo text, version int, titulo text, cuerpo text, activa boolean, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_staff(), false) or not coalesce(public.modulo_activo('veterinaria'), false) then
    raise exception 'Solo el personal del negocio con Veterinaria prendida.' using errcode = '42501';
  end if;
  if public.negocio_escribible() then
    perform public.vet_sembrar_consentimientos();
  end if;
  return query
  select p.id, p.tipo, p.version, p.titulo, p.cuerpo, p.activa, p.created_at
  from public.consentimientos_plantillas p
  where p.negocio_id = public.negocio_actual() and p.deleted_at is null and p.activa
  order by array_position(array['hospitalizacion', 'cirugia', 'anestesia', 'eutanasia'], p.tipo);
end;
$$;

-- Editar = publicar una versión nueva (la anterior se conserva: los consentimientos ya
-- creados llevan su propia copia del texto).
create or replace function public.guardar_plantilla_consentimiento(p_tipo text, p_titulo text, p_cuerpo text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_v int;
begin
  if not coalesce(public.modulo_activo('veterinaria'), false) then
    raise exception 'Veterinaria está apagada en este negocio.';
  end if;
  if not coalesce(public.tiene_permiso('plantillas_contrato'), false) then
    raise exception 'Editar los consentimientos es de admin o de quien tenga «Plantillas de contrato».' using errcode = '42501';
  end if;
  if p_tipo not in ('hospitalizacion', 'cirugia', 'anestesia', 'eutanasia') then
    raise exception 'Tipo de consentimiento inválido.';
  end if;
  if btrim(coalesce(p_titulo, '')) = '' or btrim(coalesce(p_cuerpo, '')) = '' then
    raise exception 'El título y el texto no pueden quedar vacíos.';
  end if;
  perform public.vet_sembrar_consentimientos();
  select coalesce(max(version), 0) + 1 into v_v from public.consentimientos_plantillas where negocio_id = public.negocio_actual() and tipo = p_tipo;
  update public.consentimientos_plantillas set activa = false where negocio_id = public.negocio_actual() and tipo = p_tipo and activa;
  insert into public.consentimientos_plantillas (tipo, version, titulo, cuerpo, activa) values (p_tipo, v_v, btrim(p_titulo), btrim(p_cuerpo), true);
  return v_v;
end;
$$;

-- Los datos que llenan las variables de un consentimiento.
create or replace function public.consentimiento_campos(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v record;
  v_hosp text;
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal del negocio.' using errcode = '42501';
  end if;
  select c.id, c.procedimiento, c.hospitalizacion_id, cl.nombre as cliente, p.nombre as mascota, p.especie, coalesce(rz.nombre, p.raza) as raza,
         pr.nombre_completo as medico, m.cedula_profesional as cedula, n.nombre as negocio, c.firmado_at
    into v
    from public.consentimientos c
    join public.perros p on p.id = c.perro_id
    join public.clientes cl on cl.id = c.cliente_id
    join public.medicos_veterinarios m on m.id = c.medico_id
    join public.profiles pr on pr.id = m.profile_id
    join public.negocios n on n.id = c.negocio_id
    left join public.razas rz on rz.id = p.raza_id
   where c.id = p_id and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v.id is null then
    raise exception 'Ese consentimiento no existe.';
  end if;
  if v.hospitalizacion_id is not null then
    select h.motivo into v_hosp from public.hospitalizaciones h where h.id = v.hospitalizacion_id;
  end if;
  return jsonb_build_object(
    'cliente_nombre', v.cliente, 'mascota_nombre', v.mascota, 'especie', coalesce(initcap(v.especie), 'Perro'), 'raza', coalesce(v.raza, 'sin raza'),
    'motivo', coalesce(v_hosp, v.procedimiento, ''), 'procedimiento', coalesce(v.procedimiento, v_hosp, ''),
    'medico_nombre', v.medico, 'medico_cedula', coalesce(v.cedula, ''), 'establecimiento', v.negocio,
    'fecha', to_char(public.fecha_negocio(), 'DD/MM/YYYY')
  );
end;
$$;

create or replace function public.crear_consentimiento(p_perro_id uuid, p_tipo text, p_hospitalizacion_id uuid, p_procedimiento text, p_medico_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perro record;
  v_pl record;
  v_medico uuid;
  v_id uuid;
begin
  if not public.vet_puede('hospitalizar') then
    raise exception 'Crear un consentimiento es de un médico veterinario, de admin o de quien tenga «Hospitalizar y medicar».' using errcode = '42501';
  end if;
  if p_tipo not in ('hospitalizacion', 'cirugia', 'anestesia', 'eutanasia') then
    raise exception 'Tipo de consentimiento inválido.';
  end if;
  select p.id, p.cliente_id, p.fallecido into v_perro from public.perros p where p.id = p_perro_id and p.negocio_id = public.negocio_actual() and p.deleted_at is null;
  if v_perro.id is null then
    raise exception 'Esa mascota no existe.';
  end if;
  if p_hospitalizacion_id is not null and not exists (
       select 1 from public.hospitalizaciones h where h.id = p_hospitalizacion_id and h.negocio_id = public.negocio_actual() and h.perro_id = p_perro_id and h.deleted_at is null) then
    raise exception 'Esa hospitalización no es de esta mascota.';
  end if;
  if p_tipo in ('cirugia', 'anestesia') and btrim(coalesce(p_procedimiento, '')) = '' then
    raise exception 'Escribe el procedimiento que se va a realizar.';
  end if;
  v_medico := public.vet_medico_firma(p_medico_id, true);
  perform public.vet_sembrar_consentimientos();
  select * into v_pl from public.consentimientos_plantillas p
   where p.negocio_id = public.negocio_actual() and p.tipo = p_tipo and p.activa and p.deleted_at is null;
  if v_pl.id is null then
    raise exception 'No hay una plantilla vigente para ese consentimiento.';
  end if;
  insert into public.consentimientos (perro_id, cliente_id, hospitalizacion_id, tipo, plantilla_id, titulo, cuerpo, procedimiento, medico_id)
  values (p_perro_id, v_perro.cliente_id, p_hospitalizacion_id, p_tipo, v_pl.id, v_pl.titulo, v_pl.cuerpo, nullif(btrim(coalesce(p_procedimiento, '')), ''), v_medico)
  returning id into v_id;
  return v_id;
end;
$$;

-- La firma ya la armó el servidor (PDF con hora, IP y hash); aquí solo queda el estado.
create or replace function public.consentimiento_registrar_firma(p_id uuid, p_firmante text, p_metodo text, p_ip text, p_hash text, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vet_puede('hospitalizar') then
    raise exception 'Firmar un consentimiento en el mostrador es de un médico veterinario, de admin o de quien tenga «Hospitalizar y medicar».' using errcode = '42501';
  end if;
  if p_metodo not in ('mostrador', 'papel') then
    raise exception 'Método de firma inválido.';
  end if;
  if btrim(coalesce(p_firmante, '')) = '' then
    raise exception 'Escribe el nombre de quien firma.';
  end if;
  update public.consentimientos
     set estado = 'firmado', firmado_at = now(), firmado_por = auth.uid(), firmante_nombre = btrim(p_firmante), firma_metodo = p_metodo,
         ip_firma = p_ip, hash_pdf = p_hash, storage_path = p_path
   where id = p_id and negocio_id = public.negocio_actual() and estado = 'pendiente_firma' and deleted_at is null;
  if not found then
    raise exception 'Ese consentimiento ya no está pendiente de firma.';
  end if;
end;
$$;

create or replace function public.cancelar_consentimiento(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vet_puede('hospitalizar') then
    raise exception 'Cancelar un consentimiento es de un médico veterinario, de admin o de quien tenga «Hospitalizar y medicar».' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo.';
  end if;
  update public.consentimientos set estado = 'cancelado', cancelado_at = now(), cancelado_motivo = btrim(p_motivo)
   where id = p_id and negocio_id = public.negocio_actual() and estado = 'pendiente_firma' and deleted_at is null;
  if not found then
    raise exception 'Solo se cancela un consentimiento que sigue pendiente de firma; uno firmado queda como evidencia.';
  end if;
end;
$$;

-- ── 3. Hospitalización: cargos a la cuenta ───────────────────────────

-- El servicio de cargo (monto libre) de cada tipo de cobro de hospitalización, creado la
-- primera vez que se usa: aparece en reportes con su nombre.
create or replace function public.vet_servicio_cargo(p_tipo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clave text := 'vet_hosp_' || p_tipo;
  v_nombre text := case p_tipo
    when 'deposito' then 'Depósito de hospitalización'
    when 'dia' then 'Hospitalización (día)'
    when 'medicamento' then 'Medicamentos de hospitalización'
    when 'procedimiento' then 'Procedimientos de hospitalización'
    else 'Otros cargos de hospitalización' end;
  v_id uuid;
begin
  select s.id into v_id from public.servicios s where s.negocio_id = public.negocio_actual() and s.clave = v_clave and s.deleted_at is null;
  if v_id is null then
    insert into public.servicios (clave, nombre, categoria, unidad, monto_libre, orden)
    values (v_clave, v_nombre, 'cargo', 'evento', true, 900)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Agrega un cargo a la cuenta de la hospitalización y lo deja ligado.
create or replace function public.vet_cargar(p_hosp uuid, p_tipo text, p_descripcion text, p_importe numeric, p_fecha date, p_dosis uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_h record;
  v_cargo uuid;
begin
  select h.id, h.reserva_id, h.perro_id into v_h from public.hospitalizaciones h where h.id = p_hosp and h.negocio_id = public.negocio_actual();
  if v_h.id is null then
    raise exception 'Esa hospitalización no existe.';
  end if;
  insert into public.cargos_aplicados (reserva_id, perro_id, servicio_id, cantidad, precio, descripcion)
  values (v_h.reserva_id, v_h.perro_id, public.vet_servicio_cargo(p_tipo), 1, p_importe, p_descripcion)
  returning id into v_cargo;
  insert into public.hospitalizacion_cargos (hospitalizacion_id, cargo_id, tipo, fecha, descripcion, importe)
  values (p_hosp, v_cargo, p_tipo, p_fecha, p_descripcion, p_importe);
  if p_dosis is not null then
    update public.hospitalizacion_dosis set cargo_id = v_cargo where id = p_dosis;
  end if;
  return v_cargo;
end;
$$;

-- Un día de hospitalización por cada fecha del negocio desde el ingreso hasta hoy. Idempotente.
create or replace function public.hospitalizacion_completar_dias(p_hosp uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_h record;
  v_zona text := public.zona_negocio();
  v_desde date;
  v_hasta date;
  v_f date;
  v_n int := 0;
begin
  select h.id, h.estado, h.precio_dia, h.ingreso_at, h.alta_at into v_h from public.hospitalizaciones h
   where h.id = p_hosp and h.negocio_id = public.negocio_actual() and h.deleted_at is null;
  if v_h.id is null or coalesce(v_h.precio_dia, 0) <= 0 then
    return 0;
  end if;
  v_desde := (v_h.ingreso_at at time zone v_zona)::date;
  v_hasta := case when v_h.estado = 'alta' then (v_h.alta_at at time zone v_zona)::date else public.fecha_negocio() end;
  for v_f in select generate_series(v_desde, v_hasta, interval '1 day')::date loop
    if not exists (select 1 from public.hospitalizacion_cargos c where c.hospitalizacion_id = p_hosp and c.tipo = 'dia' and c.fecha = v_f and c.deleted_at is null) then
      perform public.vet_cargar(p_hosp, 'dia', 'Hospitalización — día ' || (v_f - v_desde + 1) || ' (' || to_char(v_f, 'DD/MM/YYYY') || ')', v_h.precio_dia, v_f);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- ── 4. Hospitalización: operación ────────────────────────────────────

create or replace function public.hospitalizar_ingresar(
  p_perro_id uuid, p_medico_id uuid, p_motivo text, p_ubicacion text, p_deposito numeric, p_precio_dia numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perro record;
  v_medico uuid;
  v_reserva uuid;
  v_id uuid := gen_random_uuid();
  v_precio numeric;
  v_dep uuid;
begin
  if not public.vet_puede('hospitalizar') then
    raise exception 'Hospitalizar es de un médico veterinario, de admin o de quien tenga «Hospitalizar y medicar».' using errcode = '42501';
  end if;
  select p.id, p.nombre, p.cliente_id, p.fallecido into v_perro from public.perros p where p.id = p_perro_id and p.negocio_id = public.negocio_actual() and p.deleted_at is null;
  if v_perro.id is null then
    raise exception 'Esa mascota no existe.';
  end if;
  if v_perro.fallecido then
    raise exception 'Esa mascota está marcada como fallecida.';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Escribe el motivo del ingreso.';
  end if;
  if coalesce(p_deposito, 0) < 0 then
    raise exception 'El depósito no puede ser negativo.';
  end if;
  if exists (select 1 from public.hospitalizaciones h where h.perro_id = p_perro_id and h.estado = 'ingresado' and h.deleted_at is null) then
    raise exception 'Esa mascota ya está hospitalizada.';
  end if;
  v_medico := public.vet_medico_firma(p_medico_id, true);
  v_precio := coalesce(p_precio_dia, (select a.hospitalizacion_precio_dia from public.veterinaria_ajustes a where a.negocio_id = public.negocio_actual() and a.deleted_at is null));
  if coalesce(v_precio, 0) < 0 then
    raise exception 'El precio del día no puede ser negativo.';
  end if;

  insert into public.reservas (cliente_id, notas) values (v_perro.cliente_id, 'Hospitalización: ' || v_perro.nombre) returning id into v_reserva;
  insert into public.hospitalizaciones (id, perro_id, cliente_id, reserva_id, medico_id, motivo, ubicacion, precio_dia, deposito)
  values (v_id, p_perro_id, v_perro.cliente_id, v_reserva, v_medico, btrim(p_motivo), nullif(btrim(coalesce(p_ubicacion, '')), ''), nullif(v_precio, 0), coalesce(p_deposito, 0));
  if coalesce(p_deposito, 0) > 0 then
    v_dep := public.vet_cargar(v_id, 'deposito', 'Depósito inicial de hospitalización', p_deposito, null);
    update public.hospitalizaciones set deposito_cargo_id = v_dep where id = v_id;
  end if;
  perform public.hospitalizacion_completar_dias(v_id);
  return jsonb_build_object('id', v_id, 'reserva_id', v_reserva);
end;
$$;

create or replace function public.hospitalizar_agregar_cargo(p_hosp uuid, p_tipo text, p_descripcion text, p_importe numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  if not public.vet_puede('hospitalizar') then
    raise exception 'Agregar cargos es de un médico veterinario, de admin o de quien tenga «Hospitalizar y medicar».' using errcode = '42501';
  end if;
  if p_tipo not in ('procedimiento', 'otro') then
    raise exception 'El cargo es un procedimiento u otro concepto.';
  end if;
  if btrim(coalesce(p_descripcion, '')) = '' then
    raise exception 'Escribe qué se cobra.';
  end if;
  if p_importe is null or p_importe <= 0 then
    raise exception 'El importe tiene que ser mayor a cero.';
  end if;
  select h.estado into v_estado from public.hospitalizaciones h where h.id = p_hosp and h.negocio_id = public.negocio_actual() and h.deleted_at is null;
  if v_estado is null then
    raise exception 'Esa hospitalización no existe.';
  end if;
  if v_estado <> 'ingresado' then
    raise exception 'La mascota ya salió: no se agregan cargos a una hospitalización dada de alta.';
  end if;
  return public.vet_cargar(p_hosp, p_tipo, btrim(p_descripcion), p_importe, null);
end;
$$;

create or replace function public.hospitalizar_indicar_medicacion(
  p_hosp uuid, p_producto text, p_insumo_id uuid, p_dosis text, p_via text, p_frecuencia_horas int,
  p_primera_dosis timestamptz, p_num_dosis int, p_precio_dosis numeric, p_indicaciones text, p_medico_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
  v_medico uuid;
  v_prod text := nullif(btrim(coalesce(p_producto, '')), '');
  v_id uuid;
  v_n int := coalesce(p_num_dosis, 1);
  v_i int;
begin
  if not public.vet_puede('hospitalizar') then
    raise exception 'Indicar medicación es de un médico veterinario, de admin o de quien tenga «Hospitalizar y medicar».' using errcode = '42501';
  end if;
  select h.estado into v_estado from public.hospitalizaciones h where h.id = p_hosp and h.negocio_id = public.negocio_actual() and h.deleted_at is null;
  if v_estado is null then
    raise exception 'Esa hospitalización no existe.';
  end if;
  if v_estado <> 'ingresado' then
    raise exception 'La mascota ya salió: no se indica medicación a una hospitalización dada de alta.';
  end if;
  if p_insumo_id is not null then
    if not exists (select 1 from public.insumos i where i.id = p_insumo_id and i.negocio_id = public.negocio_actual() and i.deleted_at is null) then
      raise exception 'Ese producto no existe.';
    end if;
    if v_prod is null then
      select i.nombre into v_prod from public.insumos i where i.id = p_insumo_id;
    end if;
  end if;
  if v_prod is null then
    raise exception 'Escribe el medicamento.';
  end if;
  if btrim(coalesce(p_dosis, '')) = '' then
    raise exception 'Escribe la dosis.';
  end if;
  if p_primera_dosis is null then
    raise exception 'Indica cuándo es la primera dosis.';
  end if;
  if v_n < 1 or v_n > 200 then
    raise exception 'El número de dosis va de 1 a 200.';
  end if;
  if v_n > 1 and p_frecuencia_horas is null then
    raise exception 'Con varias dosis, indica cada cuántas horas.';
  end if;
  if p_frecuencia_horas is not null and p_frecuencia_horas not between 1 and 168 then
    raise exception 'La frecuencia va de 1 a 168 horas.';
  end if;
  if p_precio_dosis is not null and p_precio_dosis < 0 then
    raise exception 'El precio de la dosis no puede ser negativo.';
  end if;
  v_medico := public.vet_medico_firma(p_medico_id, true);

  insert into public.hospitalizacion_medicacion (hospitalizacion_id, producto, insumo_id, dosis, via, frecuencia_horas, primera_dosis_at, num_dosis,
                                                 precio_dosis, indicaciones, medico_id)
  values (p_hosp, v_prod, p_insumo_id, btrim(p_dosis), nullif(btrim(coalesce(p_via, '')), ''), p_frecuencia_horas, p_primera_dosis, v_n,
          nullif(p_precio_dosis, 0), nullif(btrim(coalesce(p_indicaciones, '')), ''), v_medico)
  returning id into v_id;
  for v_i in 0 .. v_n - 1 loop
    insert into public.hospitalizacion_dosis (hospitalizacion_id, medicacion_id, programada_at)
    values (p_hosp, v_id, p_primera_dosis + make_interval(hours => coalesce(p_frecuencia_horas, 0) * v_i));
  end loop;
  return v_id;
end;
$$;

create or replace function public.hospitalizar_suspender_medicacion(p_medicacion_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vet_puede('hospitalizar') then
    raise exception 'Suspender medicación es de un médico veterinario, de admin o de quien tenga «Hospitalizar y medicar».' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribe el motivo.';
  end if;
  update public.hospitalizacion_medicacion set suspendida_at = now(), suspendida_por = auth.uid(), suspendida_motivo = btrim(p_motivo)
   where id = p_medicacion_id and negocio_id = public.negocio_actual() and suspendida_at is null and deleted_at is null;
  if not found then
    raise exception 'Esa medicación no existe o ya estaba suspendida.';
  end if;
  update public.hospitalizacion_dosis set estado = 'omitida', motivo_omision = 'Medicación suspendida: ' || btrim(p_motivo)
   where medicacion_id = p_medicacion_id and estado = 'pendiente';
end;
$$;

create or replace function public.hospitalizar_aplicar_dosis(p_dosis_id uuid, p_lote_id uuid, p_lote_texto text, p_cantidad numeric, p_nota text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d record;
  v_m record;
  v_lote_insumo uuid;
  v_lote_codigo text;
  v_lote_cad date;
  v_cant numeric := coalesce(p_cantidad, 1);
  v_mov uuid;
  v_cargo uuid;
  v_nombre text;
begin
  if not public.vet_puede('hospitalizar') then
    raise exception 'Aplicar medicación es de un médico veterinario, de admin o de quien tenga «Hospitalizar y medicar».' using errcode = '42501';
  end if;
  select d.id, d.estado, d.medicacion_id, d.hospitalizacion_id into v_d from public.hospitalizacion_dosis d
   where d.id = p_dosis_id and d.negocio_id = public.negocio_actual() and d.deleted_at is null for update;
  if v_d.id is null then
    raise exception 'Esa dosis no existe.';
  end if;
  if v_d.estado <> 'pendiente' then
    raise exception 'Esa dosis ya no está pendiente (%).', v_d.estado;
  end if;
  select m.producto, m.insumo_id, m.precio_dosis, m.suspendida_at into v_m from public.hospitalizacion_medicacion m where m.id = v_d.medicacion_id;
  if v_m.suspendida_at is not null then
    raise exception 'Esa medicación está suspendida.';
  end if;
  if not exists (select 1 from public.hospitalizaciones h where h.id = v_d.hospitalizacion_id and h.estado = 'ingresado') then
    raise exception 'La mascota ya salió: no se aplican dosis a una hospitalización dada de alta.';
  end if;
  if v_cant <= 0 then
    raise exception 'La cantidad tiene que ser mayor a cero.';
  end if;
  if p_lote_id is not null then
    select l.insumo_id, l.codigo, l.fecha_caducidad into v_lote_insumo, v_lote_codigo, v_lote_cad from public.insumo_lotes l
     where l.id = p_lote_id and l.negocio_id = public.negocio_actual() and l.deleted_at is null;
    if v_lote_insumo is null then
      raise exception 'Ese lote no existe.';
    end if;
    if v_m.insumo_id is not null and v_m.insumo_id <> v_lote_insumo then
      raise exception 'Ese lote es de otro producto, no del medicamento indicado.';
    end if;
    if v_lote_cad is not null and v_lote_cad < public.fecha_negocio() then
      raise exception 'Ese lote está caducado.';
    end if;
    select p.nombre into v_nombre from public.hospitalizaciones h join public.perros p on p.id = h.perro_id where h.id = v_d.hospitalizacion_id;
    v_mov := public.vet_descontar_lote(p_lote_id, v_cant, 'Hospitalización de ' || v_nombre || ': ' || v_m.producto);
  end if;
  update public.hospitalizacion_dosis
     set estado = 'aplicada', aplicada_at = now(), aplicada_por = auth.uid(), lote_id = p_lote_id,
         lote_texto = coalesce(nullif(btrim(coalesce(p_lote_texto, '')), ''), v_lote_codigo), lote_movimiento_id = v_mov,
         nota = nullif(btrim(coalesce(p_nota, '')), '')
   where id = p_dosis_id;
  if coalesce(v_m.precio_dosis, 0) > 0 then
    v_cargo := public.vet_cargar(v_d.hospitalizacion_id, 'medicamento', v_m.producto || ' — dosis aplicada', v_m.precio_dosis, null, p_dosis_id);
  end if;
  return jsonb_build_object('cargo_id', v_cargo, 'descontado', v_mov is not null);
end;
$$;

create or replace function public.hospitalizar_omitir_dosis(p_dosis_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vet_puede('hospitalizar') then
    raise exception 'Omitir una dosis es de un médico veterinario, de admin o de quien tenga «Hospitalizar y medicar».' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribe por qué no se aplicó.';
  end if;
  update public.hospitalizacion_dosis set estado = 'omitida', motivo_omision = btrim(p_motivo)
   where id = p_dosis_id and negocio_id = public.negocio_actual() and estado = 'pendiente' and deleted_at is null;
  if not found then
    raise exception 'Esa dosis no existe o ya no está pendiente.';
  end if;
end;
$$;

create or replace function public.hospitalizar_monitorear(
  p_hosp uuid, p_temperatura numeric, p_peso numeric, p_fc int, p_fr int, p_notas text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_h record;
  v_hora int := extract(hour from public.hora_negocio())::int;
  v_turno text;
  v_id uuid;
begin
  if not public.vet_puede('hospitalizar') then
    raise exception 'Registrar el monitoreo es de un médico veterinario, de admin o de quien tenga «Hospitalizar y medicar».' using errcode = '42501';
  end if;
  select h.id, h.estado, h.perro_id into v_h from public.hospitalizaciones h where h.id = p_hosp and h.negocio_id = public.negocio_actual() and h.deleted_at is null;
  if v_h.id is null then
    raise exception 'Esa hospitalización no existe.';
  end if;
  if v_h.estado <> 'ingresado' then
    raise exception 'La mascota ya salió: no se registra monitoreo.';
  end if;
  v_turno := case when v_hora >= 6 and v_hora < 14 then 'matutino' when v_hora >= 14 and v_hora < 22 then 'vespertino' else 'nocturno' end;
  insert into public.hospitalizacion_monitoreo (hospitalizacion_id, turno, temperatura_c, peso_kg, frecuencia_cardiaca, frecuencia_respiratoria, notas)
  values (p_hosp, v_turno, p_temperatura, p_peso, p_fc, p_fr, nullif(btrim(coalesce(p_notas, '')), ''))
  returning id into v_id;
  if p_peso is not null then
    insert into public.pesos_registrados (perro_id, peso_kg, fecha, notas) values (v_h.perro_id, p_peso, public.fecha_negocio(), 'Hospitalización');
  end if;
  return v_id;
end;
$$;

create or replace function public.hospitalizar_dar_alta(p_hosp uuid, p_resumen text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_h record;
  v_total numeric;
begin
  if not public.vet_puede('hospitalizar') then
    raise exception 'Dar el alta es de un médico veterinario, de admin o de quien tenga «Hospitalizar y medicar».' using errcode = '42501';
  end if;
  if btrim(coalesce(p_resumen, '')) = '' then
    raise exception 'Escribe el resumen del alta.';
  end if;
  select h.id, h.estado, h.deposito_cargo_id, h.reserva_id into v_h from public.hospitalizaciones h
   where h.id = p_hosp and h.negocio_id = public.negocio_actual() and h.deleted_at is null for update;
  if v_h.id is null then
    raise exception 'Esa hospitalización no existe.';
  end if;
  if v_h.estado <> 'ingresado' then
    raise exception 'Esa hospitalización ya está dada de alta.';
  end if;
  update public.hospitalizacion_dosis set estado = 'omitida', motivo_omision = 'Alta de la mascota'
   where hospitalizacion_id = p_hosp and estado = 'pendiente';
  update public.hospitalizaciones set estado = 'alta', alta_at = now(), alta_por = auth.uid(), resumen_alta = btrim(p_resumen) where id = p_hosp;
  perform public.hospitalizacion_completar_dias(p_hosp);
  -- El depósito se aplica a la cuenta: la línea del depósito se cancela y lo que se debe lo dicen los cargos reales.
  if v_h.deposito_cargo_id is not null then
    update public.cargos_aplicados set cancelado = true, motivo_cancelacion = 'El depósito se aplicó a la cuenta de la hospitalización al dar el alta'
     where id = v_h.deposito_cargo_id and not cancelado;
  end if;
  select coalesce(sum(c.importe), 0) into v_total from public.hospitalizacion_cargos c
   where c.hospitalizacion_id = p_hosp and c.tipo <> 'deposito' and c.deleted_at is null;
  return jsonb_build_object('reserva_id', v_h.reserva_id, 'total_cargos', v_total);
end;
$$;

-- ── 5. Hospitalización: lecturas ─────────────────────────────────────

create or replace function public.hospitalizacion_censo()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zona text := public.zona_negocio();
begin
  if not coalesce(public.is_staff(), false) or not coalesce(public.modulo_activo('veterinaria'), false) then
    raise exception 'Solo el personal del negocio con Veterinaria prendida.' using errcode = '42501';
  end if;
  -- Completa los días de hoy de quienes siguen internados (idempotente).
  if public.vet_puede('hospitalizar') and public.negocio_escribible() then
    perform public.hospitalizacion_completar_dias(h.id) from public.hospitalizaciones h
     where h.negocio_id = public.negocio_actual() and h.estado = 'ingresado' and h.deleted_at is null;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', h.id, 'perro_id', h.perro_id, 'mascota', p.nombre, 'especie', p.especie, 'dueno', c.nombre, 'motivo', h.motivo, 'ubicacion', h.ubicacion,
      'medico', pr.nombre_completo, 'ingreso_at', h.ingreso_at,
      'dias', (public.fecha_negocio() - (h.ingreso_at at time zone v_zona)::date) + 1,
      'dosis_atrasadas', (select count(*) from public.hospitalizacion_dosis d where d.hospitalizacion_id = h.id and d.estado = 'pendiente' and d.programada_at < now() - interval '15 minutes'),
      'dosis_pendientes', (select count(*) from public.hospitalizacion_dosis d where d.hospitalizacion_id = h.id and d.estado = 'pendiente'),
      'proxima_dosis', (select min(d.programada_at) from public.hospitalizacion_dosis d where d.hospitalizacion_id = h.id and d.estado = 'pendiente'),
      'ultimo_monitoreo', (select jsonb_build_object('registrado_at', m.registrado_at, 'temperatura_c', m.temperatura_c)
                           from public.hospitalizacion_monitoreo m where m.hospitalizacion_id = h.id order by m.registrado_at desc limit 1),
      'consentimiento', (select co.estado from public.consentimientos co where co.hospitalizacion_id = h.id and co.tipo = 'hospitalizacion' and co.estado <> 'cancelado'
                         order by co.created_at desc limit 1)
    ) order by h.ingreso_at)
    from public.hospitalizaciones h
    join public.perros p on p.id = h.perro_id
    join public.clientes c on c.id = h.cliente_id
    join public.medicos_veterinarios m2 on m2.id = h.medico_id
    join public.profiles pr on pr.id = m2.profile_id
    where h.negocio_id = public.negocio_actual() and h.estado = 'ingresado' and h.deleted_at is null
  ), '[]'::jsonb);
end;
$$;

create or replace function public.hospitalizacion_detalle(p_hosp uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zona text := public.zona_negocio();
  v_ok boolean;
begin
  if not coalesce(public.is_staff(), false) or not coalesce(public.modulo_activo('veterinaria'), false) then
    raise exception 'Solo el personal del negocio con Veterinaria prendida.' using errcode = '42501';
  end if;
  select exists (select 1 from public.hospitalizaciones h where h.id = p_hosp and h.negocio_id = public.negocio_actual() and h.deleted_at is null) into v_ok;
  if not v_ok then
    raise exception 'Esa hospitalización no existe.';
  end if;
  if public.vet_puede('hospitalizar') and public.negocio_escribible() then
    perform public.hospitalizacion_completar_dias(p_hosp);
  end if;
  return (
    select jsonb_build_object(
      'id', h.id, 'estado', h.estado, 'perro_id', h.perro_id, 'cliente_id', h.cliente_id, 'reserva_id', h.reserva_id,
      'mascota', p.nombre, 'especie', p.especie, 'dueno', c.nombre, 'telefono', c.telefono, 'motivo', h.motivo, 'ubicacion', h.ubicacion,
      'medico', pr.nombre_completo, 'medico_id', h.medico_id, 'ingreso_at', h.ingreso_at, 'alta_at', h.alta_at, 'resumen_alta', h.resumen_alta,
      'precio_dia', h.precio_dia, 'deposito', h.deposito,
      'dias', (coalesce((h.alta_at at time zone v_zona)::date, public.fecha_negocio()) - (h.ingreso_at at time zone v_zona)::date) + 1,
      'medicacion', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id, 'producto', m.producto, 'insumo_id', m.insumo_id, 'dosis', m.dosis, 'via', m.via, 'frecuencia_horas', m.frecuencia_horas,
          'precio_dosis', m.precio_dosis, 'indicaciones', m.indicaciones, 'suspendida', m.suspendida_at is not null, 'suspendida_motivo', m.suspendida_motivo,
          'indico', pm.nombre_completo,
          'dosis_lista', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', d.id, 'programada_at', d.programada_at, 'estado', d.estado, 'aplicada_at', d.aplicada_at, 'aplicada_por', pa.nombre_completo,
              'lote', coalesce(d.lote_texto, l.codigo), 'motivo_omision', d.motivo_omision, 'nota', d.nota,
              'atrasada', d.estado = 'pendiente' and d.programada_at < now() - interval '15 minutes'
            ) order by d.programada_at)
            from public.hospitalizacion_dosis d
            left join public.insumo_lotes l on l.id = d.lote_id
            left join public.profiles pa on pa.id = d.aplicada_por
            where d.medicacion_id = m.id
          ), '[]'::jsonb)
        ) order by m.created_at)
        from public.hospitalizacion_medicacion m
        join public.medicos_veterinarios mm on mm.id = m.medico_id
        join public.profiles pm on pm.id = mm.profile_id
        where m.hospitalizacion_id = h.id and m.deleted_at is null
      ), '[]'::jsonb),
      'monitoreo', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', mo.id, 'registrado_at', mo.registrado_at, 'turno', mo.turno, 'temperatura_c', mo.temperatura_c, 'peso_kg', mo.peso_kg,
          'frecuencia_cardiaca', mo.frecuencia_cardiaca, 'frecuencia_respiratoria', mo.frecuencia_respiratoria, 'notas', mo.notas, 'por', pr2.nombre_completo
        ) order by mo.registrado_at desc)
        from public.hospitalizacion_monitoreo mo left join public.profiles pr2 on pr2.id = mo.registrado_por
        where mo.hospitalizacion_id = h.id
      ), '[]'::jsonb),
      'cargos', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', hc.id, 'tipo', hc.tipo, 'fecha', hc.fecha, 'descripcion', hc.descripcion, 'importe', hc.importe, 'cancelado', ca.cancelado, 'creado', hc.created_at
        ) order by hc.created_at)
        from public.hospitalizacion_cargos hc join public.cargos_aplicados ca on ca.id = hc.cargo_id
        where hc.hospitalizacion_id = h.id
      ), '[]'::jsonb),
      'consentimientos', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', co.id, 'tipo', co.tipo, 'titulo', co.titulo, 'estado', co.estado, 'procedimiento', co.procedimiento,
          'firmado_at', co.firmado_at, 'firmante', co.firmante_nombre, 'creado', co.created_at, 'storage_path', co.storage_path
        ) order by co.created_at desc)
        from public.consentimientos co where co.hospitalizacion_id = h.id
      ), '[]'::jsonb)
    )
    from public.hospitalizaciones h
    join public.perros p on p.id = h.perro_id
    join public.clientes c on c.id = h.cliente_id
    join public.medicos_veterinarios m2 on m2.id = h.medico_id
    join public.profiles pr on pr.id = m2.profile_id
    where h.id = p_hosp and h.negocio_id = public.negocio_actual()
  );
end;
$$;

-- Historial de hospitalizaciones de una mascota (para su ficha).
create or replace function public.hospitalizaciones_de_mascota(p_perro_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_staff(), false) or not coalesce(public.modulo_activo('veterinaria'), false) then
    raise exception 'Solo el personal del negocio con Veterinaria prendida.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', h.id, 'estado', h.estado, 'motivo', h.motivo, 'ingreso_at', h.ingreso_at, 'alta_at', h.alta_at) order by h.ingreso_at desc)
    from public.hospitalizaciones h
    where h.perro_id = p_perro_id and h.negocio_id = public.negocio_actual() and h.deleted_at is null
  ), '[]'::jsonb);
end;
$$;

-- Consentimientos de una mascota (pendientes y firmados).
create or replace function public.consentimientos_de_mascota(p_perro_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_staff(), false) or not coalesce(public.modulo_activo('veterinaria'), false) then
    raise exception 'Solo el personal del negocio con Veterinaria prendida.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'tipo', c.tipo, 'titulo', c.titulo, 'estado', c.estado, 'procedimiento', c.procedimiento,
                                        'creado', c.created_at, 'firmado_at', c.firmado_at, 'firmante', c.firmante_nombre, 'hospitalizacion_id', c.hospitalizacion_id)
                     order by c.created_at desc)
    from public.consentimientos c
    where c.perro_id = p_perro_id and c.negocio_id = public.negocio_actual() and c.deleted_at is null
  ), '[]'::jsonb);
end;
$$;

-- Lo que alimenta «Necesita atención» de Veterinaria.
create or replace function public.veterinaria_atencion()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := public.fecha_negocio();
begin
  if not coalesce(public.is_staff(), false) or not coalesce(public.modulo_activo('veterinaria'), false) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'recordatorios_pendientes', case when public.vet_puede('registrar_vacunas') then
        (select count(*) from public.carnet_recordatorios r where r.negocio_id = public.negocio_actual() and r.deleted_at is null and r.estado in ('pendiente', 'fallido')
            and r.proxima_dosis <= v_hoy + 14) else 0 end,
    'recordatorio_mas_viejo', case when public.vet_puede('registrar_vacunas') then
        (select min(r.proxima_dosis) from public.carnet_recordatorios r where r.negocio_id = public.negocio_actual() and r.deleted_at is null and r.estado in ('pendiente', 'fallido')
            and r.proxima_dosis <= v_hoy + 14) else null end,
    'dosis_atrasadas', case when public.vet_puede('hospitalizar') then
        (select count(*) from public.hospitalizacion_dosis d join public.hospitalizaciones h on h.id = d.hospitalizacion_id and h.estado = 'ingresado'
          where d.negocio_id = public.negocio_actual() and d.estado = 'pendiente' and d.programada_at < now() - interval '15 minutes') else 0 end,
    'dosis_mas_vieja', case when public.vet_puede('hospitalizar') then
        (select min(d.programada_at) from public.hospitalizacion_dosis d join public.hospitalizaciones h on h.id = d.hospitalizacion_id and h.estado = 'ingresado'
          where d.negocio_id = public.negocio_actual() and d.estado = 'pendiente' and d.programada_at < now() - interval '15 minutes') else null end,
    'consentimientos_pendientes', case when public.vet_puede('hospitalizar') then
        (select count(*) from public.consentimientos c where c.negocio_id = public.negocio_actual() and c.deleted_at is null and c.estado = 'pendiente_firma') else 0 end,
    'consentimiento_mas_viejo', case when public.vet_puede('hospitalizar') then
        (select min(c.created_at) from public.consentimientos c where c.negocio_id = public.negocio_actual() and c.deleted_at is null and c.estado = 'pendiente_firma') else null end
  );
end;
$$;

-- ── 6. Apagar Veterinaria: ahora cuenta a los hospitalizados ─────────
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.impacto_apagar_modulo(text)'::regprocedure);
  v_def := replace(v_def,
    $a$    v_que := 'lotes de productos clínicos con existencia';$a$,
    $b$    v_que := 'lotes de productos clínicos con existencia';
    if to_regclass('public.hospitalizaciones') is not null then
      declare
        v_h int;
      begin
        select count(*) into v_h from public.hospitalizaciones where estado = 'ingresado' and deleted_at is null;
        v_n := v_n + v_h;
        if v_h > 0 then
          v_que := v_que || ' y ' || v_h || ' mascota(s) hospitalizada(s)';
        end if;
      end;
    end if;$b$);
  if v_def not like '%mascota(s) hospitalizada(s)%' then
    raise exception 'No se pudo parchar impacto_apagar_modulo: cambió su texto.';
  end if;
  execute v_def;
end;
$$;

-- ── 7. Dueños y grants ───────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'vet_sembrar_consentimientos()', 'consentimientos_plantillas_lista()', 'guardar_plantilla_consentimiento(text,text,text)',
    'consentimiento_campos(uuid)', 'crear_consentimiento(uuid,text,uuid,text,uuid)',
    'consentimiento_registrar_firma(uuid,text,text,text,text,text)', 'cancelar_consentimiento(uuid,text)',
    'vet_servicio_cargo(text)', 'vet_cargar(uuid,text,text,numeric,date,uuid)', 'hospitalizacion_completar_dias(uuid)',
    'hospitalizar_ingresar(uuid,uuid,text,text,numeric,numeric)', 'hospitalizar_agregar_cargo(uuid,text,text,numeric)',
    'hospitalizar_indicar_medicacion(uuid,text,uuid,text,text,int,timestamptz,int,numeric,text,uuid)',
    'hospitalizar_suspender_medicacion(uuid,text)', 'hospitalizar_aplicar_dosis(uuid,uuid,text,numeric,text)',
    'hospitalizar_omitir_dosis(uuid,text)', 'hospitalizar_monitorear(uuid,numeric,numeric,int,int,text)',
    'hospitalizar_dar_alta(uuid,text)', 'hospitalizacion_censo()', 'hospitalizacion_detalle(uuid)',
    'hospitalizaciones_de_mascota(uuid)', 'consentimientos_de_mascota(uuid)', 'veterinaria_atencion()'
  ] loop
    execute format('alter function public.%s owner to peludesk_definer', f);
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  -- Internas: solo las llaman otras funciones, ya con sus permisos comprobados.
  foreach f in array array['vet_sembrar_consentimientos()', 'vet_servicio_cargo(text)', 'vet_cargar(uuid,text,text,numeric,date,uuid)', 'hospitalizacion_completar_dias(uuid)'] loop
    execute format('revoke execute on function public.%s from authenticated', f);
  end loop;
end;
$$;
alter function public.consentimiento_inmutable() owner to peludesk_definer;
alter function public.vet_solo_agregar() owner to peludesk_definer;

-- El ayudante de redes ya no hace falta.
drop function public._vet_redes(text, text);
