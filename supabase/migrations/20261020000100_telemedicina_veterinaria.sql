-- Veterinaria, Fase 5 · parte 2: telemedicina (carril A).
--
-- · Tipo de cita «Teleconsulta» en la agenda clínica. Al agendarla el servidor crea una
--   sala de videollamada con el proveedor (el cliente entra desde el navegador del celular,
--   sin instalar nada) y deja aquí su registro: `vet_telemedicina`.
-- · La liga del dueño (/t/<token>) guarda solo el sha256 del token. Sala válida solo en la
--   ventana de la cita (15 minutos antes → 30 después de que termina); el médico entra
--   desde la agenda con su sesión.
-- · Consentimiento de teleconsulta con el motor de consentimientos (firma remota con
--   nombre y firma, PDF con hash e IP) antes de entrar.
-- · Cobro anticipado opcional: una cuenta (reservas) con un cargo de monto libre, que se
--   paga con el link de pago del proveedor de cobro de siempre; la sala del dueño solo
--   abre con la cuenta en cero. No se toca ninguna tabla de cobros, caja ni facturación.
-- · La consulta se documenta en el mismo expediente SOAP, con modalidad «telemedicina».
--   Sin grabación de video.
--
-- Reversa: borrar vet_telemedicina y sus funciones, quitar 'teleconsulta' de las listas de
-- tipos y la modalidad de vet_consultas (columna creada en la migración del dictado).

-- ── 0. Ayuda para las redes de la tabla nueva (se borra al final) ──
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

-- ── 1. El tipo de cita «Teleconsulta» ────────────────────────────────
alter table public.vet_tipos_cita drop constraint vet_tipos_cita_clave_check;
alter table public.vet_tipos_cita add constraint vet_tipos_cita_clave_check
  check (clave = any (array['consulta', 'vacuna', 'cirugia', 'seguimiento', 'urgencia', 'teleconsulta']));

create or replace function public.vet_sembrar_agenda()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.vet_tipos_cita (clave, nombre, duracion_min)
  select v.clave, v.nombre, v.dur
  from (values ('consulta', 'Consulta', 30), ('vacuna', 'Vacuna', 15), ('cirugia', 'Cirugía', 90),
               ('seguimiento', 'Seguimiento', 20), ('urgencia', 'Urgencia', 30), ('teleconsulta', 'Teleconsulta', 30)) as v(clave, nombre, dur)
  where not exists (select 1 from public.vet_tipos_cita t where t.negocio_id = public.negocio_actual() and t.clave = v.clave and t.deleted_at is null);
end;
$$;

-- Los negocios que ya tenían su agenda sembrada reciben el tipo nuevo.
alter table public.vet_tipos_cita disable trigger exigir_modulo;
insert into public.vet_tipos_cita (negocio_id, clave, nombre, duracion_min)
select distinct t.negocio_id, 'teleconsulta', 'Teleconsulta', 30
from public.vet_tipos_cita t
where not exists (select 1 from public.vet_tipos_cita x where x.negocio_id = t.negocio_id and x.clave = 'teleconsulta' and x.deleted_at is null);
alter table public.vet_tipos_cita enable trigger exigir_modulo;

-- ── 2. Consentimiento de teleconsulta (el motor de consentimientos) ──
alter table public.consentimientos_plantillas drop constraint consentimientos_plantillas_tipo_check;
alter table public.consentimientos_plantillas add constraint consentimientos_plantillas_tipo_check
  check (tipo = any (array['hospitalizacion', 'cirugia', 'anestesia', 'eutanasia', 'teleconsulta']));
alter table public.consentimientos drop constraint consentimientos_tipo_check;
alter table public.consentimientos add constraint consentimientos_tipo_check
  check (tipo = any (array['hospitalizacion', 'cirugia', 'anestesia', 'eutanasia', 'teleconsulta']));
alter table public.consentimientos drop constraint consentimientos_firma_metodo_check;
alter table public.consentimientos add constraint consentimientos_firma_metodo_check
  check (firma_metodo is null or firma_metodo = any (array['mostrador', 'papel', 'remota']));

do $$
declare
  v_def text;
  v_nuevo text;
  v_texto text := $t$'Yo, {{cliente_nombre}}, propietario(a) o responsable de la mascota {{mascota_nombre}} ({{especie}}, {{raza}}), acepto recibir una consulta veterinaria a distancia (teleconsulta), por videollamada, con el médico veterinario {{medico_nombre}} (cédula profesional {{medico_cedula}}) de {{establecimiento}}, por el siguiente motivo: {{motivo}}.

Entiendo que una teleconsulta no sustituye la revisión física de mi mascota: el médico puede orientarse solo con lo que vea, escuche y yo le cuente, puede no llegar a un diagnóstico definitivo y puede indicarme que la lleve a la clínica o a un servicio de urgencias. Si mi mascota está en una emergencia no debo esperar a la teleconsulta.

Sé que la videollamada no se graba, que el médico registrará la consulta en el expediente clínico de mi mascota con la misma confidencialidad que una consulta presencial, y que el médico puede dictar sus notas por voz: ese dictado (solo su voz) se transcribe con proveedores de tecnología y el audio se borra al terminar, o se conserva hasta 30 días si la clínica lo tiene activado. La calidad de la llamada depende de mi conexión a internet; si se corta, la clínica me buscará en el teléfono que dejé registrado.

Fecha: {{fecha}}'$t$;
begin
  -- vet_sembrar_consentimientos: una plantilla más.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'vet_sembrar_consentimientos';
  v_def := replace(v_def, E'\r', '');
  v_nuevo := replace(v_def, $a$array['hospitalizacion', 'cirugia', 'anestesia', 'eutanasia']$a$, $b$array['hospitalizacion', 'cirugia', 'anestesia', 'eutanasia', 'teleconsulta']$b$);
  v_nuevo := replace(v_nuevo, $a$      else 'Consentimiento informado para eutanasia' end;$a$,
                              $b$      when 'teleconsulta' then 'Consentimiento informado para teleconsulta'
      else 'Consentimiento informado para eutanasia' end;$b$);
  v_nuevo := replace(v_nuevo, E'      else\n''Yo, {{cliente_nombre}}, propietario(a) o responsable de la mascota {{mascota_nombre}} ({{especie}}, {{raza}}), solicito y autorizo su eutanasia',
                              E'      when ''teleconsulta'' then\n' || v_texto || E'\n      else\n''Yo, {{cliente_nombre}}, propietario(a) o responsable de la mascota {{mascota_nombre}} ({{especie}}, {{raza}}), solicito y autorizo su eutanasia');
  if v_nuevo = v_def or position('teleconsulta' in v_nuevo) = 0 or position('when ''teleconsulta'' then ''Consentimiento' in v_nuevo) = 0 or position('when ''teleconsulta'' then' || E'\n' in v_nuevo) = 0 then
    raise exception 'vet_sembrar_consentimientos: el parche no encontró el texto esperado';
  end if;
  execute v_nuevo;

  -- La lista y el guardado de plantillas conocen el tipo nuevo.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'consentimientos_plantillas_lista';
  v_def := replace(v_def, E'\r', '');
  v_nuevo := replace(v_def, $a$array['hospitalizacion', 'cirugia', 'anestesia', 'eutanasia']$a$, $b$array['hospitalizacion', 'cirugia', 'anestesia', 'eutanasia', 'teleconsulta']$b$);
  if v_nuevo = v_def then raise exception 'consentimientos_plantillas_lista: el parche no encontró el texto esperado'; end if;
  execute v_nuevo;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'guardar_plantilla_consentimiento';
  v_def := replace(v_def, E'\r', '');
  v_nuevo := replace(v_def, $a$p_tipo not in ('hospitalizacion', 'cirugia', 'anestesia', 'eutanasia')$a$, $b$p_tipo not in ('hospitalizacion', 'cirugia', 'anestesia', 'eutanasia', 'teleconsulta')$b$);
  if v_nuevo = v_def then raise exception 'guardar_plantilla_consentimiento: el parche no encontró el texto esperado'; end if;
  execute v_nuevo;

  -- vet_consulta_iniciar: una cita de teleconsulta abre una consulta con modalidad «telemedicina».
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'vet_consulta_iniciar';
  v_def := replace(v_def, E'\r', '');
  v_nuevo := v_def;
  v_nuevo := replace(v_nuevo, E'  v_id uuid := gen_random_uuid();\nbegin', E'  v_id uuid := gen_random_uuid();\n  v_tele boolean := false;\nbegin');
  v_nuevo := replace(v_nuevo, E'    v_tipo := v_cita.tipo_clave;\n',
    E'    v_tele := v_cita.tipo_clave = ''teleconsulta'';\n    if v_tele and not public.vet_puede(''atender_teleconsultas'') then\n      raise exception ''Atender una teleconsulta es de un médico veterinario, de admin o de quien tenga «Atender teleconsultas».'' using errcode = ''42501'';\n    end if;\n    v_tipo := case when v_tele then ''consulta'' else v_cita.tipo_clave end;\n');
  v_nuevo := replace(v_nuevo, 'cita_id, tipo_clave, medico_id, plantilla_version,', 'cita_id, tipo_clave, medico_id, modalidad, plantilla_version,');
  v_nuevo := replace(v_nuevo, 'p_cita, v_tipo, v_medico, v_plantilla.version,', E'p_cita, v_tipo, v_medico, case when v_tele then ''telemedicina'' else ''presencial'' end, v_plantilla.version,');
  if v_nuevo = v_def or position('v_tele' in v_nuevo) = 0 or position('modalidad, plantilla_version' in v_nuevo) = 0 or position('''telemedicina''' in v_nuevo) = 0 then
    raise exception 'vet_consulta_iniciar: el parche no encontró el texto esperado';
  end if;
  execute v_nuevo;
end $$;

-- ── 3. Ajustes del negocio: cobro anticipado de la teleconsulta ──────
alter table public.veterinaria_ajustes add column teleconsulta_cobro_anticipado boolean not null default false;
alter table public.veterinaria_ajustes add column teleconsulta_precio numeric(10, 2) check (teleconsulta_precio is null or teleconsulta_precio >= 0);

create or replace function public.guardar_veterinaria_teleconsulta(p_cobro boolean, p_precio numeric)
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
    raise exception 'Cambiar esta opción es de admin o de quien tenga «Configuración del negocio».' using errcode = '42501';
  end if;
  if coalesce(p_cobro, false) and coalesce(p_precio, 0) <= 0 then
    raise exception 'Para cobrar por adelantado escribe el precio de la teleconsulta.';
  end if;
  if exists (select 1 from public.veterinaria_ajustes where negocio_id = public.negocio_actual() and deleted_at is null) then
    update public.veterinaria_ajustes
       set teleconsulta_cobro_anticipado = coalesce(p_cobro, false), teleconsulta_precio = p_precio
     where negocio_id = public.negocio_actual() and deleted_at is null;
  else
    insert into public.veterinaria_ajustes (teleconsulta_cobro_anticipado, teleconsulta_precio) values (coalesce(p_cobro, false), p_precio);
  end if;
end;
$$;

-- ── 4. La sala de cada teleconsulta ──────────────────────────────────
create table public.vet_telemedicina (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  cita_id uuid not null references public.vet_citas(id),
  perro_id uuid not null references public.perros(id),
  cliente_id uuid not null references public.clientes(id),
  medico_id uuid not null references public.medicos_veterinarios(id),
  proveedor text not null check (proveedor in ('daily', 'simulado')),
  sala_nombre text not null check (btrim(sala_nombre) <> ''),
  sala_url text not null check (btrim(sala_url) <> ''),
  token_hash text,
  token_creado_at timestamptz,
  ventana_desde timestamptz not null,
  ventana_hasta timestamptz not null check (ventana_hasta > ventana_desde),
  consentimiento_id uuid references public.consentimientos(id),
  reserva_id uuid references public.reservas(id),
  monto numeric(10, 2) check (monto is null or monto >= 0),
  estado text not null default 'programada' check (estado in ('programada', 'finalizada', 'cancelada')),
  entro_dueno_at timestamptz,
  entro_medico_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index vet_telemedicina_cita_uq on public.vet_telemedicina (cita_id) where deleted_at is null;
create unique index vet_telemedicina_token_uq on public.vet_telemedicina (token_hash) where token_hash is not null and deleted_at is null;
-- La API no lee esta tabla (trae la liga de la sala): todo pasa por funciones que comprueban el permiso.
select public._vet_redes('vet_telemedicina', 'false');

-- ── 5. Funciones ─────────────────────────────────────────────────────

create or replace function public.vet_servicio_cargo_tele()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select s.id into v_id from public.servicios s where s.negocio_id = public.negocio_actual() and s.clave = 'vet_teleconsulta' and s.deleted_at is null;
  if v_id is null then
    insert into public.servicios (clave, nombre, categoria, unidad, monto_libre, orden)
    values ('vet_teleconsulta', 'Teleconsulta veterinaria', 'cargo', 'evento', true, 920)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Estado de una teleconsulta frente al DUEÑO: ventana, consentimiento y pago.
create or replace function public.vet_telemedicina_estado(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_t record;
  v_c record;
  v_ventana text;
  v_saldo numeric;
  v_requerido boolean;
  v_pagado boolean;
  v_url text;
begin
  select t.* into v_t from public.vet_telemedicina t where t.id = p_id and t.negocio_id = public.negocio_actual() and t.deleted_at is null;
  if v_t.id is null then
    return null;
  end if;
  select c.estado, c.firmado_at, c.firmante_nombre into v_c from public.consentimientos c where c.id = v_t.consentimiento_id;
  v_ventana := case
    when v_t.estado = 'cancelada' then 'cancelada'
    when v_t.estado = 'finalizada' or now() > v_t.ventana_hasta then 'cerrada'
    when now() < v_t.ventana_desde then 'antes'
    else 'abierta' end;
  v_requerido := v_t.reserva_id is not null and coalesce(v_t.monto, 0) > 0;
  if v_requerido then
    select s.saldo into v_saldo from public.cuenta_totales_reserva(v_t.reserva_id) s;
    v_pagado := coalesce(v_saldo, 1) <= 0.009;
    select o.url_pago into v_url from public.mp_ordenes o
     where o.reserva_id = v_t.reserva_id and o.tipo = 'link' and o.estado = 'creada' and o.deleted_at is null and o.url_pago is not null
       and (o.expira_at is null or o.expira_at > now())
     order by o.created_at desc limit 1;
  else
    v_pagado := true;
  end if;
  return jsonb_build_object(
    'ventana', v_ventana, 'desde', v_t.ventana_desde, 'hasta', v_t.ventana_hasta,
    'consentimiento_estado', coalesce(v_c.estado, 'pendiente_firma'), 'consentimiento_firmado', coalesce(v_c.estado = 'firmado', false),
    'consentimiento_firmado_at', v_c.firmado_at, 'consentimiento_firmante', v_c.firmante_nombre,
    'pago_requerido', v_requerido, 'pagado', v_pagado, 'saldo', coalesce(v_saldo, 0), 'monto', v_t.monto, 'url_pago', v_url,
    'puede_entrar', v_ventana = 'abierta' and coalesce(v_c.estado = 'firmado', false) and v_pagado,
    'entro_dueno_at', v_t.entro_dueno_at, 'entro_medico_at', v_t.entro_medico_at);
end;
$$;

-- Crea la teleconsulta de una cita: la sala (ya creada con el proveedor), la liga, el consentimiento y, si el negocio cobra por adelantado, la cuenta.
create or replace function public.vet_telemedicina_crear(p_cita uuid, p_proveedor text, p_sala_nombre text, p_sala_url text, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cita record;
  v_pl record;
  v_aj record;
  v_perro record;
  v_cons uuid;
  v_reserva uuid;
  v_monto numeric;
  v_id uuid := gen_random_uuid();
begin
  if not public.vet_agenda_puede() then
    raise exception 'Preparar una teleconsulta es de recepción, de admin, de quien tenga «Atender consultas» o de un médico veterinario.' using errcode = '42501';
  end if;
  if p_proveedor not in ('daily', 'simulado') or coalesce(btrim(p_sala_nombre), '') = '' or coalesce(btrim(p_sala_url), '') = '' or coalesce(p_token_hash, '') = '' then
    raise exception 'La sala de la videollamada no se pudo preparar.';
  end if;
  select c.id, c.perro_id, c.cliente_id, c.medico_id, c.inicia_at, c.termina_at, c.estado, c.tipo_clave, c.motivo into v_cita
    from public.vet_citas c where c.id = p_cita and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_cita.id is null then
    raise exception 'Esa cita no existe.';
  end if;
  if v_cita.tipo_clave <> 'teleconsulta' then
    raise exception 'Solo una cita de tipo «Teleconsulta» lleva sala de videollamada.';
  end if;
  if v_cita.estado not in ('programada', 'confirmada') then
    raise exception 'Esa cita ya no está vigente.';
  end if;
  if exists (select 1 from public.vet_telemedicina t where t.cita_id = p_cita and t.deleted_at is null) then
    raise exception 'Esa teleconsulta ya tiene su sala. Genera una liga nueva si la necesitas.';
  end if;
  select p.nombre into v_perro from public.perros p where p.id = v_cita.perro_id;

  -- El consentimiento, con la plantilla vigente.
  perform public.vet_sembrar_consentimientos();
  select * into v_pl from public.consentimientos_plantillas p
   where p.negocio_id = public.negocio_actual() and p.tipo = 'teleconsulta' and p.activa and p.deleted_at is null;
  if v_pl.id is null then
    raise exception 'No hay una plantilla vigente para el consentimiento de teleconsulta.';
  end if;
  insert into public.consentimientos (perro_id, cliente_id, tipo, plantilla_id, titulo, cuerpo, procedimiento, medico_id)
  values (v_cita.perro_id, v_cita.cliente_id, 'teleconsulta', v_pl.id, v_pl.titulo, v_pl.cuerpo, nullif(btrim(coalesce(v_cita.motivo, '')), ''), v_cita.medico_id)
  returning id into v_cons;

  -- Cobro por adelantado (opcional): una cuenta con un cargo de monto libre.
  select a.teleconsulta_cobro_anticipado, a.teleconsulta_precio into v_aj from public.veterinaria_ajustes a where a.negocio_id = public.negocio_actual() and a.deleted_at is null;
  if coalesce(v_aj.teleconsulta_cobro_anticipado, false) and coalesce(v_aj.teleconsulta_precio, 0) > 0 then
    v_monto := round(v_aj.teleconsulta_precio, 2);
    insert into public.reservas (cliente_id, notas) values (v_cita.cliente_id, 'Teleconsulta — ' || v_perro.nombre) returning id into v_reserva;
    insert into public.cargos_aplicados (reserva_id, perro_id, servicio_id, cantidad, precio, descripcion)
    values (v_reserva, v_cita.perro_id, public.vet_servicio_cargo_tele(), 1, v_monto, 'Teleconsulta — ' || v_perro.nombre);
  end if;

  insert into public.vet_telemedicina (id, cita_id, perro_id, cliente_id, medico_id, proveedor, sala_nombre, sala_url, token_hash, token_creado_at,
                                       ventana_desde, ventana_hasta, consentimiento_id, reserva_id, monto)
  values (v_id, p_cita, v_cita.perro_id, v_cita.cliente_id, v_cita.medico_id, p_proveedor, btrim(p_sala_nombre), btrim(p_sala_url), p_token_hash, now(),
          v_cita.inicia_at - interval '15 minutes', v_cita.termina_at + interval '30 minutes', v_cons, v_reserva, v_monto);
  return jsonb_build_object('id', v_id, 'consentimiento_id', v_cons, 'reserva_id', v_reserva, 'monto', v_monto,
                            'desde', v_cita.inicia_at - interval '15 minutes', 'hasta', v_cita.termina_at + interval '30 minutes');
end;
$$;

-- Una liga nueva (la anterior deja de servir). El token en claro nunca se guarda.
create or replace function public.vet_telemedicina_liga_nueva(p_cita uuid, p_token_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vet_agenda_puede() then
    raise exception 'Generar la liga de una teleconsulta es de recepción, de admin, de quien tenga «Atender consultas» o de un médico veterinario.' using errcode = '42501';
  end if;
  if coalesce(p_token_hash, '') = '' then
    raise exception 'No se pudo generar la liga.';
  end if;
  update public.vet_telemedicina set token_hash = p_token_hash, token_creado_at = now()
   where cita_id = p_cita and negocio_id = public.negocio_actual() and deleted_at is null and estado = 'programada';
  if not found then
    raise exception 'Esa teleconsulta no existe o ya no está vigente.';
  end if;
end;
$$;

-- Lo que ve el personal en la agenda y en la pantalla de la teleconsulta.
create or replace function public.vet_telemedicina_detalle(p_cita uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_t record;
begin
  if not (public.vet_agenda_puede() or public.vet_puede('atender_teleconsultas')) then
    raise exception 'Ver una teleconsulta es del personal de la clínica.' using errcode = '42501';
  end if;
  select t.id, t.proveedor, t.consentimiento_id, t.reserva_id, t.estado, t.token_creado_at into v_t
    from public.vet_telemedicina t where t.cita_id = p_cita and t.negocio_id = public.negocio_actual() and t.deleted_at is null;
  if v_t.id is null then
    return null;
  end if;
  return public.vet_telemedicina_estado(v_t.id)
    || jsonb_build_object('id', v_t.id, 'proveedor', v_t.proveedor, 'consentimiento_id', v_t.consentimiento_id, 'reserva_id', v_t.reserva_id,
                          'estado', v_t.estado, 'liga_generada_at', v_t.token_creado_at);
end;
$$;

-- El médico entra a la sala desde la agenda (con su sesión): solo en la ventana.
create or replace function public.vet_telemedicina_sala_medico(p_cita uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t record;
  v_estado jsonb;
begin
  if not public.vet_puede('atender_teleconsultas') then
    raise exception 'Atender una teleconsulta es de un médico veterinario, de admin o de quien tenga «Atender teleconsultas».' using errcode = '42501';
  end if;
  select t.* into v_t from public.vet_telemedicina t where t.cita_id = p_cita and t.negocio_id = public.negocio_actual() and t.deleted_at is null;
  if v_t.id is null then
    raise exception 'Esa cita no tiene sala de teleconsulta.';
  end if;
  v_estado := public.vet_telemedicina_estado(v_t.id);
  if v_estado ->> 'ventana' = 'cancelada' then
    raise exception 'Esa teleconsulta se canceló.';
  elsif v_estado ->> 'ventana' = 'antes' then
    raise exception 'La sala abre 15 minutos antes de la cita.';
  elsif v_estado ->> 'ventana' = 'cerrada' then
    raise exception 'La ventana de esta teleconsulta ya terminó.';
  end if;
  update public.vet_telemedicina set entro_medico_at = coalesce(entro_medico_at, now()) where id = v_t.id;
  return jsonb_build_object('proveedor', v_t.proveedor, 'sala_nombre', v_t.sala_nombre, 'sala_url', v_t.sala_url, 'hasta', v_t.ventana_hasta);
end;
$$;

-- ── La liga del dueño (solo el servidor, con la llave de servidor del negocio) ──

create or replace function public.teleconsulta_publica(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_t record;
  v_c record;
  v_cita record;
  v_estado jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  select t.* into v_t from public.vet_telemedicina t where t.token_hash = p_token_hash and t.negocio_id = public.negocio_actual() and t.deleted_at is null;
  if v_t.id is null or not coalesce(public.modulo_activo('veterinaria'), false) then
    return null;
  end if;
  v_estado := public.vet_telemedicina_estado(v_t.id);
  select c.id, c.titulo, c.cuerpo, c.estado, c.firmado_at into v_c from public.consentimientos c where c.id = v_t.consentimiento_id;
  select ci.inicia_at, ci.termina_at, ci.motivo into v_cita from public.vet_citas ci where ci.id = v_t.cita_id;
  return v_estado || jsonb_build_object(
    'negocio', (select n.nombre from public.negocios n where n.id = v_t.negocio_id),
    'telefono_negocio', (select cc.telefono_recepcion from public.cupo_configuracion cc where cc.negocio_id = v_t.negocio_id and cc.deleted_at is null limit 1),
    'mascota', (select p.nombre from public.perros p where p.id = v_t.perro_id),
    'dueno', (select cl.nombre from public.clientes cl where cl.id = v_t.cliente_id),
    'medico', (select coalesce(pr.nombre_completo, 'Médico veterinario') from public.medicos_veterinarios m left join public.profiles pr on pr.id = m.profile_id where m.id = v_t.medico_id),
    'inicia_at', v_cita.inicia_at, 'termina_at', v_cita.termina_at, 'motivo', v_cita.motivo,
    'consentimiento', jsonb_build_object('id', v_c.id, 'titulo', v_c.titulo, 'cuerpo', v_c.cuerpo, 'estado', v_c.estado, 'firmado_at', v_c.firmado_at,
      'campos', jsonb_build_object(
        'cliente_nombre', (select cl.nombre from public.clientes cl where cl.id = v_t.cliente_id),
        'mascota_nombre', (select p.nombre from public.perros p where p.id = v_t.perro_id),
        'especie', coalesce((select initcap(p.especie) from public.perros p where p.id = v_t.perro_id), 'Perro'),
        'raza', coalesce((select coalesce(rz.nombre, p.raza) from public.perros p left join public.razas rz on rz.id = p.raza_id where p.id = v_t.perro_id), 'sin raza'),
        'motivo', coalesce(nullif(v_cita.motivo, ''), 'consulta veterinaria a distancia'),
        'procedimiento', coalesce(nullif(v_cita.motivo, ''), ''),
        'medico_nombre', (select coalesce(pr.nombre_completo, 'Médico veterinario') from public.medicos_veterinarios m left join public.profiles pr on pr.id = m.profile_id where m.id = v_t.medico_id),
        'medico_cedula', (select coalesce(m.cedula_profesional, '') from public.medicos_veterinarios m where m.id = v_t.medico_id),
        'establecimiento', (select n.nombre from public.negocios n where n.id = v_t.negocio_id),
        'fecha', to_char(public.fecha_negocio(), 'DD/MM/YYYY'))));
end;
$$;

create or replace function public.teleconsulta_firmar_consentimiento(p_token_hash text, p_nombre text, p_ip text, p_hash text, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'Escribe tu nombre completo para firmar.';
  end if;
  select t.id, t.consentimiento_id, t.estado, t.ventana_hasta into v_t from public.vet_telemedicina t
   where t.token_hash = p_token_hash and t.negocio_id = public.negocio_actual() and t.deleted_at is null;
  if v_t.id is null then
    raise exception 'Esta liga ya no es válida.';
  end if;
  if v_t.estado <> 'programada' or now() > v_t.ventana_hasta then
    raise exception 'Esta teleconsulta ya no está disponible.';
  end if;
  update public.consentimientos
     set estado = 'firmado', firmado_at = now(), firmante_nombre = btrim(p_nombre), firma_metodo = 'remota', ip_firma = p_ip, hash_pdf = p_hash, storage_path = p_path
   where id = v_t.consentimiento_id and negocio_id = public.negocio_actual() and estado = 'pendiente_firma' and deleted_at is null;
  if not found then
    raise exception 'Ese consentimiento ya está firmado.';
  end if;
end;
$$;

-- La sala del dueño: solo si la ventana está abierta, el consentimiento firmado y (si aplica) la cuenta en cero.
create or replace function public.teleconsulta_sala_dueno(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t record;
  v_estado jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  select t.* into v_t from public.vet_telemedicina t where t.token_hash = p_token_hash and t.negocio_id = public.negocio_actual() and t.deleted_at is null;
  if v_t.id is null or not coalesce(public.modulo_activo('veterinaria'), false) then
    raise exception 'Esta liga ya no es válida.';
  end if;
  v_estado := public.vet_telemedicina_estado(v_t.id);
  if v_estado ->> 'ventana' = 'cancelada' then
    raise exception 'Esta teleconsulta se canceló. La clínica te avisará.';
  elsif v_estado ->> 'ventana' = 'antes' then
    raise exception 'La sala abre 15 minutos antes de la cita.';
  elsif v_estado ->> 'ventana' = 'cerrada' then
    raise exception 'Esta teleconsulta ya terminó.';
  elsif not (v_estado ->> 'consentimiento_firmado')::boolean then
    raise exception 'Antes de entrar firma el consentimiento de teleconsulta.';
  elsif not (v_estado ->> 'pagado')::boolean then
    raise exception 'La sala abre cuando se registre el pago de la teleconsulta.';
  end if;
  update public.vet_telemedicina set entro_dueno_at = coalesce(entro_dueno_at, now()) where id = v_t.id;
  return jsonb_build_object('proveedor', v_t.proveedor, 'sala_nombre', v_t.sala_nombre, 'sala_url', v_t.sala_url, 'hasta', v_t.ventana_hasta,
                            'dueno', (select cl.nombre from public.clientes cl where cl.id = v_t.cliente_id));
end;
$$;

-- ── 6. La cita manda: reprogramar mueve la ventana; cancelar o terminar cierra la sala ──
create or replace function public.vet_telemedicina_sincronizar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.vet_telemedicina
     set ventana_desde = new.inicia_at - interval '15 minutes',
         ventana_hasta = new.termina_at + interval '30 minutes',
         estado = case when new.estado in ('cancelada', 'no_llego') then 'cancelada' when new.estado = 'finalizada' then 'finalizada' else 'programada' end
   where cita_id = new.id and deleted_at is null;
  return new;
end;
$$;
create trigger vet_telemedicina_sincronizar after update of inicia_at, termina_at, estado on public.vet_citas
  for each row execute function public.vet_telemedicina_sincronizar();

-- ── 7. Dueños y permisos de ejecución ────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'guardar_veterinaria_teleconsulta(boolean,numeric)', 'vet_servicio_cargo_tele()', 'vet_telemedicina_estado(uuid)',
    'vet_telemedicina_crear(uuid,text,text,text,text)', 'vet_telemedicina_liga_nueva(uuid,text)', 'vet_telemedicina_detalle(uuid)',
    'vet_telemedicina_sala_medico(uuid)', 'teleconsulta_publica(text)', 'teleconsulta_firmar_consentimiento(text,text,text,text,text)',
    'teleconsulta_sala_dueno(text)', 'vet_telemedicina_sincronizar()', 'vet_sembrar_agenda()', 'vet_consulta_iniciar(uuid,uuid,text,uuid)'
  ] loop
    execute format('alter function public.%s owner to peludesk_definer', f);
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  -- Solo el servidor (la liga del dueño).
  foreach f in array array['teleconsulta_publica(text)', 'teleconsulta_firmar_consentimiento(text,text,text,text,text)', 'teleconsulta_sala_dueno(text)'] loop
    execute format('revoke execute on function public.%s from authenticated', f);
  end loop;
  -- Internas.
  foreach f in array array['vet_telemedicina_estado(uuid)', 'vet_telemedicina_sincronizar()', 'vet_servicio_cargo_tele()'] loop
    execute format('revoke execute on function public.%s from authenticated', f);
  end loop;
end $$;

drop function public._vet_redes(text, text);
