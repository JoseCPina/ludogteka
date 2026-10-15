-- QA externa del 15 de octubre de 2026 (hallazgos B4 y B13).
--
-- B4: una consulta firmada con un cargo «Sin precio» no llegaba a Caja. Ahora:
--   · los cuatro servicios veterinarios existen en TODO negocio con Veterinaria prendida
--     (resiembra idempotente: los que ya los tenían no cambian);
--   · el precio se pide en el momento (`vet_consulta_cargo_precio`, con «Guardar como precio de
--     catálogo» solo si la persona puede editar tarifas);
--   · SIN precio no se firma, salvo que el médico marque «Sin cobro» con motivo (se reutiliza
--     `vet_consulta_cargo_quitar`, que ya exige el motivo).
-- B13: una vacuna registrada como «Otro procedimiento» no entraba al carnet. Ahora un producto
--   clasificado como vacuna (`insumos.tipo_clinico = 'vacuna'`) se registra como vacuna aplicada
--   (carnet, con lote PEPS y fecha), y un procedimiento escrito a mano cuyo nombre es el de una
--   vacuna se rechaza con la indicación de «Aplicar vacuna».

-- ── 1. Servicios veterinarios en todo negocio con Veterinaria prendida ─
select public._vet_sembrar_servicios(n.negocio_id)
  from (select distinct nm.negocio_id from public.negocio_modulos nm
         where nm.modulo = 'veterinaria' and nm.activo and nm.deleted_at is null) n;

-- ── 2. ¿El nombre de un procedimiento es el de una vacuna? ───────────
create or replace function public.vet_es_vacuna(p_nombre text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with n as (select translate(lower(coalesce(p_nombre, '')), 'áéíóúü', 'aeiouu') as t)
  select n.t ~ '(vacun|antirrab|quintuple|sextuple|octuple|polivalente|triple felina|triple viral|inmunizacion)'
         and n.t !~ '(desparasit|prueba|test|certificado|carnet|constancia)'
    from n;
$$;
revoke execute on function public.vet_es_vacuna(text) from public, anon;
grant execute on function public.vet_es_vacuna(text) to authenticated, service_role;

-- ── 3. Capturar el precio de un cargo en el momento ──────────────────
create or replace function public.vet_consulta_cargo_precio(p_id uuid, p_precio numeric, p_guardar_catalogo boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vet_consulta_cargos;
  v_serv uuid;
begin
  v := public._vet_cargo_borrador(p_id);
  if not (public.vet_puede('atender_consultas') or public.vet_puede('ajustar_cargos_consulta')) then
    raise exception 'Poner el precio de un cargo es de quien atiende consultas.' using errcode = '42501';
  end if;
  if v.estado <> 'propuesto' or v.precio_unitario is not null then
    raise exception 'Esa línea ya tiene precio o no va al cobro.';
  end if;
  if p_precio is null or p_precio < 0 then
    raise exception 'Escribe el precio (cero no: para no cobrarlo usa «Sin cobro» con su motivo).';
  end if;
  if p_precio = 0 then
    raise exception 'El precio tiene que ser mayor a cero. Para no cobrarlo usa «Sin cobro» con su motivo.';
  end if;

  if coalesce(p_guardar_catalogo, false) then
    if not (coalesce(public.is_admin(), false) or coalesce(public.tiene_permiso('tarifas'), false)) then
      raise exception 'Guardar un precio de catálogo es de admin o de quien tenga «Precios y tarifas».' using errcode = '42501';
    end if;
    if v.tipo = 'vacuna' then
      select s.id into v_serv from public.servicios s
       where s.negocio_id = public.negocio_actual() and s.clave = 'vet_aplicacion_vacuna' and s.deleted_at is null;
    elsif v.tipo in ('consulta', 'procedimiento') then
      v_serv := v.servicio_id;
    end if;
    if v_serv is null then
      raise exception 'Este cargo no tiene un precio de catálogo (un producto se cobra con el precio de venta de Inventario).';
    end if;
    if exists (select 1 from public.tarifas_vigentes t where t.servicio_id = v_serv) then
      raise exception 'Ese servicio ya tiene un precio de catálogo vigente. Cámbialo en Servicios y precios.';
    end if;
    insert into public.tarifas (servicio_id, cantidad_desde, cantidad_hasta, vigencia_desde, precio, no_aplica)
    values (v_serv, 1, null, public.fecha_negocio(), p_precio, false);
  end if;

  update public.vet_consulta_cargos
     set precio_unitario = p_precio, ajustado_por = auth.uid(), ajustado_at = now(),
         ajuste_motivo = 'Precio capturado al firmar'
   where id = p_id;
end;
$$;
alter function public.vet_consulta_cargo_precio(uuid, numeric, boolean) owner to peludesk_definer;
revoke execute on function public.vet_consulta_cargo_precio(uuid, numeric, boolean) from public, anon;
grant execute on function public.vet_consulta_cargo_precio(uuid, numeric, boolean) to authenticated;

-- ── 4. Agregar un cargo: la vacuna va al carnet, no como procedimiento ─
create or replace function public.vet_consulta_cargo_agregar(
  p_consulta uuid, p_tipo text, p_concepto text, p_cantidad numeric, p_precio numeric, p_servicio uuid default null, p_insumo uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_id uuid := gen_random_uuid();
  v_concepto text := btrim(coalesce(p_concepto, ''));
  v_precio numeric := p_precio;
  v_cant numeric := coalesce(p_cantidad, 1);
  v_vacuna boolean := false;
  v_lote uuid;
  v_reg jsonb;
begin
  if not public.vet_puede('atender_consultas') then
    raise exception 'Agregar cargos a una consulta es de quien atiende consultas.' using errcode = '42501';
  end if;
  if p_tipo not in ('procedimiento', 'medicamento') then raise exception 'Solo se agregan procedimientos o medicamentos.'; end if;
  if v_cant <= 0 then raise exception 'La cantidad debe ser mayor a cero.'; end if;
  select c.id, c.estado, c.perro_id, c.medico_id, c.atendida_at into v_c from public.vet_consultas c
   where c.id = p_consulta and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_c.id is null then raise exception 'Esa consulta no existe.'; end if;
  if v_c.estado <> 'borrador' then raise exception 'Los cargos se arman antes de firmar. Esta consulta ya no es un borrador.'; end if;

  if p_insumo is not null then
    -- Un producto clasificado como vacuna se registra como vacuna aplicada (carnet, lote y fecha).
    select (i.tipo_clinico = 'vacuna'), i.nombre into v_vacuna, v_concepto from public.insumos i
     where i.id = p_insumo and i.negocio_id = public.negocio_actual() and i.deleted_at is null;
    if v_concepto is null then raise exception 'Ese producto no existe en el inventario.'; end if;
    if coalesce(v_vacuna, false) then
      select l.lote_id into v_lote from public.insumo_lotes_saldo l
       where l.insumo_id = p_insumo and l.saldo > 0 and l.estado_caducidad <> 'caducado'
       order by l.fecha_caducidad nulls last, l.lote_id limit 1;
      if v_lote is null then
        raise exception '«%» es una vacuna y no tiene un lote con existencia. Regístrala con «Aplicar vacuna» escribiendo el lote.', v_concepto;
      end if;
      v_reg := public.registrar_vacuna(v_c.perro_id, null, null, p_insumo, v_lote, null, null,
                                       (v_c.atendida_at at time zone public.zona_negocio())::date, null, v_c.medico_id, null,
                                       'Aplicada en la consulta', true);
      perform public._vet_cargos_sincronizar(p_consulta);
      select x.id into v_id from public.vet_consulta_cargos x
       where x.consulta_id = p_consulta and x.vacuna_id = (v_reg->>'id')::uuid and x.deleted_at is null;
      return v_id;
    end if;
    v_precio := public._vet_precio_consumo(p_insumo);
    if v_precio is null then raise exception '«%» no tiene precio de venta. Captúralo en Inventario.', v_concepto; end if;
  elsif p_servicio is not null then
    select s.nombre, public._vet_precio_servicio(s.clave) into v_concepto, v_precio from public.servicios s
     where s.id = p_servicio and s.categoria = 'veterinaria' and s.deleted_at is null;
    if v_concepto is null then raise exception 'Ese servicio no existe en el catálogo veterinario.'; end if;
  elsif public.vet_es_vacuna(v_concepto) then
    raise exception '«%» es una vacuna: no va como procedimiento. Usa «Aplicar vacuna» para que quede en el carnet con su lote y su fecha.', v_concepto;
  end if;
  if v_concepto = '' then raise exception 'Escribe el concepto.'; end if;
  if v_precio is not null and v_precio < 0 then raise exception 'El precio no puede ser negativo.'; end if;
  insert into public.vet_consulta_cargos (id, consulta_id, tipo, origen, concepto, servicio_id, insumo_id, cantidad, precio_unitario, precio_original, updated_at)
  values (v_id, p_consulta, p_tipo,
          case when p_insumo is not null then 'inventario' when p_servicio is not null then 'catalogo' else 'manual' end,
          v_concepto, p_servicio, p_insumo, v_cant, v_precio, v_precio, now());
  return v_id;
end;
$$;

-- ── 5. Sin precio no se firma ────────────────────────────────────────
create or replace function public.vet_consulta_firmar(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_m record;
  v_nombre text;
  v_hash text;
  v_hay_dx boolean;
  v_cobro jsonb;
  v_faltan int;
  v_lista text;
begin
  if not public.vet_puede('firmar_expediente') then
    raise exception 'Firmar el expediente es de un médico veterinario designado.' using errcode = '42501';
  end if;
  select m.id, m.cedula_profesional, m.cpa_sitpv, m.profile_id into v_m from public.medicos_veterinarios m
   where m.profile_id = auth.uid() and m.negocio_id = public.negocio_actual() and m.deleted_at is null;
  if v_m.id is null then
    raise exception 'Solo un médico veterinario designado firma el expediente (con su cédula).' using errcode = '42501';
  end if;
  select c.* into v_c from public.vet_consultas c where c.id = p_id and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_c.id is null then
    raise exception 'Esa consulta no existe.';
  end if;
  if v_c.estado <> 'borrador' then
    raise exception 'Esa consulta ya está firmada.';
  end if;
  if v_c.medico_id <> v_m.id then
    raise exception 'Esta consulta está a cargo de otro médico: solo él la firma. Si cambió el médico, reasígnala antes.' using errcode = '42501';
  end if;
  if btrim(coalesce(v_c.motivo, '')) = '' then
    raise exception 'Escribe el motivo de la consulta antes de firmar.';
  end if;
  v_hay_dx := jsonb_array_length(v_c.diagnosticos) > 0;
  if not v_hay_dx and v_c.tipo_clave in ('consulta', 'cirugia', 'urgencia') then
    raise exception 'Agrega al menos un diagnóstico (presuntivo o definitivo) antes de firmar.';
  end if;

  -- La propuesta de cargos se completa ANTES de revisar precios (si el servicio no existía, se siembra).
  begin
    perform public._vet_sembrar_servicios(public.negocio_actual());
    perform public._vet_cargos_sincronizar(p_id);
  exception when others then
    null;
  end;
  -- Sin precio no se firma: se captura aquí mismo o el médico marca «Sin cobro» con su motivo.
  select count(*), string_agg(x.concepto, ', ' order by x.created_at, x.id) into v_faltan, v_lista
    from public.vet_consulta_cargos x
   where x.consulta_id = p_id and x.estado = 'propuesto' and x.precio_unitario is null and x.deleted_at is null;
  if v_faltan > 0 then
    raise exception 'Falta el precio de: %. Escríbelo en «Cargos de esta consulta» (puedes guardarlo como precio de catálogo) o márcalo «Sin cobro» con su motivo.', v_lista;
  end if;

  select coalesce(p.nombre_completo, 'Médico veterinario') into v_nombre from public.profiles p where p.id = v_m.profile_id;
  v_hash := encode(sha256(convert_to(jsonb_build_object(
      'id', v_c.id, 'perro', v_c.perro_id, 'tipo', v_c.tipo_clave, 'atendida_at', v_c.atendida_at, 'motivo', v_c.motivo, 'anamnesis', v_c.anamnesis,
      'examen_fisico', v_c.examen_fisico, 'hallazgos', v_c.hallazgos, 'peso_kg', v_c.peso_kg, 'temperatura_c', v_c.temperatura_c,
      'fc', v_c.frecuencia_cardiaca, 'fr', v_c.frecuencia_respiratoria, 'cc', v_c.condicion_corporal, 'mucosas', v_c.mucosas, 'tllc', v_c.tllc_seg,
      'hidratacion', v_c.hidratacion, 'diagnosticos', v_c.diagnosticos, 'plan', v_c.plan, 'tratamiento', v_c.tratamiento,
      'notas_internas', v_c.notas_internas, 'medico', v_m.id, 'cedula', v_m.cedula_profesional)::text, 'UTF8')), 'hex');
  -- Los cargos pasan a la cuenta ANTES de cerrar el borrador. Un problema de cobro (cuenta
  -- cancelada…) nunca impide firmar el expediente: los cargos quedan pendientes para pasarlos a Caja.
  begin
    v_cobro := public._vet_consulta_cobrar(p_id);
  exception when others then
    v_cobro := jsonb_build_object('reserva_id', null, 'cargos', 0, 'total', 0, 'error', sqlerrm);
  end;
  update public.vet_consultas set
    estado = 'firmada', firmada_at = now(), firmada_por = auth.uid(), firma_medico_id = v_m.id, firma_nombre = v_nombre,
    firma_cedula = v_m.cedula_profesional, firma_cpa = v_m.cpa_sitpv, firma_hash = v_hash
  where id = p_id;
  if v_c.peso_kg is not null and not exists (
    select 1 from public.pesos_registrados w
    where w.perro_id = v_c.perro_id and w.fecha = public.fecha_negocio() and w.peso_kg = v_c.peso_kg and w.deleted_at is null
  ) then
    insert into public.pesos_registrados (perro_id, peso_kg, fecha, notas)
    values (v_c.perro_id, v_c.peso_kg, public.fecha_negocio(), 'Consulta veterinaria');
  end if;
  if v_c.cita_id is not null then
    update public.vet_citas set estado = 'finalizada' where id = v_c.cita_id and estado in ('en_curso', 'confirmada', 'programada');
  end if;
  return jsonb_build_object('id', p_id, 'firma_hash', v_hash, 'medico', v_nombre, 'cedula', v_m.cedula_profesional, 'cobro', v_cobro);
end;
$$;
