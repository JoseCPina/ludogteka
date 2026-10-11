-- Veterinaria, Fase 4 · parte 3: espejo del SITPV (Grupo I), recetario especial, libro de control,
-- reporte mensual, avisos, hospitalización con folio y permisos de ejecución (carril A).
--
-- PeluDesk NO emite la receta cuantificada: esa se emite en el SITPV de SENASICA. Aquí se guarda el
-- REGISTRO ESPEJO (folio del bloque del médico, su CPA, el producto con su registro SENASICA, lote,
-- dosis, cantidad, parcialidades, comprobante de compra) y un PDF de referencia que dice «no válida
-- para surtir». Cada salida de lote que ampara se enlaza al folio como parcialidad con paciente y
-- fecha. El libro de control es DERIVADO de los movimientos de lote (no hay tabla que editar).

-- ── 1. Espejo del SITPV ──────────────────────────────────────────────
create or replace function public.vet_exigir_medico_propio()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := public.vet_mi_medico();
begin
  if v_id is null then
    raise exception 'Esto lo hace solo un médico veterinario designado, con su cédula. Un admin que no es médico no puede.' using errcode = '42501';
  end if;
  return v_id;
end;
$$;

create or replace function public.vet_sitpv_registrar(
  p_perro uuid, p_uso_hospitalario boolean, p_insumo uuid, p_registro_senasica text, p_lote uuid, p_presentacion text,
  p_dosis text, p_intervalo text, p_duracion text, p_cantidad_total numeric, p_parcialidades boolean,
  p_comprobante_compra text, p_observaciones text, p_fecha date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_medico record;
  v_ins record;
  v_req jsonb;
  v_lote record;
  v_id uuid := gen_random_uuid();
  v_hosp boolean := coalesce(p_uso_hospitalario, false);
  v_parc boolean;
  v_fecha date := coalesce(p_fecha, public.fecha_negocio());
  v_registro text;
  v_obs text := nullif(btrim(coalesce(p_observaciones, '')), '');
  v_negocio text;
  v_folio text;
  v_meses int;
  v_unidad text;
  v_disponibles int;
begin
  if not public.vet_puede('registrar_recetas_sitpv') then
    raise exception 'Registrar recetas del SITPV es de un médico veterinario, de admin o de quien tenga «Registrar recetas SITPV».' using errcode = '42501';
  end if;
  perform public.vet_exigir_medico_propio();
  select m.id, m.cpa_sitpv into v_medico from public.medicos_veterinarios m
   where m.profile_id = auth.uid() and m.negocio_id = public.negocio_actual() and m.deleted_at is null;
  if btrim(coalesce(v_medico.cpa_sitpv, '')) = '' then
    raise exception 'Tu registro de médico no tiene el CPA del SITPV. Pídele a un admin que lo capture en Veterinaria → Médicos.';
  end if;
  if v_fecha > public.fecha_negocio() then
    raise exception 'La fecha no puede ser futura.';
  end if;
  if p_cantidad_total is null or p_cantidad_total <= 0 then
    raise exception 'La cantidad total debe ser mayor a cero.';
  end if;
  if v_hosp then
    if p_perro is not null and not exists (select 1 from public.perros p where p.id = p_perro and p.negocio_id = public.negocio_actual() and p.deleted_at is null) then
      raise exception 'Esa mascota no existe.';
    end if;
  else
    if p_perro is null or not exists (select 1 from public.perros p where p.id = p_perro and p.negocio_id = public.negocio_actual() and p.deleted_at is null and not p.fallecido) then
      raise exception 'Elige a la mascota de la receta (o márcala como uso hospitalario).';
    end if;
  end if;
  select i.id, i.nombre, i.registro_senasica, i.laboratorio, i.presentacion, i.es_antimicrobiano, um.etiqueta as unidad, pa.nombre as principio
    into v_ins
    from public.insumos i left join public.unidades_medida um on um.id = i.unidad_consumo_id left join public.principios_activos pa on pa.id = i.principio_activo_id
   where i.id = p_insumo and i.negocio_id = public.negocio_actual() and i.deleted_at is null and i.controla_lotes;
  if v_ins.id is null then
    raise exception 'Ese producto clínico no existe.';
  end if;
  v_req := public.vet_requisito_insumo(p_insumo);
  if v_req ->> 'documento' <> 'espejo_sitpv' then
    raise exception '«%» no pide receta cuantificada del SITPV (es %). Solo el Grupo I, o los antimicrobianos si el negocio activó el espejo cuantificado.', v_ins.nombre,
      coalesce(v_req ->> 'etiqueta', 'de venta libre');
  end if;
  v_registro := coalesce(nullif(btrim(coalesce(p_registro_senasica, '')), ''), v_ins.registro_senasica);
  if v_registro is null then
    raise exception 'Escribe el número de registro SENASICA del producto.';
  end if;
  if p_lote is not null then
    select l.id, l.codigo into v_lote from public.insumo_lotes l
     where l.id = p_lote and l.insumo_id = p_insumo and l.negocio_id = public.negocio_actual() and l.deleted_at is null;
    if v_lote.id is null then
      raise exception 'Ese lote no es de ese producto.';
    end if;
  end if;
  v_parc := coalesce(p_parcialidades, v_hosp);
  select n.nombre into v_negocio from public.negocios n where n.id = public.negocio_actual();
  if v_hosp then
    v_obs := concat_ws(E'\n', public.vet_regla_texto('leyenda_uso_hospitalario', 'USO HOSPITALARIO') || ' – ' || v_negocio, v_obs);
  end if;
  if v_parc then
    v_obs := concat_ws(E'\n', v_obs, public.vet_regla_texto('leyenda_parcialidades', 'Se ocupará en parcialidades'));
  end if;
  v_meses := coalesce((v_req ->> 'retencion_meses')::int, public.vet_regla_num('receta_conservacion_grupo_i_meses', 12)::int);
  v_folio := public.usar_folio_medico('sitpv_espejo', v_id);
  insert into public.vet_sitpv_recetas (id, medico_id, folio_texto, cpa, fecha, perro_id, uso_hospitalario, insumo_id, producto, registro_senasica,
                                        principio_activo, laboratorio, lote_id, lote_texto, presentacion, dosis, intervalo, duracion,
                                        cantidad_total, cantidad_unidad, parcialidades, comprobante_compra, observaciones, es_antimicrobiano, conservar_hasta)
  values (v_id, v_medico.id, v_folio, btrim(v_medico.cpa_sitpv), v_fecha, case when v_hosp then p_perro else p_perro end, v_hosp, p_insumo, v_ins.nombre,
          btrim(v_registro), v_ins.principio, v_ins.laboratorio, v_lote.id, v_lote.codigo,
          coalesce(nullif(btrim(coalesce(p_presentacion, '')), ''), v_ins.presentacion), nullif(btrim(coalesce(p_dosis, '')), ''),
          nullif(btrim(coalesce(p_intervalo, '')), ''), nullif(btrim(coalesce(p_duracion, '')), ''), p_cantidad_total, v_ins.unidad, v_parc,
          nullif(btrim(coalesce(p_comprobante_compra, '')), ''), v_obs, coalesce(v_ins.es_antimicrobiano, false), (v_fecha + make_interval(months => v_meses))::date);
  select coalesce(sum(r.disponibles), 0)::int into v_disponibles from public.medico_folios_resumen r where r.medico_id = v_medico.id;
  perform public.vet_registrar_lectura(p_perro, 'sitpv', v_id);
  return jsonb_build_object('id', v_id, 'folio', v_folio, 'folios_disponibles', v_disponibles);
end;
$$;

create or replace function public.vet_sitpv_cancelar(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r record;
begin
  if not public.vet_puede('registrar_recetas_sitpv') then
    raise exception 'Cancelar un folio es de un médico veterinario, de admin o de quien tenga «Registrar recetas SITPV».' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo de la cancelación (va como observación del folio en ceros).';
  end if;
  select e.id, e.medico_id, e.estado, e.perro_id into v_r from public.vet_sitpv_recetas e
   where e.id = p_id and e.negocio_id = public.negocio_actual() and e.deleted_at is null for update;
  if v_r.id is null then
    raise exception 'Ese registro no existe.';
  end if;
  if v_r.estado = 'cancelada' then
    raise exception 'Ese folio ya está cancelado.';
  end if;
  if v_r.medico_id is distinct from public.vet_mi_medico() and not coalesce(public.is_admin(), false) then
    raise exception 'Un folio lo cancela el médico que lo usó o un admin.' using errcode = '42501';
  end if;
  if exists (select 1 from public.lotes_movimientos m where m.espejo_id = p_id and m.deleted_at is null) then
    raise exception 'Ese folio ya se surtió (tiene parcialidades): no se puede cancelar.';
  end if;
  update public.vet_sitpv_recetas set estado = 'cancelada', cancelada_at = now(), cancelada_por = auth.uid(), cancelada_motivo = btrim(p_motivo) where id = p_id;
  perform public.vet_registrar_lectura(v_r.perro_id, 'sitpv', p_id);
end;
$$;

create or replace function public.vet_sitpv_archivar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r record;
begin
  if not public.vet_puede('registrar_recetas_sitpv') then
    raise exception 'Archivar es de un médico veterinario, de admin o de quien tenga «Registrar recetas SITPV».' using errcode = '42501';
  end if;
  select e.id, e.conservar_hasta, e.archivada_at into v_r from public.vet_sitpv_recetas e
   where e.id = p_id and e.negocio_id = public.negocio_actual() and e.deleted_at is null for update;
  if v_r.id is null then
    raise exception 'Ese registro no existe.';
  end if;
  if v_r.archivada_at is not null then
    return;
  end if;
  if v_r.conservar_hasta > public.fecha_negocio() then
    raise exception 'Ese registro debe conservarse hasta el %. Hasta entonces no se puede archivar.', to_char(v_r.conservar_hasta, 'DD/MM/YYYY');
  end if;
  update public.vet_sitpv_recetas set archivada_at = now(), archivada_por = auth.uid() where id = p_id;
end;
$$;

create or replace function public.vet_sitpv_puede_leer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.vet_puede('registrar_recetas_sitpv'), false) or coalesce(public.vet_puede('ver_libro_control'), false);
$$;

create or replace function public.vet_sitpv_detalle(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e record;
  v_eq numeric;
begin
  if not public.vet_sitpv_puede_leer() then
    raise exception 'Ver los registros del SITPV es de un médico veterinario, de admin o de quien tenga «Registrar recetas SITPV» o «Ver libro de control».' using errcode = '42501';
  end if;
  select e.* into v_e from public.vet_sitpv_recetas e where e.id = p_id and e.negocio_id = public.negocio_actual() and e.deleted_at is null;
  if v_e.id is null then
    return null;
  end if;
  v_eq := public.vet_equiv_consumo(v_e.insumo_id);
  perform public.vet_registrar_lectura(v_e.perro_id, 'sitpv', p_id);
  return jsonb_build_object(
    'id', v_e.id, 'folio', v_e.folio_texto, 'cpa', v_e.cpa, 'fecha', v_e.fecha, 'estado', v_e.estado, 'uso_hospitalario', v_e.uso_hospitalario,
    'perro_id', v_e.perro_id, 'mascota', (select p.nombre from public.perros p where p.id = v_e.perro_id),
    'dueno', (select c.nombre from public.perros p join public.clientes c on c.id = p.cliente_id where p.id = v_e.perro_id),
    'medico', (select pr.nombre_completo from public.medicos_veterinarios m join public.profiles pr on pr.id = m.profile_id where m.id = v_e.medico_id),
    'medico_id', v_e.medico_id, 'cedula', (select m.cedula_profesional from public.medicos_veterinarios m where m.id = v_e.medico_id),
    'producto', v_e.producto, 'insumo_id', v_e.insumo_id, 'registro_senasica', v_e.registro_senasica, 'principio_activo', v_e.principio_activo,
    'laboratorio', v_e.laboratorio, 'lote_id', v_e.lote_id, 'lote', v_e.lote_texto, 'presentacion', v_e.presentacion, 'dosis', v_e.dosis,
    'intervalo', v_e.intervalo, 'duracion', v_e.duracion, 'cantidad_total', v_e.cantidad_total, 'unidad', v_e.cantidad_unidad,
    'parcialidades', v_e.parcialidades, 'comprobante_compra', v_e.comprobante_compra, 'observaciones', v_e.observaciones,
    'es_antimicrobiano', v_e.es_antimicrobiano, 'cancelada_at', v_e.cancelada_at, 'cancelada_motivo', v_e.cancelada_motivo,
    'conservar_hasta', v_e.conservar_hasta, 'archivada_at', v_e.archivada_at,
    'establecimiento', (select n.nombre from public.negocios n where n.id = v_e.negocio_id),
    'leyenda', public.vet_regla_texto('leyenda_espejo', 'Espejo de receta SITPV – no válida para surtir'),
    'surtido', coalesce((select sum(m.cantidad_base) from public.lotes_movimientos m where m.espejo_id = v_e.id and m.tipo = 'salida_surtido' and m.deleted_at is null), 0) / v_eq,
    'aplicaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fecha', (m.created_at at time zone public.zona_negocio())::date, 'cantidad', m.cantidad_base / v_eq,
        'paciente', (select p.nombre from public.perros p where p.id = m.perro_id), 'lote', (select l.codigo from public.insumo_lotes l where l.id = m.lote_id),
        'hospitalario', m.uso_hospitalario) order by m.created_at)
      from public.lotes_movimientos m where m.espejo_id = v_e.id and m.tipo = 'salida_surtido' and m.deleted_at is null), '[]'::jsonb));
end;
$$;

create or replace function public.vet_sitpv_lista(p_estado text default null, p_archivadas boolean default false, p_limite int default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.vet_sitpv_puede_leer() then
    raise exception 'Ver los registros del SITPV es de un médico veterinario, de admin o de quien tenga «Registrar recetas SITPV» o «Ver libro de control».' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'folio', e.folio_texto, 'fecha', e.fecha, 'estado', e.estado, 'producto', e.producto, 'cantidad_total', e.cantidad_total,
      'unidad', e.cantidad_unidad, 'uso_hospitalario', e.uso_hospitalario, 'parcialidades', e.parcialidades,
      'mascota', (select p.nombre from public.perros p where p.id = e.perro_id),
      'medico', (select pr.nombre_completo from public.medicos_veterinarios m join public.profiles pr on pr.id = m.profile_id where m.id = e.medico_id),
      'surtido', coalesce((select sum(m.cantidad_base) from public.lotes_movimientos m where m.espejo_id = e.id and m.tipo = 'salida_surtido' and m.deleted_at is null), 0) / public.vet_equiv_consumo(e.insumo_id),
      'conservar_hasta', e.conservar_hasta, 'archivada_at', e.archivada_at) order by e.fecha desc, e.created_at desc)
    from (select * from public.vet_sitpv_recetas x
           where x.negocio_id = public.negocio_actual() and x.deleted_at is null and (p_estado is null or x.estado = p_estado) and (p_archivadas or x.archivada_at is null)
           order by x.fecha desc, x.created_at desc limit least(greatest(coalesce(p_limite, 200), 1), 1000)) e
  ), '[]'::jsonb);
end;
$$;

-- ── 2. Recetario especial ────────────────────────────────────────────
create or replace function public.vet_recetario_registrar(
  p_perro uuid, p_insumo uuid, p_folio text, p_codigo_barras text, p_fecha date, p_dias int, p_cantidad_diaria numeric, p_indicaciones text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_medico uuid;
  v_ins record;
  v_req jsonb;
  v_id uuid := gen_random_uuid();
  v_max int := public.vet_regla_num('lgs_tratamiento_max_dias', 30)::int;
  v_fecha date := coalesce(p_fecha, public.fecha_negocio());
  v_meses int;
begin
  if not public.vet_puede('registrar_recetas_sitpv') then
    raise exception 'Registrar un recetario especial es de un médico veterinario, de admin o de quien tenga «Registrar recetas SITPV».' using errcode = '42501';
  end if;
  v_medico := public.vet_exigir_medico_propio();
  if btrim(coalesce(p_folio, '')) = '' or btrim(coalesce(p_codigo_barras, '')) = '' then
    raise exception 'Captura el folio del recetario y su código de barras.';
  end if;
  if v_fecha > public.fecha_negocio() then
    raise exception 'La fecha no puede ser futura.';
  end if;
  if p_dias is null or p_dias < 1 then
    raise exception 'Escribe los días de tratamiento.';
  end if;
  if p_dias > v_max then
    raise exception 'El tratamiento con este tipo de producto no puede pasar de % días (Ley General de Salud, arts. 240 y 241).', v_max;
  end if;
  if p_cantidad_diaria is null or p_cantidad_diaria <= 0 then
    raise exception 'Escribe la cantidad diaria.';
  end if;
  if not exists (select 1 from public.perros p where p.id = p_perro and p.negocio_id = public.negocio_actual() and p.deleted_at is null and not p.fallecido) then
    raise exception 'Esa mascota no existe.';
  end if;
  select i.id, i.nombre, um.etiqueta as unidad into v_ins
    from public.insumos i left join public.unidades_medida um on um.id = i.unidad_consumo_id
   where i.id = p_insumo and i.negocio_id = public.negocio_actual() and i.deleted_at is null and i.controla_lotes;
  if v_ins.id is null then
    raise exception 'Ese producto clínico no existe.';
  end if;
  v_req := public.vet_requisito_insumo(p_insumo);
  if v_req ->> 'documento' <> 'receta_especial' then
    raise exception '«%» no pide recetario especial.', v_ins.nombre;
  end if;
  v_meses := coalesce((v_req ->> 'retencion_meses')::int, 12);
  insert into public.vet_recetario_especial (id, medico_id, perro_id, insumo_id, producto, folio_recetario, codigo_barras, fecha, dias_tratamiento,
                                             cantidad_diaria, cantidad_total, cantidad_unidad, indicaciones, conservar_hasta)
  values (v_id, v_medico, p_perro, p_insumo, v_ins.nombre, btrim(p_folio), btrim(p_codigo_barras), v_fecha, p_dias, p_cantidad_diaria,
          p_dias * p_cantidad_diaria, v_ins.unidad, nullif(btrim(coalesce(p_indicaciones, '')), ''), (v_fecha + make_interval(months => v_meses))::date);
  perform public.vet_registrar_lectura(p_perro, 'recetario', v_id);
  return jsonb_build_object('id', v_id, 'cantidad_total', p_dias * p_cantidad_diaria);
exception when unique_violation then
  raise exception 'Ese folio de recetario ya está registrado.';
end;
$$;

create or replace function public.vet_recetario_cancelar(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r record;
begin
  if not public.vet_puede('registrar_recetas_sitpv') then
    raise exception 'Cancelar un recetario es de un médico veterinario, de admin o de quien tenga «Registrar recetas SITPV».' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo de la cancelación.';
  end if;
  select r.id, r.medico_id, r.estado, r.perro_id into v_r from public.vet_recetario_especial r
   where r.id = p_id and r.negocio_id = public.negocio_actual() and r.deleted_at is null for update;
  if v_r.id is null then
    raise exception 'Ese recetario no existe.';
  end if;
  if v_r.estado = 'cancelada' then
    raise exception 'Ese recetario ya está cancelado.';
  end if;
  if v_r.medico_id is distinct from public.vet_mi_medico() and not coalesce(public.is_admin(), false) then
    raise exception 'Un recetario lo cancela quien lo registró o un admin.' using errcode = '42501';
  end if;
  if exists (select 1 from public.lotes_movimientos m where m.recetario_id = p_id and m.deleted_at is null) then
    raise exception 'Ese recetario ya se surtió: no se puede cancelar.';
  end if;
  update public.vet_recetario_especial set estado = 'cancelada', cancelada_at = now(), cancelada_por = auth.uid(), cancelada_motivo = btrim(p_motivo) where id = p_id;
  perform public.vet_registrar_lectura(v_r.perro_id, 'recetario', p_id);
end;
$$;

create or replace function public.vet_recetario_archivar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r record;
begin
  if not public.vet_puede('registrar_recetas_sitpv') then
    raise exception 'Archivar es de un médico veterinario, de admin o de quien tenga «Registrar recetas SITPV».' using errcode = '42501';
  end if;
  select r.id, r.conservar_hasta, r.archivada_at into v_r from public.vet_recetario_especial r
   where r.id = p_id and r.negocio_id = public.negocio_actual() and r.deleted_at is null for update;
  if v_r.id is null then
    raise exception 'Ese recetario no existe.';
  end if;
  if v_r.archivada_at is not null then
    return;
  end if;
  if v_r.conservar_hasta > public.fecha_negocio() then
    raise exception 'Ese recetario debe conservarse hasta el %. Hasta entonces no se puede archivar.', to_char(v_r.conservar_hasta, 'DD/MM/YYYY');
  end if;
  update public.vet_recetario_especial set archivada_at = now(), archivada_por = auth.uid() where id = p_id;
end;
$$;

create or replace function public.vet_recetario_lista(p_archivadas boolean default false, p_limite int default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.vet_sitpv_puede_leer() then
    raise exception 'Ver los recetarios es de un médico veterinario, de admin o de quien tenga «Registrar recetas SITPV» o «Ver libro de control».' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'folio', r.folio_recetario, 'codigo_barras', r.codigo_barras, 'fecha', r.fecha, 'estado', r.estado, 'producto', r.producto,
      'dias', r.dias_tratamiento, 'cantidad_diaria', r.cantidad_diaria, 'cantidad_total', r.cantidad_total, 'unidad', r.cantidad_unidad,
      'perro_id', r.perro_id, 'mascota', (select p.nombre from public.perros p where p.id = r.perro_id), 'insumo_id', r.insumo_id,
      'medico', (select pr.nombre_completo from public.medicos_veterinarios m join public.profiles pr on pr.id = m.profile_id where m.id = r.medico_id),
      'surtido', coalesce((select sum(m.cantidad_base) from public.lotes_movimientos m where m.recetario_id = r.id and m.tipo = 'salida_surtido' and m.deleted_at is null), 0) / public.vet_equiv_consumo(r.insumo_id),
      'indicaciones', r.indicaciones, 'cancelada_motivo', r.cancelada_motivo, 'conservar_hasta', r.conservar_hasta, 'archivada_at', r.archivada_at)
      order by r.fecha desc, r.created_at desc)
    from (select * from public.vet_recetario_especial x
           where x.negocio_id = public.negocio_actual() and x.deleted_at is null and (p_archivadas or x.archivada_at is null)
           order by x.fecha desc, x.created_at desc limit least(greatest(coalesce(p_limite, 200), 1), 1000)) r
  ), '[]'::jsonb);
end;
$$;

-- ── 3. Libro de control (derivado) ───────────────────────────────────
create or replace function public.vet_libro_control(p_desde date, p_hasta date, p_insumo uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zona text := public.zona_negocio();
  v_movs jsonb;
  v_iniciales jsonb;
begin
  if not public.vet_puede('ver_libro_control') then
    raise exception 'Ver el libro de control es de un médico veterinario, de admin o de quien tenga «Ver libro de control».' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Elige el rango de fechas.';
  end if;
  perform public.vet_registrar_lectura(null, 'libro', p_insumo);
  with ins as (
    select i.id, i.nombre, i.laboratorio, public.vet_equiv_consumo(i.id) as eq, (select um.etiqueta from public.unidades_medida um where um.id = i.unidad_consumo_id) as unidad
    from public.insumos i
    where i.negocio_id = public.negocio_actual() and i.deleted_at is null and i.controla_lotes
      and (p_insumo is null or i.id = p_insumo)
      and coalesce((public.vet_requisito_insumo(i.id) ->> 'libro_control')::boolean, false)
  ),
  mv as (
    select m.id, m.created_at, m.insumo_id, m.lote_id, m.tipo, m.cantidad_base, m.motivo, m.folio_receta, m.perro_id, m.uso_hospitalario, m.medico_id,
           m.espejo_id, m.recetario_id, m.receta_linea_id, i.nombre, i.laboratorio, i.eq, i.unidad,
           sum(case when m.tipo in ('entrada_compra', 'entrada_inicial', 'ajuste_positivo') then m.cantidad_base else -m.cantidad_base end)
             over (partition by m.insumo_id order by m.created_at, m.id) as acumulado
    from public.lotes_movimientos m join ins i on i.id = m.insumo_id
    where m.negocio_id = public.negocio_actual() and m.deleted_at is null
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', x.id, 'fecha', (x.created_at at time zone v_zona)::date, 'hora', to_char(x.created_at at time zone v_zona, 'HH24:MI'),
      'insumo_id', x.insumo_id, 'producto', x.nombre, 'laboratorio', x.laboratorio, 'unidad', x.unidad,
      'lote', l.codigo, 'caducidad', l.fecha_caducidad, 'tipo', x.tipo,
      'entrada', case when x.tipo in ('entrada_compra', 'entrada_inicial', 'ajuste_positivo') then round(x.cantidad_base / x.eq, 3) end,
      'salida', case when x.tipo not in ('entrada_compra', 'entrada_inicial', 'ajuste_positivo') then round(x.cantidad_base / x.eq, 3) end,
      'saldo', round(x.acumulado / x.eq, 3),
      'folio', x.folio_receta,
      'paciente', case when x.uso_hospitalario and x.perro_id is null then public.vet_regla_texto('leyenda_uso_hospitalario', 'USO HOSPITALARIO')
                       when x.uso_hospitalario then public.vet_regla_texto('leyenda_uso_hospitalario', 'USO HOSPITALARIO') || ' – ' || p.nombre
                       else p.nombre end,
      'medico', (select pr.nombre_completo from public.medicos_veterinarios mv2 join public.profiles pr on pr.id = mv2.profile_id where mv2.id = x.medico_id),
      'motivo', x.motivo) order by x.nombre, x.created_at, x.id)
      from mv x join public.insumo_lotes l on l.id = x.lote_id left join public.perros p on p.id = x.perro_id
      where (x.created_at at time zone v_zona)::date between p_desde and p_hasta), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('insumo_id', s.id, 'producto', s.nombre, 'unidad', s.unidad, 'saldo_inicial', s.saldo) order by s.nombre)
      from (select i.id, i.nombre, i.unidad,
                   round(coalesce((select sum(case when m.tipo in ('entrada_compra', 'entrada_inicial', 'ajuste_positivo') then m.cantidad_base else -m.cantidad_base end)
                                   from mv m where m.insumo_id = i.id and (m.created_at at time zone v_zona)::date < p_desde), 0) / i.eq, 3) as saldo
            from ins i) s(id, nombre, unidad, saldo)), '[]'::jsonb)
  into v_movs, v_iniciales;
  return jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'movimientos', v_movs, 'saldos_iniciales', v_iniciales);
end;
$$;

-- ── 4. Reporte mensual del SITPV ─────────────────────────────────────
create or replace function public.vet_sitpv_reporte(p_medico uuid, p_periodo date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_desde date := date_trunc('month', p_periodo)::date;
  v_hasta date := (date_trunc('month', p_periodo) + interval '1 month - 1 day')::date;
  v_zona text := public.zona_negocio();
  v_m record;
begin
  if not public.vet_puede('registrar_recetas_sitpv') then
    raise exception 'El reporte mensual es de un médico veterinario, de admin o de quien tenga «Registrar recetas SITPV».' using errcode = '42501';
  end if;
  select m.id, m.cpa_sitpv, m.cedula_profesional, pr.nombre_completo as nombre into v_m
    from public.medicos_veterinarios m join public.profiles pr on pr.id = m.profile_id
   where m.id = p_medico and m.negocio_id = public.negocio_actual() and m.deleted_at is null;
  if v_m.id is null then
    raise exception 'Ese médico no existe.';
  end if;
  perform public.vet_registrar_lectura(null, 'sitpv', p_medico);
  return jsonb_build_object(
    'medico', v_m.nombre, 'cedula', v_m.cedula_profesional, 'cpa', v_m.cpa_sitpv, 'periodo', v_desde,
    'reportado', (select jsonb_build_object('at', r.reportado_at, 'nota', r.nota,
                    'por', (select pr.nombre_completo from public.profiles pr where pr.id = r.reportado_por))
                  from public.vet_sitpv_reportes r where r.medico_id = p_medico and r.periodo = v_desde and r.deleted_at is null),
    'usados', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'folio', e.folio_texto, 'fecha', e.fecha, 'producto', e.producto,
        'registro_senasica', e.registro_senasica, 'cantidad_total', e.cantidad_total, 'unidad', e.cantidad_unidad, 'parcialidades', e.parcialidades,
        'paciente', case when e.uso_hospitalario then public.vet_regla_texto('leyenda_uso_hospitalario', 'USO HOSPITALARIO')
                         else (select p.nombre from public.perros p where p.id = e.perro_id) end) order by e.fecha, e.folio_texto)
      from public.vet_sitpv_recetas e
      where e.medico_id = p_medico and e.deleted_at is null and e.estado = 'registrada' and e.fecha between v_desde and v_hasta), '[]'::jsonb),
    'cancelados', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'folio', e.folio_texto, 'fecha', e.fecha, 'cantidad', 0, 'observacion', e.cancelada_motivo) order by e.fecha, e.folio_texto)
      from public.vet_sitpv_recetas e
      where e.medico_id = p_medico and e.deleted_at is null and e.estado = 'cancelada' and e.fecha between v_desde and v_hasta), '[]'::jsonb),
    'parcialidades', coalesce((
      select jsonb_agg(jsonb_build_object('folio', m.folio_receta, 'fecha', (m.created_at at time zone v_zona)::date, 'producto', i.nombre,
        'cantidad', round(m.cantidad_base / public.vet_equiv_consumo(m.insumo_id), 3),
        'paciente', coalesce((select p.nombre from public.perros p where p.id = m.perro_id), public.vet_regla_texto('leyenda_uso_hospitalario', 'USO HOSPITALARIO')))
        order by m.created_at)
      from public.lotes_movimientos m join public.insumos i on i.id = m.insumo_id
      where m.medico_id = p_medico and m.espejo_id is not null and m.tipo = 'salida_surtido' and m.deleted_at is null
        and (m.created_at at time zone v_zona)::date between v_desde and v_hasta), '[]'::jsonb),
    'pacientes', coalesce((
      select jsonb_agg(distinct p.nombre)
      from public.vet_sitpv_recetas e join public.perros p on p.id = e.perro_id
      where e.medico_id = p_medico and e.deleted_at is null and e.estado = 'registrada' and e.fecha between v_desde and v_hasta), '[]'::jsonb));
end;
$$;

create or replace function public.vet_sitpv_reporte_marcar(p_medico uuid, p_periodo date, p_nota text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_desde date := date_trunc('month', p_periodo)::date;
begin
  if not public.vet_puede('registrar_recetas_sitpv') then
    raise exception 'Marcar el reporte es de un médico veterinario, de admin o de quien tenga «Registrar recetas SITPV».' using errcode = '42501';
  end if;
  if not exists (select 1 from public.medicos_veterinarios m where m.id = p_medico and m.negocio_id = public.negocio_actual() and m.deleted_at is null) then
    raise exception 'Ese médico no existe.';
  end if;
  if v_desde >= date_trunc('month', public.fecha_negocio())::date then
    raise exception 'Ese mes todavía no termina: se reporta cuando acaba.';
  end if;
  if p_medico is distinct from public.vet_mi_medico() and not coalesce(public.is_admin(), false) then
    raise exception 'El reporte de un médico lo marca él mismo o un admin.' using errcode = '42501';
  end if;
  insert into public.vet_sitpv_reportes (medico_id, periodo, nota)
  values (p_medico, v_desde, nullif(btrim(coalesce(p_nota, '')), ''));
exception when unique_violation then
  raise exception 'Ese mes ya está marcado como reportado.';
end;
$$;

-- Por médico: folios que le quedan y meses por reportar. Lo usan la pantalla y el aviso.
create or replace function public.vet_sitpv_estado_medicos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := public.fecha_negocio();
  v_ultimo date := (date_trunc('month', public.fecha_negocio()) - interval '1 month')::date;
begin
  if not coalesce(public.vet_puede('registrar_recetas_sitpv'), false) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'medico_id', m.id, 'nombre', pr.nombre_completo, 'cpa', m.cpa_sitpv,
      'folios_disponibles', coalesce((select sum(r.disponibles) from public.medico_folios_resumen r where r.medico_id = m.id), 0),
      'folios_asignados', coalesce((select sum(r.asignados) from public.medico_folios_resumen r where r.medico_id = m.id), 0),
      'meses_pendientes', coalesce((
        select jsonb_agg(g.mes order by g.mes)
        from (select pri.primero from (select date_trunc('month', min(e.fecha))::date as primero from public.vet_sitpv_recetas e where e.medico_id = m.id and e.deleted_at is null) pri where pri.primero is not null) q,
             lateral generate_series(q.primero, v_ultimo, interval '1 month') as gs(mes_ts),
             lateral (select gs.mes_ts::date as mes) g
        where not exists (select 1 from public.vet_sitpv_reportes rp where rp.medico_id = m.id and rp.periodo = g.mes and rp.deleted_at is null)), '[]'::jsonb))
      order by pr.nombre_completo)
    from public.medicos_veterinarios m join public.profiles pr on pr.id = m.profile_id
    where m.negocio_id = public.negocio_actual() and m.deleted_at is null
  ), '[]'::jsonb);
end;
$$;

-- ── 5. «Necesita atención» ───────────────────────────────────────────
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.veterinaria_atencion()'::regprocedure);
  if v_def not like '%sitpv_reportes_pendientes%' then
    v_def := replace(v_def,
      E'else null end\n  );\nend;',
      E'else null end,\n    -- Reporte mensual del SITPV por marcar, folios por agotarse y bloqueo de folios nuevos.\n    ''sitpv_reportes_pendientes'', case when public.vet_puede(''registrar_recetas_sitpv'') then\n        (select coalesce(sum(jsonb_array_length(e -> ''meses_pendientes'')), 0) from jsonb_array_elements(public.vet_sitpv_estado_medicos()) e) else 0 end,\n    ''sitpv_reporte_desde'', case when public.vet_puede(''registrar_recetas_sitpv'') then\n        (select (min((e -> ''meses_pendientes'' ->> 0)::date) + interval ''1 month'')::date from jsonb_array_elements(public.vet_sitpv_estado_medicos()) e where jsonb_array_length(e -> ''meses_pendientes'') > 0) else null end,\n    ''sitpv_reporte_aviso'', case when public.vet_puede(''registrar_recetas_sitpv'') then\n        extract(day from v_hoy) >= public.vet_regla_num(''sitpv_reporte_dia_aviso'', 3) else false end,\n    ''sitpv_reporte_bloqueo'', case when public.vet_puede(''registrar_recetas_sitpv'') then\n        (select count(*) from jsonb_array_elements(public.vet_sitpv_estado_medicos()) e where jsonb_array_length(e -> ''meses_pendientes'') >= public.vet_regla_num(''sitpv_meses_sin_reporte_bloqueo'', 3)) else 0 end,\n    ''sitpv_folios_bajos'', case when public.vet_puede(''registrar_recetas_sitpv'') then\n        (select count(*) from jsonb_array_elements(public.vet_sitpv_estado_medicos()) e where (e ->> ''folios_asignados'')::int > 0 and (e ->> ''folios_disponibles'')::int < public.vet_regla_num(''sitpv_folios_alerta'', 10)) else 0 end\n  );\nend;');
    if v_def not like '%sitpv_reportes_pendientes%' then
      raise exception 'No se pudo parchar veterinaria_atencion: cambió su texto.';
    end if;
    execute v_def;
  end if;
end $$;

-- ── 6. Hospitalización: una dosis de un producto del Grupo I lleva su folio ─
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.hospitalizar_aplicar_dosis(uuid,uuid,text,numeric,text)'::regprocedure);
  v_def := replace(v_def, 'p_nota text)', 'p_nota text, p_espejo uuid DEFAULT NULL::uuid)');
  v_def := replace(v_def,
    $a$v_mov := public.vet_descontar_lote(p_lote_id, v_cant, 'Hospitalización de ' || v_nombre || ': ' || v_m.producto);$a$,
    $b$if p_espejo is not null then
      perform set_config('app.vet_doc_tipo', 'espejo', true);
      perform set_config('app.vet_doc_id', p_espejo::text, true);
      perform set_config('app.vet_perro', (select h.perro_id::text from public.hospitalizaciones h where h.id = v_d.hospitalizacion_id), true);
      perform set_config('app.vet_evento', gen_random_uuid()::text, true);
    end if;
    v_mov := public.vet_descontar_lote(p_lote_id, v_cant, 'Hospitalización de ' || v_nombre || ': ' || v_m.producto);
    if p_espejo is not null then
      perform set_config('app.vet_doc_tipo', '', true);
      perform set_config('app.vet_doc_id', '', true);
      perform set_config('app.vet_perro', '', true);
      perform set_config('app.vet_evento', '', true);
    end if;$b$);
  if v_def not like '%p_espejo uuid%' or v_def not like '%app.vet_doc_tipo%' then
    raise exception 'No se pudo parchar hospitalizar_aplicar_dosis: cambió su texto.';
  end if;
  drop function public.hospitalizar_aplicar_dosis(uuid, uuid, text, numeric, text);
  execute v_def;
end $$;

-- ── 7. Reglas y auditoría de la frontera ─────────────────────────────
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.auditoria_frontera()'::regprocedure) into v_def;
  if position('vet_reglas_clasificacion' in v_def) = 0 then
    v_def := replace(v_def, $a$compartidas(nombre) as (values $a$, $b$compartidas(nombre) as (values ('vet_reglas'), ('vet_reglas_clasificacion'), $b$);
    v_def := replace(v_def, $a$('bot_cuenta_por_telefono')$a$,
      $b$('bot_cuenta_por_telefono'), ('plataforma_vet_regla_guardar'), ('plataforma_vet_clasificacion_guardar')$b$);
    if position('vet_reglas_clasificacion' in v_def) = 0 or position('plataforma_vet_regla_guardar' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar las reglas de recetas.';
    end if;
    execute v_def;
  end if;
end $$;

-- ── 8. Dueños y grants ───────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'vet_regla(text)', 'vet_regla_num(text,numeric)', 'vet_regla_texto(text,text)', 'vet_equiv_consumo(uuid)', 'vet_requisito_insumo(uuid)',
    'guardar_veterinaria_espejo_antimicrobianos(boolean)', 'vet_producto_regulatorio_guardar(uuid,text,text,text)',
    'vet_puede_surtir()', 'vet_surtir_controlado(text,uuid,jsonb,uuid,uuid,text)',
    'vet_recetas_puede_leer()', 'vet_receta_hash(uuid)',
    'vet_receta_emitir(uuid,uuid,jsonb,text,text)', 'vet_receta_anular(uuid,text)', 'vet_receta_enlace(uuid,text)', 'receta_publica(text)',
    'vet_receta_archivar(uuid)', 'vet_receta_detalle(uuid)', 'vet_recetas_lista(uuid,text,boolean,int)', 'mis_recetas(uuid)',
    'vet_exigir_medico_propio()',
    'vet_sitpv_registrar(uuid,boolean,uuid,text,uuid,text,text,text,text,numeric,boolean,text,text,date)', 'vet_sitpv_cancelar(uuid,text)',
    'vet_sitpv_archivar(uuid)', 'vet_sitpv_puede_leer()', 'vet_sitpv_detalle(uuid)', 'vet_sitpv_lista(text,boolean,int)',
    'vet_recetario_registrar(uuid,uuid,text,text,date,int,numeric,text)', 'vet_recetario_cancelar(uuid,text)', 'vet_recetario_archivar(uuid)',
    'vet_recetario_lista(boolean,int)', 'vet_libro_control(date,date,uuid)',
    'vet_sitpv_reporte(uuid,date)', 'vet_sitpv_reporte_marcar(uuid,date,text)', 'vet_sitpv_estado_medicos()',
    'hospitalizar_aplicar_dosis(uuid,uuid,text,numeric,text,uuid)', 'veterinaria_atencion()'
  ] loop
    execute format('alter function public.%s owner to peludesk_definer', f);
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  -- Solo el servidor (la liga del dueño).
  execute 'revoke execute on function public.receta_publica(text) from authenticated';
  -- De la plataforma (postgres, en la lista blanca): el permiso lo comprueba la función.
  foreach f in array array['plataforma_vet_regla_guardar(text,jsonb)', 'plataforma_vet_clasificacion_guardar(text,text,int,int,int,boolean,text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  -- Internas: solo las llaman otras funciones, ya con sus permisos comprobados.
  foreach f in array array['vet_exigir_medico_propio()'] loop
    execute format('revoke execute on function public.%s from authenticated', f);
  end loop;
end $$;

-- El ayudante de redes ya no hace falta.
drop function public._vet_redes(text, text);
