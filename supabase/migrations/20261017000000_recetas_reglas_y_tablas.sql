-- Veterinaria, Fase 4 · parte 1: reglas regulatorias editables, tablas de recetas, espejo del SITPV,
-- recetario especial y reporte mensual (carril A).
--
-- · REGLAS. Nada regulatorio queda fijo en el código: los plazos de conservación, el número de
--   copias, el umbral de folios, los días del recordatorio del reporte, el tope de tratamiento
--   de estupefacientes y qué documento pide cada clasificación (Grupo I, II, III, antimicrobiano
--   y las fracciones de la Ley General de Salud) viven en `vet_reglas` y `vet_reglas_clasificacion`,
--   tablas COMPARTIDAS que solo edita la plataforma (con su evento). Los valores sembrados son los
--   que dictó el dueño de PeluDesk y NO se han contrastado contra el texto del DOF.
-- · RECETA SIMPLE (`vet_recetas` + `vet_receta_lineas`): Grupos II y III y las fracciones III y IV
--   del art. 245. Solo un médico veterinario designado la emite. No se edita: se anula con motivo.
-- · ESPEJO DEL SITPV (`vet_sitpv_recetas`): PeluDesk NO emite la receta cuantificada del Grupo I;
--   guarda el registro espejo de la que se emitió en el SITPV y su folio sale del bloque del médico.
-- · RECETARIO ESPECIAL (`vet_recetario_especial`): estupefacientes y psicotrópicos fracción II.
-- · REPORTE MENSUAL (`vet_sitpv_reportes`): una marca «reportado en el SITPV» por médico y mes.
-- · CANDADO DE SALIDA: vive en el movimiento de lote (parte 2).
-- Las tablas clínicas NO se leen por la API (política de lectura falsa): todo pasa por funciones
-- que comprueban el permiso y anotan la lectura.

-- ── 0. Ayudante de esta migración ────────────────────────────────────
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
  ('emitir_recetas', 'Emitir recetas', '{veterinaria}', 30),
  ('registrar_recetas_sitpv', 'Registrar recetas SITPV', '{veterinaria}', 31),
  ('ver_libro_control', 'Ver libro de control', '{veterinaria}', 32);

-- ── 2. Lecturas: ahora también recetas, espejo y libro ───────────────
alter table public.vet_lecturas alter column perro_id drop not null;
do $$
declare
  v_nombre text;
begin
  select c.conname into v_nombre from pg_constraint c
   where c.conrelid = 'public.vet_lecturas'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%recurso%';
  if v_nombre is not null then
    execute format('alter table public.vet_lecturas drop constraint %I', v_nombre);
  end if;
  alter table public.vet_lecturas add constraint vet_lecturas_recurso_check
    check (recurso in ('expediente', 'consulta', 'linea_tiempo', 'adjunto', 'resultado', 'estimado', 'receta', 'sitpv', 'recetario', 'libro'));
end $$;

-- Una lectura sin mascota (el libro) también se acota a una por persona cada 5 minutos.
create or replace function public.vet_registrar_lectura(p_perro uuid, p_recurso text, p_recurso_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.negocio_escribible() then
    return;
  end if;
  if exists (
    select 1 from public.vet_lecturas l
    where l.negocio_id = public.negocio_actual() and l.profile_id = auth.uid() and l.perro_id is not distinct from p_perro and l.recurso = p_recurso
      and l.recurso_id is not distinct from p_recurso_id and l.leido_at > now() - interval '5 minutes'
  ) then
    return;
  end if;
  insert into public.vet_lecturas (perro_id, recurso, recurso_id) values (p_perro, p_recurso, p_recurso_id);
end;
$$;

-- ── 3. Reglas regulatorias (compartidas, las edita la plataforma) ────
create table public.vet_reglas (
  clave text primary key,
  valor jsonb not null,
  titulo text not null,
  descripcion text,
  fuente text,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create trigger set_updated_at before insert or update on public.vet_reglas
  for each row execute function public.set_updated_at();
alter table public.vet_reglas enable row level security;
create policy vet_reglas_select on public.vet_reglas for select to authenticated, peludesk_definer using (true);
grant select on public.vet_reglas to authenticated, peludesk_definer, service_role;

insert into public.vet_reglas (clave, valor, titulo, descripcion, fuente, orden) values
  ('receta_copias', '2', 'Copias de la receta', 'Cuántas copias lleva la receta además del original.', 'NOM-064-ZOO-2000 (original y 2 copias)', 10),
  ('receta_conservacion_meses', '6', 'Conservación de la receta (meses)', 'Cuánto debe conservarse una receta simple antes de poder archivarla.', 'NOM-064-ZOO-2000 (Grupo II: 6 meses)', 20),
  ('receta_conservacion_grupo_i_meses', '12', 'Conservación de la copia del Grupo I (meses)', 'Cuánto se conserva el registro espejo de una receta cuantificada antes de poder archivarlo.', 'NOM-064-ZOO-2000 (Grupo I: 1 año)', 30),
  ('lgs_tratamiento_max_dias', '30', 'Tope de tratamiento de controlados (días)', 'Máximo de días de tratamiento en una receta de recetario especial (estupefacientes y psicotrópicos fracción II).', 'Ley General de Salud, arts. 240 y 241', 40),
  ('sitpv_bloque_folios', '50', 'Folios por bloque del SITPV', 'Tamaño de cada bloque de folios que entrega el SITPV.', 'SENASICA, preguntas frecuentes SITPV', 50),
  ('sitpv_folios_alerta', '10', 'Aviso de folios por agotarse', 'Con menos folios disponibles que este número, el médico recibe aviso.', 'Criterio de PeluDesk', 60),
  ('sitpv_reporte_dia_recordatorio', '1', 'Día del recordatorio del reporte mensual', 'Día del mes desde el que se recuerda reportar el mes anterior en el SITPV.', 'SENASICA, preguntas frecuentes SITPV', 70),
  ('sitpv_reporte_dia_aviso', '3', 'Día en que el recordatorio se vuelve aviso', 'Si para este día del mes el reporte sigue sin marcarse, el aviso sube de tono.', 'Criterio de PeluDesk', 80),
  ('sitpv_meses_sin_reporte_bloqueo', '3', 'Meses sin reporte que bloquean folios', 'Con este número de meses seguidos sin reporte, el SITPV no entrega folios nuevos.', 'SENASICA, preguntas frecuentes SITPV', 90),
  ('leyenda_uso_veterinario', '"Uso exclusivo en veterinaria. Su venta o uso en seres humanos es un delito."', 'Leyenda de la receta', 'Texto de uso veterinario que lleva toda receta.', 'NOM-064-ZOO-2000', 100),
  ('leyenda_uso_hospitalario', '"USO HOSPITALARIO"', 'Leyenda de uso hospitalario', 'Va en lugar del paciente cuando el producto es de uso hospitalario.', 'SENASICA, preguntas frecuentes SITPV', 110),
  ('leyenda_parcialidades', '"Se ocupará en parcialidades"', 'Leyenda de parcialidades', 'Va en observaciones cuando el producto se usa en varias aplicaciones.', 'SENASICA, preguntas frecuentes SITPV', 120),
  ('leyenda_espejo', '"Espejo de receta SITPV – no válida para surtir"', 'Leyenda del espejo del SITPV', 'Marca del PDF de referencia del registro espejo.', 'Criterio de PeluDesk', 130);

-- Qué documento pide cada clasificación del producto.
create table public.vet_reglas_clasificacion (
  clave text primary key,
  etiqueta text not null,
  -- libre · receta_simple · receta_cedula · espejo_sitpv · receta_especial
  documento text not null check (documento in ('libre', 'receta_simple', 'receta_cedula', 'espejo_sitpv', 'receta_especial')),
  -- Cuántas veces puede surtirse la misma receta (solo receta_cedula) y en cuántos meses.
  surtidos_max int check (surtidos_max is null or surtidos_max >= 1),
  ventana_meses int check (ventana_meses is null or ventana_meses >= 1),
  -- Meses que se conserva antes de poder archivar (vacío = la regla general).
  retencion_meses int check (retencion_meses is null or retencion_meses >= 1),
  -- ¿Sus movimientos van al libro de control?
  libro_control boolean not null default false,
  nota text,
  fuente text,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create trigger set_updated_at before insert or update on public.vet_reglas_clasificacion
  for each row execute function public.set_updated_at();
alter table public.vet_reglas_clasificacion enable row level security;
create policy vet_reglas_clasificacion_select on public.vet_reglas_clasificacion for select to authenticated, peludesk_definer using (true);
grant select on public.vet_reglas_clasificacion to authenticated, peludesk_definer, service_role;

insert into public.vet_reglas_clasificacion (clave, etiqueta, documento, surtidos_max, ventana_meses, retencion_meses, libro_control, nota, fuente, orden) values
  ('senasica_I', 'Grupo I (SENASICA)', 'espejo_sitpv', null, null, 12, true,
   'Receta cuantificada, exclusiva de médico veterinario con cédula; se emite en el SITPV con folio y CPA.', 'Acuerdo DOF 12-jul-2004 (mod. 05-mar-2012); NOM-064-ZOO-2000', 10),
  ('senasica_II', 'Grupo II (SENASICA)', 'receta_simple', null, null, 6, false,
   'Receta simple, original y 2 copias.', 'Acuerdo DOF 12-jul-2004 (mod. 05-mar-2012); NOM-064-ZOO-2000', 20),
  ('senasica_III', 'Grupo III (SENASICA)', 'libre', null, null, null, false, 'De venta libre.', 'Acuerdo DOF 12-jul-2004 (mod. 05-mar-2012)', 30),
  ('antimicrobiano', 'Antimicrobiano', 'receta_simple', null, null, 6, false,
   'Los antimicrobianos son Grupo II: receta simple.', 'Acuerdo DOF 12-jul-2004 (mod. 05-mar-2012)', 40),
  ('antimicrobiano_espejo', 'Antimicrobiano con espejo cuantificado', 'espejo_sitpv', null, null, 12, true,
   'Se usa solo si el negocio activa «llevar espejo cuantificado de antimicrobianos».', 'Criterio de PeluDesk (el SITPV lo permite como opcional)', 45),
  ('estupefaciente_234', 'Estupefaciente (LGS art. 234)', 'receta_especial', null, null, 12, true,
   'Recetario especial con código de barras, tratamiento máximo de 30 días.', 'Ley General de Salud, arts. 234, 240-242', 50),
  ('psicotropico_245_II', 'Psicotrópico fracción II (LGS art. 245)', 'receta_especial', null, null, 12, true,
   'Recetario especial con código de barras, tratamiento máximo de 30 días.', 'Ley General de Salud, arts. 240-242, 245', 60),
  ('psicotropico_245_III', 'Psicotrópico fracción III (LGS art. 245)', 'receta_cedula', 1, null, 12, false,
   'Receta con cédula; se surte una vez y se retiene.', 'Ley General de Salud, art. 251', 70),
  ('psicotropico_245_IV', 'Psicotrópico fracción IV (LGS art. 245)', 'receta_cedula', 3, 6, 12, false,
   'Receta con cédula; hasta 3 surtidos en 6 meses.', 'Ley General de Salud, art. 252', 80);

-- ── 4. Datos regulatorios del producto ───────────────────────────────
alter table public.insumos
  add column registro_senasica text,
  add column laboratorio text,
  add column presentacion text;

create or replace function public.proteger_insumo_clinico()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_toca boolean;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    v_toca := new.controla_lotes or new.principio_activo_id is not null or new.grupo_senasica is not null
              or new.clasificacion_lgs is not null or new.es_antimicrobiano or new.clasificacion_por_confirmar
              or new.registro_senasica is not null or new.laboratorio is not null or new.presentacion is not null;
  else
    v_toca := new.controla_lotes is distinct from old.controla_lotes or new.principio_activo_id is distinct from old.principio_activo_id
              or new.grupo_senasica is distinct from old.grupo_senasica or new.clasificacion_lgs is distinct from old.clasificacion_lgs
              or new.es_antimicrobiano is distinct from old.es_antimicrobiano
              or new.clasificacion_por_confirmar is distinct from old.clasificacion_por_confirmar
              or new.registro_senasica is distinct from old.registro_senasica or new.laboratorio is distinct from old.laboratorio
              or new.presentacion is distinct from old.presentacion;
  end if;
  if v_toca and not coalesce(public.tiene_permiso('lotes_clinicos'), false) then
    raise exception 'Los lotes y las clasificaciones de un producto clínico los edita un admin o quien tenga «Administrar lotes e inventario clínico», con el módulo Veterinaria prendido.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ── 5. Ajuste del negocio: espejo cuantificado de antimicrobianos ────
alter table public.veterinaria_ajustes
  add column espejo_antimicrobianos boolean not null default false;

do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.veterinaria_ajustes_actuales()'::regprocedure);
  if v_def not like '%espejo_antimicrobianos%' then
    v_def := replace(v_def, '''portal_expediente'', a.portal_expediente)', '''portal_expediente'', a.portal_expediente, ''espejo_antimicrobianos'', a.espejo_antimicrobianos)');
    v_def := replace(v_def, '''portal_expediente'', false)', '''portal_expediente'', false, ''espejo_antimicrobianos'', false)');
    if v_def not like '%a.espejo_antimicrobianos%' or v_def not like '%''espejo_antimicrobianos'', false%' then
      raise exception 'No se pudo parchar veterinaria_ajustes_actuales: cambió su texto.';
    end if;
    execute v_def;
  end if;
end $$;

create or replace function public.guardar_veterinaria_espejo_antimicrobianos(p_activo boolean)
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
  if exists (select 1 from public.veterinaria_ajustes where negocio_id = public.negocio_actual() and deleted_at is null) then
    update public.veterinaria_ajustes set espejo_antimicrobianos = coalesce(p_activo, false)
     where negocio_id = public.negocio_actual() and deleted_at is null;
  else
    insert into public.veterinaria_ajustes (espejo_antimicrobianos) values (coalesce(p_activo, false));
  end if;
end;
$$;

-- ── 6. Recetas simples ───────────────────────────────────────────────
create table public.vet_recetas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  perro_id uuid not null references public.perros(id),
  cliente_id uuid not null references public.clientes(id),
  consulta_id uuid references public.vet_consultas(id),
  medico_id uuid not null references public.medicos_veterinarios(id),
  numero int not null,
  estado text not null default 'emitida' check (estado in ('emitida', 'anulada')),
  fecha_emision date not null default public.fecha_negocio(),
  diagnostico text,
  observaciones text,
  -- Foto de establecimiento, médico, mascota, propietario y leyendas al emitirla.
  snapshot jsonb not null,
  copias int not null default 2 check (copias between 0 and 10),
  conservar_hasta date not null,
  hash_contenido text,
  token_hash text,
  enviada_at timestamptz,
  anulada_at timestamptz,
  anulada_por uuid references auth.users(id) on delete set null,
  anulada_motivo text,
  archivada_at timestamptz,
  archivada_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (estado <> 'anulada' or (anulada_at is not null and btrim(coalesce(anulada_motivo, '')) <> ''))
);
create unique index vet_recetas_numero on public.vet_recetas (negocio_id, numero);
create unique index vet_recetas_token on public.vet_recetas (token_hash) where token_hash is not null;
create index vet_recetas_perro_idx on public.vet_recetas (perro_id, fecha_emision desc);
select public._vet_redes('vet_recetas', 'false');

create table public.vet_receta_lineas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  receta_id uuid not null references public.vet_recetas(id),
  orden int not null default 1,
  insumo_id uuid references public.insumos(id),
  producto text not null check (btrim(producto) <> ''),
  principio_activo text,
  presentacion text,
  dosis text not null check (btrim(dosis) <> ''),
  via text not null check (btrim(via) <> ''),
  frecuencia text not null check (btrim(frecuencia) <> ''),
  -- Para calcular la cantidad: dosis numérica por toma y cada cuántas horas.
  dosis_cantidad numeric(10, 3) check (dosis_cantidad is null or dosis_cantidad > 0),
  frecuencia_horas numeric(6, 2) check (frecuencia_horas is null or frecuencia_horas > 0),
  duracion_dias int not null check (duracion_dias between 1 and 365),
  tiempo_retiro text,
  cantidad_calculada numeric(12, 2),
  cantidad_surtir numeric(12, 2) not null check (cantidad_surtir > 0),
  cantidad_unidad text,
  indicaciones text,
  -- La regla que aplicaba al producto al emitirla (foto: cambiar la regla no altera lo emitido).
  documento text not null default 'receta_simple',
  clasificacion text,
  surtidos_max int,
  ventana_meses int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index vet_receta_lineas_receta_idx on public.vet_receta_lineas (receta_id, orden);
select public._vet_redes('vet_receta_lineas', 'false');

-- Una receta emitida no se edita ni se borra: solo se anula, se manda, se archiva.
create or replace function public.vet_receta_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_libres text[] := array['estado', 'anulada_at', 'anulada_por', 'anulada_motivo', 'token_hash', 'enviada_at', 'archivada_at', 'archivada_por', 'updated_at'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Una receta no se borra: se anula con motivo.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - v_libres) is distinct from (to_jsonb(old) - v_libres) then
    raise exception 'Una receta emitida no se edita: anúlala con motivo y emite otra.' using errcode = '42501';
  end if;
  if old.estado = 'anulada' and (new.estado <> 'anulada' or new.anulada_motivo is distinct from old.anulada_motivo) then
    raise exception 'Una receta anulada no se reactiva.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.vet_receta_inmutable() from public, anon;
create trigger vet_receta_inmutable before update or delete on public.vet_recetas
  for each row execute function public.vet_receta_inmutable();

create or replace function public.vet_receta_linea_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Las líneas de una receta no se editan ni se borran: anula la receta y emite otra.' using errcode = '42501';
end;
$$;
revoke execute on function public.vet_receta_linea_inmutable() from public, anon;
create trigger vet_receta_linea_inmutable before update or delete on public.vet_receta_lineas
  for each row execute function public.vet_receta_linea_inmutable();

-- ── 7. Espejo del SITPV (Grupo I) ────────────────────────────────────
create table public.vet_sitpv_recetas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  medico_id uuid not null references public.medicos_veterinarios(id),
  folio_texto text not null,
  cpa text not null check (btrim(cpa) <> ''),
  fecha date not null default public.fecha_negocio(),
  perro_id uuid references public.perros(id),
  uso_hospitalario boolean not null default false,
  insumo_id uuid not null references public.insumos(id),
  producto text not null,
  registro_senasica text not null check (btrim(registro_senasica) <> ''),
  principio_activo text,
  laboratorio text,
  lote_id uuid references public.insumo_lotes(id),
  lote_texto text,
  presentacion text,
  dosis text,
  intervalo text,
  duracion text,
  cantidad_total numeric(12, 2) not null check (cantidad_total > 0),
  cantidad_unidad text,
  parcialidades boolean not null default false,
  comprobante_compra text,
  observaciones text,
  es_antimicrobiano boolean not null default false,
  estado text not null default 'registrada' check (estado in ('registrada', 'cancelada')),
  cancelada_at timestamptz,
  cancelada_por uuid references auth.users(id) on delete set null,
  cancelada_motivo text,
  conservar_hasta date not null,
  archivada_at timestamptz,
  archivada_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (uso_hospitalario or perro_id is not null),
  check (estado <> 'cancelada' or (cancelada_at is not null and btrim(coalesce(cancelada_motivo, '')) <> ''))
);
create unique index vet_sitpv_recetas_folio on public.vet_sitpv_recetas (negocio_id, medico_id, lower(folio_texto));
create index vet_sitpv_recetas_fecha_idx on public.vet_sitpv_recetas (medico_id, fecha);
select public._vet_redes('vet_sitpv_recetas', 'false');

-- ── 8. Recetario especial (estupefacientes y psicotrópicos fr. II) ───
create table public.vet_recetario_especial (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  medico_id uuid not null references public.medicos_veterinarios(id),
  perro_id uuid not null references public.perros(id),
  insumo_id uuid not null references public.insumos(id),
  producto text not null,
  folio_recetario text not null check (btrim(folio_recetario) <> ''),
  codigo_barras text not null check (btrim(codigo_barras) <> ''),
  fecha date not null default public.fecha_negocio(),
  dias_tratamiento int not null check (dias_tratamiento >= 1),
  cantidad_diaria numeric(12, 3) not null check (cantidad_diaria > 0),
  cantidad_total numeric(12, 2) not null check (cantidad_total > 0),
  cantidad_unidad text,
  indicaciones text,
  estado text not null default 'vigente' check (estado in ('vigente', 'cancelada')),
  cancelada_at timestamptz,
  cancelada_por uuid references auth.users(id) on delete set null,
  cancelada_motivo text,
  conservar_hasta date not null,
  archivada_at timestamptz,
  archivada_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (estado <> 'cancelada' or (cancelada_at is not null and btrim(coalesce(cancelada_motivo, '')) <> ''))
);
create unique index vet_recetario_especial_folio on public.vet_recetario_especial (negocio_id, lower(btrim(folio_recetario)));
select public._vet_redes('vet_recetario_especial', 'false');

-- Espejo y recetario: solo cambian su estado y su archivado.
create or replace function public.vet_documento_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_libres text[] := array['estado', 'cancelada_at', 'cancelada_por', 'cancelada_motivo', 'archivada_at', 'archivada_por', 'updated_at'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Este registro no se borra: se cancela con motivo.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - v_libres) is distinct from (to_jsonb(old) - v_libres) then
    raise exception 'Este registro no se edita: cancélalo con motivo y registra otro.' using errcode = '42501';
  end if;
  if old.estado = 'cancelada' and new.estado <> 'cancelada' then
    raise exception 'Un registro cancelado no se reactiva.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.vet_documento_inmutable() from public, anon;
create trigger vet_documento_inmutable before update or delete on public.vet_sitpv_recetas
  for each row execute function public.vet_documento_inmutable();
create trigger vet_documento_inmutable before update or delete on public.vet_recetario_especial
  for each row execute function public.vet_documento_inmutable();

-- ── 9. Reporte mensual del SITPV: la marca «reportado» ───────────────
create table public.vet_sitpv_reportes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  medico_id uuid not null references public.medicos_veterinarios(id),
  periodo date not null check (periodo = date_trunc('month', periodo)::date),
  reportado_at timestamptz not null default now(),
  reportado_por uuid not null references auth.users(id) default auth.uid(),
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index vet_sitpv_reportes_mes on public.vet_sitpv_reportes (medico_id, periodo) where deleted_at is null;
select public._vet_redes('vet_sitpv_reportes', 'false');
create trigger vet_solo_agregar before update or delete on public.vet_sitpv_reportes
  for each row execute function public.vet_solo_agregar();

-- ── 10. El movimiento de lote ahora dice con qué documento salió ─────
alter table public.lotes_movimientos
  add column receta_linea_id uuid references public.vet_receta_lineas(id),
  add column espejo_id uuid references public.vet_sitpv_recetas(id),
  add column recetario_id uuid references public.vet_recetario_especial(id),
  add column perro_id uuid references public.perros(id),
  add column consulta_id uuid references public.vet_consultas(id),
  add column uso_hospitalario boolean not null default false,
  add column medico_id uuid references public.medicos_veterinarios(id),
  -- Una salida repartida entre varios lotes comparte este evento: cuenta como UN surtido.
  add column evento_surtido uuid;
create index lotes_movimientos_espejo_idx on public.lotes_movimientos (espejo_id) where espejo_id is not null;
create index lotes_movimientos_receta_idx on public.lotes_movimientos (receta_linea_id) where receta_linea_id is not null;
create index lotes_movimientos_recetario_idx on public.lotes_movimientos (recetario_id) where recetario_id is not null;
