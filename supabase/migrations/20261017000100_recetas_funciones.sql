-- Veterinaria, Fase 4 · parte 2: requisito por producto, candado de salida del lote, surtido
-- documentado y receta simple (carril A).
--
-- · `vet_requisito_insumo(insumo)`: qué documento pide un producto, según sus clasificaciones y las
--   reglas que edita la plataforma (`vet_reglas_clasificacion`). Gana el más estricto.
-- · CANDADO: toda salida de lote («salida_surtido») de un producto que pide documento solo entra si
--   viene ligada a ese documento (registro espejo del SITPV, recetario especial o receta con cédula).
--   El candado vive en el propio movimiento del lote, así que lo pisan igual la venta de mostrador,
--   el consumo de una receta de estética, la hospitalización o la pantalla de inventario: ninguna
--   puede sacar un controlado sin receta. Las mermas, caducados y ajustes quedan en el libro con su
--   motivo y no necesitan receta (no se surte a nadie).
-- · No se toca ninguna tabla de cobros, caja ni facturación.

-- ── 1. Reglas ────────────────────────────────────────────────────────
create or replace function public.vet_regla(p_clave text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select r.valor from public.vet_reglas r where r.clave = p_clave;
$$;

create or replace function public.vet_regla_num(p_clave text, p_defecto numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select case when jsonb_typeof(r.valor) = 'number' then (r.valor #>> '{}')::numeric end from public.vet_reglas r where r.clave = p_clave), p_defecto);
$$;

create or replace function public.vet_regla_texto(p_clave text, p_defecto text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select case when jsonb_typeof(r.valor) = 'string' then r.valor #>> '{}' end from public.vet_reglas r where r.clave = p_clave), p_defecto);
$$;

-- Unidades base que vale una unidad de consumo del producto.
create or replace function public.vet_equiv_consumo(p_insumo uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select um.equivalencia_en_base from public.insumos i join public.unidades_medida um on um.id = i.unidad_consumo_id where i.id = p_insumo), 1);
$$;

-- Qué documento pide el producto. Cada clasificación aporta su regla; gana la más estricta
-- (recetario especial > espejo del SITPV > receta con cédula > receta simple > libre). El
-- libro de control aplica si cualquiera de sus clasificaciones lo pide.
create or replace function public.vet_requisito_insumo(p_insumo uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_i record;
  v_claves text[] := '{}';
  v_espejo boolean;
  v_r jsonb;
begin
  select i.grupo_senasica, i.clasificacion_lgs, i.es_antimicrobiano into v_i
  from public.insumos i where i.id = p_insumo and i.negocio_id = public.negocio_actual();
  if v_i.grupo_senasica is not null then
    v_claves := array_append(v_claves, 'senasica_' || v_i.grupo_senasica);
  end if;
  if v_i.clasificacion_lgs is not null then
    v_claves := array_append(v_claves, v_i.clasificacion_lgs);
  end if;
  if coalesce(v_i.es_antimicrobiano, false) then
    select a.espejo_antimicrobianos into v_espejo from public.veterinaria_ajustes a
     where a.negocio_id = public.negocio_actual() and a.deleted_at is null;
    v_claves := array_append(v_claves, case when coalesce(v_espejo, false) then 'antimicrobiano_espejo' else 'antimicrobiano' end);
  end if;
  select jsonb_build_object(
           'documento', r.documento, 'clave', r.clave, 'etiqueta', r.etiqueta, 'surtidos_max', r.surtidos_max,
           'ventana_meses', r.ventana_meses, 'retencion_meses', r.retencion_meses,
           'libro_control', (select coalesce(bool_or(x.libro_control), false) from public.vet_reglas_clasificacion x where x.clave = any(v_claves)),
           'claves', to_jsonb(v_claves))
    into v_r
  from public.vet_reglas_clasificacion r
  where r.clave = any(v_claves)
  order by case r.documento when 'receta_especial' then 5 when 'espejo_sitpv' then 4 when 'receta_cedula' then 3 when 'receta_simple' then 2 else 1 end desc, r.orden
  limit 1;
  return coalesce(v_r, jsonb_build_object('documento', 'libre', 'clave', null, 'etiqueta', null, 'surtidos_max', null,
                                          'ventana_meses', null, 'retencion_meses', null, 'libro_control', false, 'claves', '[]'::jsonb));
end;
$$;

-- Cantidad a surtir: dosis por toma × tomas al día × días (redondeada hacia arriba).
create or replace function public.vet_receta_calcular(p_dosis numeric, p_frecuencia_horas numeric, p_dias int)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select ceil(p_dosis * case when coalesce(p_frecuencia_horas, 0) <= 0 then 1 else (24.0 / p_frecuencia_horas) * p_dias end);
$$;

-- ── 2. Reglas: las edita solo la plataforma ──────────────────────────
do $$
declare
  v_def text;
  v_acciones text[];
  v_nuevas text[] := array['editar_regla_vet'];
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c where c.conname = 'plataforma_eventos_accion_check' and c.conrelid = 'public.plataforma_eventos'::regclass;
  if position('{' in v_def) > 0 then
    v_acciones := string_to_array(substring(v_def from '{([a-z_0-9,]+)}'), ',');
  else
    select coalesce(array_agg(distinct m[1]), '{}') into v_acciones
    from regexp_matches(v_def, '''([a-z_0-9]+)''', 'g') as m;
  end if;
  if cardinality(v_acciones) < 5 then
    raise exception 'No se pudo leer la lista de acciones de plataforma_eventos.';
  end if;
  v_acciones := (select array_agg(distinct a) from unnest(v_acciones || v_nuevas) a);
  alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
  execute format('alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check check (accion = any (%L::text[]))', v_acciones);
end $$;

create or replace function public.plataforma_vet_regla_guardar(p_clave text, p_valor jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_antes jsonb;
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  select r.valor into v_antes from public.vet_reglas r where r.clave = p_clave;
  if not found then
    raise exception 'Esa regla no existe.';
  end if;
  if p_clave like 'leyenda_%' then
    if jsonb_typeof(p_valor) <> 'string' or btrim(p_valor #>> '{}') = '' then
      raise exception 'Escribe el texto de la leyenda.';
    end if;
  else
    if jsonb_typeof(p_valor) <> 'number' or (p_valor #>> '{}')::numeric < 0 or (p_valor #>> '{}')::numeric <> trunc((p_valor #>> '{}')::numeric) then
      raise exception 'Escribe un número entero de cero o más.';
    end if;
    if p_clave in ('lgs_tratamiento_max_dias', 'sitpv_bloque_folios', 'sitpv_reporte_dia_recordatorio', 'sitpv_reporte_dia_aviso', 'sitpv_meses_sin_reporte_bloqueo')
       and (p_valor #>> '{}')::numeric < 1 then
      raise exception 'Este valor debe ser de 1 o más.';
    end if;
    if p_clave in ('sitpv_reporte_dia_recordatorio', 'sitpv_reporte_dia_aviso') and (p_valor #>> '{}')::numeric > 28 then
      raise exception 'El día va del 1 al 28.';
    end if;
  end if;
  update public.vet_reglas set valor = p_valor where clave = p_clave;
  perform public.plataforma_registrar_evento('editar_regla_vet', null, null, null,
    jsonb_build_object('regla', p_clave, 'antes', v_antes, 'despues', p_valor));
end;
$fn$;

create or replace function public.plataforma_vet_clasificacion_guardar(
  p_clave text, p_documento text, p_surtidos_max int, p_ventana_meses int, p_retencion_meses int, p_libro_control boolean, p_nota text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_antes jsonb;
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  select to_jsonb(r) - 'created_at' - 'updated_at' - 'created_by' into v_antes from public.vet_reglas_clasificacion r where r.clave = p_clave;
  if not found then
    raise exception 'Esa clasificación no existe.';
  end if;
  if p_documento not in ('libre', 'receta_simple', 'receta_cedula', 'espejo_sitpv', 'receta_especial') then
    raise exception 'Documento inválido.';
  end if;
  if p_surtidos_max is not null and p_surtidos_max < 1 then
    raise exception 'Los surtidos máximos son 1 o más (o vacío).';
  end if;
  if p_ventana_meses is not null and p_ventana_meses < 1 then
    raise exception 'La ventana va de 1 mes en adelante (o vacía).';
  end if;
  if p_retencion_meses is not null and p_retencion_meses < 1 then
    raise exception 'La conservación va de 1 mes en adelante (o vacía).';
  end if;
  update public.vet_reglas_clasificacion
     set documento = p_documento, surtidos_max = p_surtidos_max, ventana_meses = p_ventana_meses, retencion_meses = p_retencion_meses,
         libro_control = coalesce(p_libro_control, false), nota = nullif(btrim(coalesce(p_nota, '')), '')
   where clave = p_clave;
  perform public.plataforma_registrar_evento('editar_regla_vet', null, null, null,
    jsonb_build_object('clasificacion', p_clave, 'antes', v_antes,
      'despues', jsonb_build_object('documento', p_documento, 'surtidos_max', p_surtidos_max, 'ventana_meses', p_ventana_meses,
                                    'retencion_meses', p_retencion_meses, 'libro_control', coalesce(p_libro_control, false))));
end;
$fn$;

-- ── 3. Datos regulatorios del producto ───────────────────────────────
create or replace function public.vet_producto_regulatorio_guardar(p_insumo uuid, p_registro text, p_laboratorio text, p_presentacion text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_lotes_clinicos();
  update public.insumos
     set registro_senasica = nullif(btrim(coalesce(p_registro, '')), ''), laboratorio = nullif(btrim(coalesce(p_laboratorio, '')), ''),
         presentacion = nullif(btrim(coalesce(p_presentacion, '')), '')
   where id = p_insumo and deleted_at is null and controla_lotes;
  if not found then
    raise exception 'Ese producto clínico no existe.';
  end if;
end;
$$;

-- ── 4. El candado ────────────────────────────────────────────────────
create or replace function public.lotes_movimientos_candado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req jsonb;
  v_doc text;
  v_tipo text := nullif(current_setting('app.vet_doc_tipo', true), '');
  v_id uuid := nullif(current_setting('app.vet_doc_id', true), '')::uuid;
  v_perro uuid := nullif(current_setting('app.vet_perro', true), '')::uuid;
  v_consulta uuid := nullif(current_setting('app.vet_consulta', true), '')::uuid;
  v_evento uuid := nullif(current_setting('app.vet_evento', true), '')::uuid;
  v_nombre text;
  v_equiv numeric;
  v_usado numeric;
  v_hay boolean;
  v_esp record;
  v_rec record;
  v_lin record;
  v_otros int;
begin
  if new.tipo <> 'salida_surtido' then
    return new;
  end if;
  v_req := public.vet_requisito_insumo(new.insumo_id);
  v_doc := v_req ->> 'documento';
  if v_doc = 'libre' or (v_doc = 'receta_simple' and v_tipo is distinct from 'receta') then
    return new;
  end if;
  select i.nombre into v_nombre from public.insumos i where i.id = new.insumo_id;
  if v_tipo is null or v_id is null then
    raise exception '«%» es un producto controlado: solo sale del inventario con %. Regístrala en Veterinaria → Recetas y surte desde ahí.',
      v_nombre,
      case v_doc when 'espejo_sitpv' then 'el registro de su receta cuantificada del SITPV'
                 when 'receta_especial' then 'el folio de su recetario especial'
                 else 'una receta con cédula' end
      using errcode = '42501';
  end if;
  if (v_doc = 'espejo_sitpv' and v_tipo <> 'espejo') or (v_doc = 'receta_especial' and v_tipo <> 'recetario') or (v_doc = 'receta_cedula' and v_tipo <> 'receta') then
    raise exception '«%» pide % y no otro documento.', v_nombre,
      case v_doc when 'espejo_sitpv' then 'el registro de su receta cuantificada del SITPV'
                 when 'receta_especial' then 'el folio de su recetario especial'
                 else 'una receta con cédula' end
      using errcode = '42501';
  end if;
  v_equiv := public.vet_equiv_consumo(new.insumo_id);
  v_evento := coalesce(v_evento, gen_random_uuid());

  if v_tipo = 'espejo' then
    select e.* into v_esp from public.vet_sitpv_recetas e where e.id = v_id and e.negocio_id = public.negocio_actual() and e.deleted_at is null;
    v_hay := found;
    if not v_hay or v_esp.estado <> 'registrada' then
      raise exception 'Ese registro del SITPV no existe o está cancelado.' using errcode = '42501';
    end if;
    if v_esp.insumo_id <> new.insumo_id then
      raise exception 'Ese registro del SITPV es de otro producto, no de «%».', v_nombre using errcode = '42501';
    end if;
    if not v_esp.uso_hospitalario then
      if v_perro is not null and v_perro <> v_esp.perro_id then
        raise exception 'Ese registro del SITPV es de otra mascota.' using errcode = '42501';
      end if;
      v_perro := v_esp.perro_id;
    end if;
    select coalesce(sum(m.cantidad_base), 0) into v_usado from public.lotes_movimientos m
     where m.espejo_id = v_id and m.tipo = 'salida_surtido' and m.deleted_at is null;
    if v_usado + new.cantidad_base > v_esp.cantidad_total * v_equiv then
      raise exception 'Eso excede lo que ampara el registro del SITPV (folio %): amparaba % y ya se usó %.', v_esp.folio_texto,
        v_esp.cantidad_total, round(v_usado / v_equiv, 2) using errcode = '42501';
    end if;
    if not v_esp.parcialidades then
      select count(distinct m.evento_surtido) into v_otros from public.lotes_movimientos m
       where m.espejo_id = v_id and m.tipo = 'salida_surtido' and m.deleted_at is null and m.evento_surtido is distinct from v_evento;
      if v_otros > 0 then
        raise exception 'El registro del SITPV folio % no es en parcialidades y ya se surtió.', v_esp.folio_texto using errcode = '42501';
      end if;
    end if;
    new.espejo_id := v_id;
    new.folio_receta := v_esp.folio_texto;
    new.uso_hospitalario := v_esp.uso_hospitalario;
    new.medico_id := v_esp.medico_id;
  elsif v_tipo = 'recetario' then
    select r.* into v_rec from public.vet_recetario_especial r where r.id = v_id and r.negocio_id = public.negocio_actual() and r.deleted_at is null;
    v_hay := found;
    if not v_hay or v_rec.estado <> 'vigente' then
      raise exception 'Ese folio de recetario especial no existe o está cancelado.' using errcode = '42501';
    end if;
    if v_rec.insumo_id <> new.insumo_id then
      raise exception 'Ese folio de recetario es de otro producto, no de «%».', v_nombre using errcode = '42501';
    end if;
    if v_perro is not null and v_perro <> v_rec.perro_id then
      raise exception 'Ese folio de recetario es de otra mascota.' using errcode = '42501';
    end if;
    v_perro := v_rec.perro_id;
    select coalesce(sum(m.cantidad_base), 0) into v_usado from public.lotes_movimientos m
     where m.recetario_id = v_id and m.tipo = 'salida_surtido' and m.deleted_at is null;
    if v_usado + new.cantidad_base > v_rec.cantidad_total * v_equiv then
      raise exception 'Eso excede lo que ampara el folio de recetario %.', v_rec.folio_recetario using errcode = '42501';
    end if;
    new.recetario_id := v_id;
    new.folio_receta := v_rec.folio_recetario;
    new.medico_id := v_rec.medico_id;
  else
    select l.id, l.insumo_id, l.cantidad_surtir, l.surtidos_max, l.ventana_meses, l.receta_id,
           r.estado, r.perro_id, r.numero, r.fecha_emision, r.medico_id
      into v_lin
      from public.vet_receta_lineas l join public.vet_recetas r on r.id = l.receta_id
     where l.id = v_id and l.negocio_id = public.negocio_actual() and l.deleted_at is null and r.deleted_at is null;
    v_hay := found;
    if not v_hay or v_lin.estado <> 'emitida' then
      raise exception 'Esa receta no existe o está anulada.' using errcode = '42501';
    end if;
    if v_lin.insumo_id is distinct from new.insumo_id then
      raise exception 'Esa línea de la receta es de otro producto, no de «%».', v_nombre using errcode = '42501';
    end if;
    if v_perro is not null and v_perro <> v_lin.perro_id then
      raise exception 'Esa receta es de otra mascota.' using errcode = '42501';
    end if;
    v_perro := v_lin.perro_id;
    if v_lin.ventana_meses is not null and public.fecha_negocio() > (v_lin.fecha_emision + make_interval(months => v_lin.ventana_meses))::date then
      raise exception 'Esa receta ya pasó de sus % meses para surtirse (emitida el %).', v_lin.ventana_meses, v_lin.fecha_emision using errcode = '42501';
    end if;
    if v_lin.surtidos_max is not null then
      select count(distinct m.evento_surtido) into v_otros from public.lotes_movimientos m
       where m.receta_linea_id = v_id and m.tipo = 'salida_surtido' and m.deleted_at is null and m.evento_surtido is distinct from v_evento;
      if v_otros >= v_lin.surtidos_max then
        raise exception 'Esa receta ya se surtió el máximo de veces que permite (%).', v_lin.surtidos_max using errcode = '42501';
      end if;
    end if;
    select coalesce(sum(m.cantidad_base), 0) into v_usado from public.lotes_movimientos m
     where m.receta_linea_id = v_id and m.tipo = 'salida_surtido' and m.deleted_at is null;
    if v_usado + new.cantidad_base > v_lin.cantidad_surtir * v_equiv then
      raise exception 'Eso excede la cantidad que ampara la receta (%).', v_lin.cantidad_surtir using errcode = '42501';
    end if;
    new.receta_linea_id := v_id;
    new.folio_receta := 'Receta ' || v_lin.numero::text;
    new.medico_id := v_lin.medico_id;
  end if;
  new.perro_id := v_perro;
  new.consulta_id := v_consulta;
  new.evento_surtido := v_evento;
  return new;
end;
$$;
alter function public.lotes_movimientos_candado() owner to peludesk_definer;
revoke execute on function public.lotes_movimientos_candado() from public, anon;
create trigger lotes_movimientos_candado before insert on public.lotes_movimientos
  for each row execute function public.lotes_movimientos_candado();

-- ── 5. Surtir con documento ──────────────────────────────────────────
create or replace function public.vet_puede_surtir()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.vet_puede('lotes_clinicos'), false) or coalesce(public.vet_puede('emitir_recetas'), false)
      or coalesce(public.vet_puede('registrar_recetas_sitpv'), false) or coalesce(public.vet_puede('hospitalizar'), false);
$$;

-- Saca producto de uno o más lotes contra un documento. Tipos: 'receta' (id de la LÍNEA de la
-- receta), 'espejo' (registro del SITPV) o 'recetario' (folio del recetario especial).
create or replace function public.vet_surtir_controlado(
  p_tipo text, p_doc uuid, p_salidas jsonb, p_perro uuid default null, p_consulta uuid default null, p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s jsonb;
  v_lote record;
  v_cant numeric;
  v_evento uuid := gen_random_uuid();
  v_insumo uuid;
  v_n int := 0;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not public.vet_puede_surtir() then
    raise exception 'Surtir un producto controlado es de un médico veterinario, de admin o de quien tenga el permiso correspondiente.' using errcode = '42501';
  end if;
  if p_tipo not in ('receta', 'espejo', 'recetario') then
    raise exception 'Tipo de documento inválido.';
  end if;
  if jsonb_typeof(p_salidas) <> 'array' or jsonb_array_length(p_salidas) not between 1 and 20 then
    raise exception 'Elige de qué lote sale el producto.';
  end if;
  if p_perro is not null and not exists (select 1 from public.perros p where p.id = p_perro and p.negocio_id = public.negocio_actual() and p.deleted_at is null) then
    raise exception 'Esa mascota no existe.';
  end if;
  perform set_config('app.vet_doc_tipo', p_tipo, true);
  perform set_config('app.vet_doc_id', p_doc::text, true);
  perform set_config('app.vet_perro', coalesce(p_perro::text, ''), true);
  perform set_config('app.vet_consulta', coalesce(p_consulta::text, ''), true);
  perform set_config('app.vet_evento', v_evento::text, true);
  for v_s in select * from jsonb_array_elements(p_salidas) loop
    v_cant := nullif(v_s ->> 'cantidad', '')::numeric;
    if v_cant is null or v_cant <= 0 then
      raise exception 'La cantidad debe ser mayor a cero.';
    end if;
    select l.id, l.insumo_id, l.fecha_caducidad into v_lote from public.insumo_lotes l
     where l.id = (v_s ->> 'lote_id')::uuid and l.negocio_id = public.negocio_actual() and l.deleted_at is null;
    if v_lote.id is null then
      raise exception 'Ese lote no existe.';
    end if;
    if v_lote.fecha_caducidad is not null and v_lote.fecha_caducidad < public.fecha_negocio() then
      raise exception 'Ese lote está caducado.';
    end if;
    if v_insumo is not null and v_insumo <> v_lote.insumo_id then
      raise exception 'Todos los lotes de un surtido deben ser del mismo producto.';
    end if;
    v_insumo := v_lote.insumo_id;
    perform public.vet_descontar_lote(v_lote.id, v_cant, v_motivo);
    v_n := v_n + 1;
  end loop;
  perform set_config('app.vet_doc_tipo', '', true);
  perform set_config('app.vet_doc_id', '', true);
  perform set_config('app.vet_perro', '', true);
  perform set_config('app.vet_consulta', '', true);
  perform set_config('app.vet_evento', '', true);
  return jsonb_build_object('evento', v_evento, 'lotes', v_n);
exception when others then
  perform set_config('app.vet_doc_tipo', '', true);
  perform set_config('app.vet_doc_id', '', true);
  perform set_config('app.vet_perro', '', true);
  perform set_config('app.vet_consulta', '', true);
  perform set_config('app.vet_evento', '', true);
  raise;
end;
$$;

-- ── 6. Receta simple ─────────────────────────────────────────────────
create or replace function public.vet_recetas_puede_leer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.vet_puede('emitir_recetas'), false) or coalesce(public.vet_puede_leer(), false);
$$;

create or replace function public.vet_receta_hash(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'numero', r.numero, 'fecha', r.fecha_emision, 'perro', r.perro_id, 'medico', r.medico_id, 'diagnostico', r.diagnostico, 'observaciones', r.observaciones,
    'lineas', coalesce((select jsonb_agg(jsonb_build_array(l.producto, l.principio_activo, l.presentacion, l.dosis, l.via, l.frecuencia,
                                                           l.duracion_dias, l.tiempo_retiro, l.cantidad_surtir, l.cantidad_unidad, l.indicaciones) order by l.orden, l.id)
                        from public.vet_receta_lineas l where l.receta_id = r.id and l.deleted_at is null), '[]'::jsonb))::text, 'UTF8')), 'hex')
  from public.vet_recetas r where r.id = p_id;
$$;

-- El hash se fija una sola vez, al terminar de emitirla.
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
  -- Mientras se emite (aún sin hash) se completan su hash, su conservación y su foto.
  if old.hash_contenido is null then
    v_libres := v_libres || array['hash_contenido', 'conservar_hasta', 'snapshot'];
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

-- Emite una receta simple. Solo un médico veterinario designado, a su nombre y con su cédula.
-- p_lineas: [{insumo_id?, producto, principio_activo?, presentacion?, dosis, dosis_cantidad?, via,
--             frecuencia, frecuencia_horas?, duracion_dias, tiempo_retiro?, cantidad_surtir?,
--             cantidad_unidad?, indicaciones?}]
create or replace function public.vet_receta_emitir(p_perro uuid, p_consulta uuid, p_lineas jsonb, p_diagnostico text, p_observaciones text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_medico record;
  v_perro record;
  v_cliente record;
  v_negocio record;
  v_est record;
  v_cons record;
  v_ins record;
  v_hoy date := public.fecha_negocio();
  v_id uuid := gen_random_uuid();
  v_num int;
  v_copias int := public.vet_regla_num('receta_copias', 2)::int;
  v_meses int := public.vet_regla_num('receta_conservacion_meses', 6)::int;
  v_snapshot jsonb;
  v_l jsonb;
  v_i int := 0;
  v_req jsonb;
  v_doc text;
  v_insumo uuid;
  v_producto text;
  v_pa text;
  v_pres text;
  v_dosis text;
  v_via text;
  v_frec text;
  v_dosis_n numeric;
  v_frec_h numeric;
  v_dias int;
  v_calc numeric;
  v_cant numeric;
  v_unidad text;
  v_cedula boolean := false;
  v_retencion int;
begin
  if not public.vet_puede('emitir_recetas') then
    raise exception 'Emitir recetas es de un médico veterinario, de admin o de quien tenga «Emitir recetas».' using errcode = '42501';
  end if;
  select m.id, m.cedula_profesional, m.cpa_sitpv, pr.nombre_completo as nombre into v_medico
    from public.medicos_veterinarios m join public.profiles pr on pr.id = m.profile_id
   where m.profile_id = auth.uid() and m.negocio_id = public.negocio_actual() and m.deleted_at is null;
  if v_medico.id is null then
    raise exception 'Una receta la emite solo un médico veterinario designado, con su cédula. Un admin que no es médico no puede emitirla.' using errcode = '42501';
  end if;
  select p.*, rz.nombre as raza_nombre, ps.peso_kg into v_perro
    from public.perros p
    left join public.razas rz on rz.id = p.raza_id
    left join lateral (select x.peso_kg from public.pesos_registrados x where x.perro_id = p.id and x.deleted_at is null order by x.fecha desc, x.created_at desc limit 1) ps on true
   where p.id = p_perro and p.negocio_id = public.negocio_actual() and p.deleted_at is null;
  if v_perro.id is null then
    raise exception 'Esa mascota no existe.';
  end if;
  if v_perro.fallecido then
    raise exception 'Esa mascota está marcada como fallecida.';
  end if;
  if p_consulta is not null then
    select c.id, c.estado, c.perro_id into v_cons from public.vet_consultas c
     where c.id = p_consulta and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
    if v_cons.id is null or v_cons.perro_id <> p_perro then
      raise exception 'Esa consulta no es de esta mascota.';
    end if;
    if v_cons.estado <> 'firmada' then
      raise exception 'La receta se emite desde una consulta firmada. Firma primero la consulta.';
    end if;
  end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) not between 1 and 20 then
    raise exception 'Agrega al menos un medicamento (hasta 20).';
  end if;
  select c.id, c.nombre, c.telefono, c.direccion into v_cliente from public.clientes c where c.id = v_perro.cliente_id;
  select n.nombre, n.ciudad into v_negocio from public.negocios n where n.id = public.negocio_actual();
  select e.aviso_funcionamiento_senasica, e.mvra_nombre, e.mvra_cedula into v_est
    from public.negocio_establecimiento e where e.negocio_id = public.negocio_actual() and e.deleted_at is null;

  perform pg_advisory_xact_lock(hashtextextended('receta:' || public.negocio_actual()::text, 0));
  select coalesce(max(numero), 0) + 1 into v_num from public.vet_recetas where negocio_id = public.negocio_actual();
  v_retencion := v_meses;

  v_snapshot := jsonb_build_object(
    'establecimiento', jsonb_build_object('nombre', v_negocio.nombre, 'ciudad', v_negocio.ciudad,
                         'aviso_funcionamiento', v_est.aviso_funcionamiento_senasica, 'mvra', v_est.mvra_nombre, 'mvra_cedula', v_est.mvra_cedula),
    'medico', jsonb_build_object('nombre', v_medico.nombre, 'cedula', v_medico.cedula_profesional, 'cpa', v_medico.cpa_sitpv),
    'mascota', jsonb_build_object('nombre', v_perro.nombre, 'especie', v_perro.especie, 'raza', coalesce(v_perro.raza_nombre, v_perro.raza),
                         'sexo', v_perro.sexo, 'esterilizado', v_perro.esterilizado, 'fecha_nacimiento', v_perro.fecha_nacimiento,
                         'microchip', v_perro.microchip, 'peso_kg', v_perro.peso_kg),
    'propietario', jsonb_build_object('nombre', v_cliente.nombre, 'telefono', v_cliente.telefono, 'domicilio', v_cliente.direccion),
    'leyenda', public.vet_regla_texto('leyenda_uso_veterinario', 'Uso exclusivo en veterinaria.'));

  insert into public.vet_recetas (id, perro_id, cliente_id, consulta_id, medico_id, numero, fecha_emision, diagnostico, observaciones,
                                  snapshot, copias, conservar_hasta)
  values (v_id, p_perro, v_cliente.id, p_consulta, v_medico.id, v_num, v_hoy, nullif(btrim(coalesce(p_diagnostico, '')), ''),
          nullif(btrim(coalesce(p_observaciones, '')), ''), v_snapshot, v_copias, v_hoy);

  for v_l in select * from jsonb_array_elements(p_lineas) loop
    v_i := v_i + 1;
    v_insumo := nullif(v_l ->> 'insumo_id', '')::uuid;
    v_producto := nullif(btrim(coalesce(v_l ->> 'producto', '')), '');
    v_pa := nullif(btrim(coalesce(v_l ->> 'principio_activo', '')), '');
    v_pres := nullif(btrim(coalesce(v_l ->> 'presentacion', '')), '');
    v_unidad := nullif(btrim(coalesce(v_l ->> 'cantidad_unidad', '')), '');
    v_doc := 'receta_simple';
    v_req := null;
    if v_insumo is not null then
      select i.id, i.nombre, i.presentacion, pa.nombre as principio into v_ins
        from public.insumos i left join public.principios_activos pa on pa.id = i.principio_activo_id
       where i.id = v_insumo and i.negocio_id = public.negocio_actual() and i.deleted_at is null;
      if v_ins.id is null then
        raise exception 'El medicamento de la línea % no existe en el inventario.', v_i;
      end if;
      v_producto := coalesce(v_producto, v_ins.nombre);
      v_pa := coalesce(v_pa, v_ins.principio);
      v_pres := coalesce(v_pres, v_ins.presentacion);
      v_req := public.vet_requisito_insumo(v_insumo);
      v_doc := v_req ->> 'documento';
      if v_doc = 'espejo_sitpv' then
        raise exception '«%» es de Grupo I: su receta es cuantificada y se emite en el SITPV. Regístrala en Veterinaria → Recetas → Registro SITPV.', v_producto;
      elsif v_doc = 'receta_especial' then
        raise exception '«%» es un estupefaciente o psicotrópico de la fracción II: pide recetario especial. Regístralo en Veterinaria → Recetas → Recetario especial.', v_producto;
      end if;
      if v_doc = 'receta_cedula' then
        v_cedula := true;
        v_retencion := greatest(v_retencion, coalesce((v_req ->> 'retencion_meses')::int, v_meses));
      end if;
    end if;
    if v_producto is null then
      raise exception 'Escribe el medicamento de la línea %.', v_i;
    end if;
    v_dosis := nullif(btrim(coalesce(v_l ->> 'dosis', '')), '');
    v_via := nullif(btrim(coalesce(v_l ->> 'via', '')), '');
    v_frec := nullif(btrim(coalesce(v_l ->> 'frecuencia', '')), '');
    if v_dosis is null or v_via is null or v_frec is null then
      raise exception 'La línea % necesita dosis, vía de administración y frecuencia.', v_i;
    end if;
    v_dias := nullif(v_l ->> 'duracion_dias', '')::int;
    if v_dias is null or v_dias not between 1 and 365 then
      raise exception 'La línea % necesita la duración del tratamiento en días (1 a 365).', v_i;
    end if;
    v_dosis_n := nullif(v_l ->> 'dosis_cantidad', '')::numeric;
    v_frec_h := nullif(v_l ->> 'frecuencia_horas', '')::numeric;
    v_calc := case when v_dosis_n is not null then public.vet_receta_calcular(v_dosis_n, v_frec_h, v_dias) end;
    v_cant := coalesce(nullif(v_l ->> 'cantidad_surtir', '')::numeric, v_calc);
    if v_cant is null or v_cant <= 0 then
      raise exception 'La línea % necesita la cantidad a surtir.', v_i;
    end if;
    insert into public.vet_receta_lineas (receta_id, orden, insumo_id, producto, principio_activo, presentacion, dosis, via, frecuencia,
                                          dosis_cantidad, frecuencia_horas, duracion_dias, tiempo_retiro, cantidad_calculada, cantidad_surtir,
                                          cantidad_unidad, indicaciones, documento, clasificacion, surtidos_max, ventana_meses)
    values (v_id, v_i, v_insumo, v_producto, v_pa, v_pres, v_dosis, v_via, v_frec, v_dosis_n, v_frec_h, v_dias,
            nullif(btrim(coalesce(v_l ->> 'tiempo_retiro', '')), ''), v_calc, v_cant, v_unidad,
            nullif(btrim(coalesce(v_l ->> 'indicaciones', '')), ''), v_doc, v_req ->> 'etiqueta',
            (v_req ->> 'surtidos_max')::int, (v_req ->> 'ventana_meses')::int);
  end loop;
  -- Con alguna fracción III o IV del art. 245 la receta se conserva más y su vigencia de surtido
  -- manda sobre la general; el conservar_hasta definitivo se fija aquí (la fila es nueva).
  update public.vet_recetas
     set conservar_hasta = (v_hoy + make_interval(months => v_retencion))::date,
         snapshot = jsonb_set(snapshot, '{requiere_cedula}', to_jsonb(v_cedula)),
         hash_contenido = public.vet_receta_hash(v_id)
   where id = v_id;
  perform public.vet_registrar_lectura(p_perro, 'receta', v_id);
  return jsonb_build_object('id', v_id, 'numero', v_num);
end;
$$;

create or replace function public.vet_receta_anular(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r record;
  v_mi uuid := public.vet_mi_medico();
begin
  if not public.vet_puede('emitir_recetas') then
    raise exception 'Anular una receta es de un médico veterinario, de admin o de quien tenga «Emitir recetas».' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo de la anulación.';
  end if;
  select r.id, r.medico_id, r.estado, r.perro_id into v_r from public.vet_recetas r
   where r.id = p_id and r.negocio_id = public.negocio_actual() and r.deleted_at is null for update;
  if v_r.id is null then
    raise exception 'Esa receta no existe.';
  end if;
  if v_r.estado = 'anulada' then
    raise exception 'Esa receta ya está anulada.';
  end if;
  if v_r.medico_id is distinct from v_mi and not coalesce(public.is_admin(), false) then
    raise exception 'Una receta la anula quien la emitió o un admin.' using errcode = '42501';
  end if;
  if exists (select 1 from public.lotes_movimientos m join public.vet_receta_lineas l on l.id = m.receta_linea_id
              where l.receta_id = p_id and m.deleted_at is null) then
    raise exception 'Esa receta ya se surtió: no se puede anular.';
  end if;
  update public.vet_recetas set estado = 'anulada', anulada_at = now(), anulada_por = auth.uid(), anulada_motivo = btrim(p_motivo) where id = p_id;
  perform public.vet_registrar_lectura(v_r.perro_id, 'receta', p_id);
end;
$$;

-- La liga del dueño: solo se guarda el sha256 del token.
create or replace function public.vet_receta_enlace(p_id uuid, p_token_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vet_puede('emitir_recetas') then
    raise exception 'Mandar una receta es de un médico veterinario, de admin o de quien tenga «Emitir recetas».' using errcode = '42501';
  end if;
  if p_token_hash is null or length(p_token_hash) <> 64 then
    raise exception 'Liga inválida.';
  end if;
  update public.vet_recetas set token_hash = p_token_hash, enviada_at = now()
   where id = p_id and negocio_id = public.negocio_actual() and deleted_at is null;
  if not found then
    raise exception 'Esa receta no existe.';
  end if;
end;
$$;

-- La receta tal como la ve el dueño por su liga (solo el servidor).
create or replace function public.receta_publica(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_r record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  select r.* into v_r from public.vet_recetas r
   where r.token_hash = p_token_hash and r.negocio_id = public.negocio_actual() and r.deleted_at is null;
  if v_r.id is null or not coalesce(public.modulo_activo('veterinaria'), false) then
    return null;
  end if;
  return jsonb_build_object(
    'numero', v_r.numero, 'estado', v_r.estado, 'fecha', v_r.fecha_emision, 'snapshot', v_r.snapshot,
    'diagnostico', v_r.diagnostico, 'observaciones', v_r.observaciones, 'anulada_motivo', v_r.anulada_motivo,
    'integra', v_r.hash_contenido is not null and v_r.hash_contenido = public.vet_receta_hash(v_r.id),
    'lineas', coalesce((select jsonb_agg(jsonb_build_object(
        'producto', l.producto, 'principio_activo', l.principio_activo, 'presentacion', l.presentacion, 'dosis', l.dosis, 'via', l.via,
        'frecuencia', l.frecuencia, 'duracion_dias', l.duracion_dias, 'tiempo_retiro', l.tiempo_retiro,
        'cantidad_surtir', l.cantidad_surtir, 'cantidad_unidad', l.cantidad_unidad, 'indicaciones', l.indicaciones) order by l.orden)
      from public.vet_receta_lineas l where l.receta_id = v_r.id and l.deleted_at is null), '[]'::jsonb));
end;
$$;

-- Se archiva (se esconde de la lista) solo cuando ya pasó su plazo de conservación.
create or replace function public.vet_receta_archivar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r record;
begin
  if not public.vet_puede('emitir_recetas') then
    raise exception 'Archivar una receta es de un médico veterinario, de admin o de quien tenga «Emitir recetas».' using errcode = '42501';
  end if;
  select r.id, r.conservar_hasta, r.archivada_at into v_r from public.vet_recetas r
   where r.id = p_id and r.negocio_id = public.negocio_actual() and r.deleted_at is null for update;
  if v_r.id is null then
    raise exception 'Esa receta no existe.';
  end if;
  if v_r.archivada_at is not null then
    return;
  end if;
  if v_r.conservar_hasta > public.fecha_negocio() then
    raise exception 'Esa receta debe conservarse hasta el %. Hasta entonces no se puede archivar.', to_char(v_r.conservar_hasta, 'DD/MM/YYYY');
  end if;
  update public.vet_recetas set archivada_at = now(), archivada_por = auth.uid() where id = p_id;
end;
$$;

create or replace function public.vet_receta_detalle(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r record;
begin
  if not public.vet_recetas_puede_leer() then
    raise exception 'Ver las recetas es de un médico veterinario, de admin o de quien tenga «Emitir recetas» o acceso al expediente.' using errcode = '42501';
  end if;
  select r.* into v_r from public.vet_recetas r where r.id = p_id and r.negocio_id = public.negocio_actual() and r.deleted_at is null;
  if v_r.id is null then
    return null;
  end if;
  perform public.vet_registrar_lectura(v_r.perro_id, 'receta', p_id);
  return jsonb_build_object(
    'id', v_r.id, 'numero', v_r.numero, 'estado', v_r.estado, 'fecha', v_r.fecha_emision, 'perro_id', v_r.perro_id, 'consulta_id', v_r.consulta_id,
    'medico_id', v_r.medico_id, 'snapshot', v_r.snapshot, 'copias', v_r.copias, 'diagnostico', v_r.diagnostico, 'observaciones', v_r.observaciones,
    'conservar_hasta', v_r.conservar_hasta, 'archivada_at', v_r.archivada_at, 'enviada_at', v_r.enviada_at,
    'anulada_at', v_r.anulada_at, 'anulada_motivo', v_r.anulada_motivo,
    'integra', v_r.hash_contenido is not null and v_r.hash_contenido = public.vet_receta_hash(v_r.id),
    'lineas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'insumo_id', l.insumo_id, 'producto', l.producto, 'principio_activo', l.principio_activo, 'presentacion', l.presentacion,
        'dosis', l.dosis, 'via', l.via, 'frecuencia', l.frecuencia, 'duracion_dias', l.duracion_dias, 'tiempo_retiro', l.tiempo_retiro,
        'cantidad_calculada', l.cantidad_calculada, 'cantidad_surtir', l.cantidad_surtir, 'cantidad_unidad', l.cantidad_unidad,
        'indicaciones', l.indicaciones, 'documento', l.documento, 'clasificacion', l.clasificacion,
        'surtidos_max', l.surtidos_max, 'ventana_meses', l.ventana_meses,
        'surtidos', (select count(distinct m.evento_surtido) from public.lotes_movimientos m where m.receta_linea_id = l.id and m.tipo = 'salida_surtido' and m.deleted_at is null),
        'surtido_cantidad', (select coalesce(sum(m.cantidad_base), 0) / public.vet_equiv_consumo(l.insumo_id) from public.lotes_movimientos m where m.receta_linea_id = l.id and m.tipo = 'salida_surtido' and m.deleted_at is null)
      ) order by l.orden) from public.vet_receta_lineas l where l.receta_id = v_r.id and l.deleted_at is null), '[]'::jsonb));
end;
$$;

create or replace function public.vet_recetas_lista(p_perro uuid default null, p_estado text default null, p_archivadas boolean default false, p_limite int default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.vet_recetas_puede_leer() then
    raise exception 'Ver las recetas es de un médico veterinario, de admin o de quien tenga «Emitir recetas» o acceso al expediente.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'numero', r.numero, 'estado', r.estado, 'fecha', r.fecha_emision, 'perro_id', r.perro_id, 'mascota', p.nombre,
      'dueno', c.nombre, 'medico', r.snapshot #>> '{medico,nombre}', 'conservar_hasta', r.conservar_hasta, 'archivada_at', r.archivada_at,
      'productos', (select string_agg(l.producto, ', ' order by l.orden) from public.vet_receta_lineas l where l.receta_id = r.id),
      'requiere_cedula', coalesce((r.snapshot ->> 'requiere_cedula')::boolean, false)) order by r.fecha_emision desc, r.numero desc)
    from (select * from public.vet_recetas x
           where x.negocio_id = public.negocio_actual() and x.deleted_at is null
             and (p_perro is null or x.perro_id = p_perro) and (p_estado is null or x.estado = p_estado)
             and (p_archivadas or x.archivada_at is null)
           order by x.fecha_emision desc, x.numero desc limit least(greatest(coalesce(p_limite, 100), 1), 500)) r
    join public.perros p on p.id = r.perro_id join public.clientes c on c.id = r.cliente_id
  ), '[]'::jsonb);
end;
$$;

-- Lo que el dueño ve de las recetas de su mascota en el portal.
create or replace function public.mis_recetas(p_perro uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.mi_cliente_id();
begin
  if v_cliente is null or not coalesce(public.modulo_activo('veterinaria'), false) then
    return '[]'::jsonb;
  end if;
  if not exists (
    select 1 from public.perros p
    where p.id = p_perro and p.negocio_id = public.negocio_actual() and p.deleted_at is null
      and (p.cliente_id = v_cliente or exists (
        select 1 from public.perro_accesos_compartidos pac where pac.perro_id = p.id and pac.cliente_id = v_cliente and pac.deleted_at is null))
  ) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'numero', r.numero, 'fecha', r.fecha_emision, 'estado', r.estado, 'medico', r.snapshot #>> '{medico,nombre}',
      'lineas', (select jsonb_agg(jsonb_build_object('producto', l.producto, 'dosis', l.dosis, 'via', l.via, 'frecuencia', l.frecuencia,
                                                      'duracion_dias', l.duracion_dias, 'tiempo_retiro', l.tiempo_retiro, 'indicaciones', l.indicaciones) order by l.orden)
                 from public.vet_receta_lineas l where l.receta_id = r.id)) order by r.fecha_emision desc, r.numero desc)
    from public.vet_recetas r
    where r.perro_id = p_perro and r.negocio_id = public.negocio_actual() and r.deleted_at is null and r.archivada_at is null
  ), '[]'::jsonb);
end;
$$;
