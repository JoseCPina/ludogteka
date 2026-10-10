-- Facturación CFDI 4.0 (carril B, fase 2), parte 2: timbrado, cancelación,
-- factura global, portal, plataforma, llave del PAC y candados sobre los cobros.
--
-- REVERSA: ver la migración 20261014500000. Los tres triggers cfdi_bloquea_* se
-- quitan con drop trigger; las funciones, con drop function.

-- ── 1. Timbrar: la base entrega el borrador y guarda lo que el PAC contestó ──
create or replace function public.cfdi_iniciar_timbrado(p_factura_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  f public.cfdi_facturas%rowtype;
  g public.cfdi_config_negocio%rowtype;
  v_hay boolean;
begin
  if not coalesce(public.tiene_permiso('facturar'), false) then
    raise exception 'Necesitas el permiso «Facturar».';
  end if;
  select * into f from public.cfdi_facturas x where x.id = p_factura_id and x.negocio_id = v_neg and x.deleted_at is null for update;
  v_hay := found;
  if not v_hay then
    raise exception 'Esa factura no existe.';
  end if;
  if f.estado = 'timbrando' then
    raise exception 'Esta factura se está timbrando. Espera un momento y vuelve a mirar.';
  end if;
  if f.estado = 'revisar' then
    raise exception 'Esta factura quedó por revisar: el timbrado se cortó y hay que confirmar con el PAC si salió.';
  end if;
  if f.estado <> 'borrador' then
    raise exception 'Esta factura ya está %.', f.estado;
  end if;
  select * into g from public.cfdi_config_negocio x where x.negocio_id = v_neg and x.deleted_at is null;
  if not found or not g.activa then
    raise exception 'La facturación no está activa.';
  end if;
  if (select u.agotado from public.cfdi_timbres_mes() u) then
    raise exception 'Se acabaron los timbres de este mes. PeluDesk puede ampliar el tope.';
  end if;
  if exists (
    select 1 from public.cfdi_factura_cobros fc join public.cobros c on c.id = fc.cobro_id
    where fc.factura_id = f.id and c.anulado_at is not null
  ) then
    raise exception 'Uno de los cobros se anuló después de preparar la factura. Descártala y prepárala de nuevo.';
  end if;
  update public.cfdi_facturas set estado = 'timbrando', intentos = intentos + 1, error = null where id = f.id;
  perform public.cfdi_log(f.id, f.cliente_id, 'timbrado_iniciado', jsonb_build_object('intento', f.intentos + 1));
  return jsonb_build_object(
    'id', f.id, 'tipo', f.tipo, 'referencia', f.referencia, 'serie', f.serie, 'forma_pago', f.forma_pago,
    'metodo_pago', f.metodo_pago, 'uso_cfdi', f.uso_cfdi, 'emisor', f.emisor, 'receptor', f.receptor,
    'periodo_desde', f.periodo_desde, 'periodo_hasta', f.periodo_hasta, 'periodicidad', f.periodicidad,
    'total_esperado', f.total_esperado, 'relacion_tipo', f.relacion_tipo,
    'relacionada_uuid', (select r.uuid_fiscal from public.cfdi_facturas r where r.id = f.relacionada_a),
    'pac', f.pac, 'modo', g.modo,
    'conceptos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'descripcion', c.descripcion, 'clave_prod_serv', c.clave_prod_serv, 'clave_unidad', c.clave_unidad, 'unidad', c.unidad,
        'cantidad', c.cantidad, 'valor_unitario', c.valor_unitario, 'importe', c.importe, 'tasa', c.tasa, 'exento', c.exento,
        'importe_con_iva', c.importe_con_iva) order by c.orden)
      from public.cfdi_conceptos c where c.factura_id = f.id), '[]'::jsonb));
end;
$$;
alter function public.cfdi_iniciar_timbrado(uuid) owner to peludesk_definer;
revoke execute on function public.cfdi_iniciar_timbrado(uuid) from public, anon;
grant execute on function public.cfdi_iniciar_timbrado(uuid) to authenticated;

create or replace function public.cfdi_registrar_timbrado(p_factura_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  f public.cfdi_facturas%rowtype;
  v_total numeric := (p ->> 'total')::numeric;
  v_aviso text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor registra un timbrado.';
  end if;
  select * into f from public.cfdi_facturas x where x.id = p_factura_id and x.negocio_id = v_neg for update;
  if not found then
    raise exception 'Esa factura no existe.';
  end if;
  if f.estado not in ('timbrando', 'revisar') then
    raise exception 'La factura está % y no se puede timbrar.', f.estado;
  end if;
  if coalesce(p ->> 'uuid', '') = '' then
    raise exception 'El PAC no devolvió el UUID.';
  end if;
  -- El CFDI ya existe: se guarda aunque el total difiera por centavos de redondeo.
  if v_total is not null and abs(v_total - f.total_esperado) > 0.05 then
    v_aviso := format('El PAC timbró %s y el cobro era de %s: revísalo.', v_total, f.total_esperado);
  end if;
  update public.cfdi_facturas set
    estado = 'vigente', uuid_fiscal = p ->> 'uuid', pac_factura_id = p ->> 'pac_factura_id',
    folio = coalesce(p ->> 'folio', folio), serie = coalesce(nullif(p ->> 'serie', ''), serie),
    fecha_timbrado = coalesce((p ->> 'fecha')::timestamptz, now()),
    total = coalesce(v_total, total), subtotal = coalesce((p ->> 'subtotal')::numeric, subtotal),
    error = v_aviso
  where id = f.id;
  perform public.cfdi_log(f.id, f.cliente_id, 'timbrada', jsonb_build_object('uuid', p ->> 'uuid', 'folio', p ->> 'folio', 'total', v_total, 'aviso', v_aviso));
  -- La sustituta ya no es «sustitución» cuando la anterior se cancela (ver cancelación).
end;
$$;
alter function public.cfdi_registrar_timbrado(uuid, jsonb) owner to peludesk_definer;
revoke execute on function public.cfdi_registrar_timbrado(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.cfdi_registrar_timbrado(uuid, jsonb) to service_role;

-- El timbrado falló. «incierto» = se cortó la conexión y quizá sí salió: queda por revisar.
create or replace function public.cfdi_registrar_error(p_factura_id uuid, p_mensaje text, p_incierto boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  f public.cfdi_facturas%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor registra un error de timbrado.';
  end if;
  select * into f from public.cfdi_facturas x where x.id = p_factura_id and x.negocio_id = v_neg for update;
  if not found or f.estado not in ('timbrando', 'revisar') then
    return;
  end if;
  update public.cfdi_facturas set estado = case when p_incierto then 'revisar' else 'borrador' end,
    error = left(coalesce(p_mensaje, 'Error desconocido'), 800)
  where id = f.id;
  perform public.cfdi_log(f.id, f.cliente_id, case when p_incierto then 'timbrado_incierto' else 'timbrado_fallido' end,
    jsonb_build_object('mensaje', left(coalesce(p_mensaje, ''), 800)));
end;
$$;
alter function public.cfdi_registrar_error(uuid, text, boolean) owner to peludesk_definer;
revoke execute on function public.cfdi_registrar_error(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.cfdi_registrar_error(uuid, text, boolean) to service_role;

-- Un borrador que no se va a timbrar libera sus cobros.
create or replace function public.cfdi_descartar(p_factura_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  f public.cfdi_facturas%rowtype;
begin
  if not coalesce(public.tiene_permiso('facturar'), false) then
    raise exception 'Necesitas el permiso «Facturar».';
  end if;
  select * into f from public.cfdi_facturas x where x.id = p_factura_id and x.negocio_id = v_neg and x.deleted_at is null for update;
  if not found or f.estado <> 'borrador' then
    raise exception 'Solo se descarta una factura que todavía no se timbró.';
  end if;
  update public.cfdi_facturas set estado = 'descartada' where id = f.id;
  update public.cfdi_factura_cobros set vigente = false where factura_id = f.id;
  perform public.cfdi_log(f.id, f.cliente_id, 'descartada', '{}'::jsonb);
end;
$$;
alter function public.cfdi_descartar(uuid) owner to peludesk_definer;
revoke execute on function public.cfdi_descartar(uuid) from public, anon;
grant execute on function public.cfdi_descartar(uuid) to authenticated;

create or replace function public.cfdi_adjuntar_archivos(p_factura_id uuid, p_pdf text, p_xml text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor adjunta los archivos.';
  end if;
  if (p_pdf is not null and p_pdf not like v_neg::text || '/%') or (p_xml is not null and p_xml not like v_neg::text || '/%') then
    raise exception 'La ruta del archivo no es de este negocio.';
  end if;
  update public.cfdi_facturas set pdf_path = coalesce(p_pdf, pdf_path), xml_path = coalesce(p_xml, xml_path)
  where id = p_factura_id and negocio_id = v_neg;
end;
$$;
alter function public.cfdi_adjuntar_archivos(uuid, text, text) owner to peludesk_definer;
revoke execute on function public.cfdi_adjuntar_archivos(uuid, text, text) from public, anon, authenticated;
grant execute on function public.cfdi_adjuntar_archivos(uuid, text, text) to service_role;

-- Quién descarga: el personal con permiso o el dueño de la factura (portal).
create or replace function public.cfdi_archivos(p_factura_id uuid)
returns table (pdf_path text, xml_path text, uuid_fiscal text, estado text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.pdf_path, f.xml_path, f.uuid_fiscal, f.estado
  from public.cfdi_facturas f
  where f.id = p_factura_id and f.negocio_id = public.negocio_actual() and f.deleted_at is null
    and (
      coalesce(public.tiene_permiso('facturar'), false) or coalesce(public.tiene_permiso('cancelar_facturas'), false)
      or (f.cliente_id is not null and f.cliente_id = (select public.mi_cliente_id()) and f.estado in ('vigente', 'cancelacion_pendiente', 'cancelada'))
    );
$$;
alter function public.cfdi_archivos(uuid) owner to peludesk_definer;
revoke execute on function public.cfdi_archivos(uuid) from public, anon;
grant execute on function public.cfdi_archivos(uuid) to authenticated;

create or replace function public.mis_facturas()
returns table (id uuid, folio text, uuid_fiscal text, fecha_timbrado timestamptz, total numeric, estado text, tiene_pdf boolean, tiene_xml boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, coalesce(f.serie, '') || coalesce(f.folio, ''), f.uuid_fiscal, f.fecha_timbrado, f.total, f.estado,
         f.pdf_path is not null, f.xml_path is not null
  from public.cfdi_facturas f
  where f.negocio_id = public.negocio_actual() and f.deleted_at is null
    and f.cliente_id is not null and f.cliente_id = (select public.mi_cliente_id())
    and f.estado in ('vigente', 'cancelacion_pendiente', 'cancelada')
  order by f.fecha_timbrado desc nulls last;
$$;
alter function public.mis_facturas() owner to peludesk_definer;
revoke execute on function public.mis_facturas() from public, anon;
grant execute on function public.mis_facturas() to authenticated;

create or replace function public.cfdi_guardar_enlace(p_factura_id uuid, p_hash text, p_dias integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  f public.cfdi_facturas%rowtype;
begin
  if not coalesce(public.tiene_permiso('facturar'), false) then
    raise exception 'Necesitas el permiso «Facturar».';
  end if;
  select * into f from public.cfdi_facturas x where x.id = p_factura_id and x.negocio_id = v_neg and x.deleted_at is null;
  if not found or f.estado not in ('vigente', 'cancelacion_pendiente') then
    raise exception 'Solo se manda una factura vigente.';
  end if;
  if p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Enlace inválido.';
  end if;
  insert into public.cfdi_enlaces (factura_id, token_hash, vence_at)
  values (f.id, p_hash, now() + make_interval(days => greatest(1, least(coalesce(p_dias, 30), 90))));
end;
$$;
alter function public.cfdi_guardar_enlace(uuid, text, integer) owner to peludesk_definer;
revoke execute on function public.cfdi_guardar_enlace(uuid, text, integer) from public, anon;
grant execute on function public.cfdi_guardar_enlace(uuid, text, integer) to authenticated;

create or replace function public.cfdi_registrar_envio(p_factura_id uuid, p_canal text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
begin
  if not coalesce(public.tiene_permiso('facturar'), false) then
    raise exception 'Necesitas el permiso «Facturar».';
  end if;
  if p_canal not in ('whatsapp', 'correo') then
    raise exception 'Canal desconocido.';
  end if;
  update public.cfdi_facturas set
    enviado_whatsapp_at = case when p_canal = 'whatsapp' then now() else enviado_whatsapp_at end,
    enviado_correo_at = case when p_canal = 'correo' then now() else enviado_correo_at end
  where id = p_factura_id and negocio_id = v_neg and deleted_at is null;
  perform public.cfdi_log(p_factura_id, (select f.cliente_id from public.cfdi_facturas f where f.id = p_factura_id), 'enviada', jsonb_build_object('canal', p_canal));
end;
$$;
alter function public.cfdi_registrar_envio(uuid, text) owner to peludesk_definer;
revoke execute on function public.cfdi_registrar_envio(uuid, text) from public, anon;
grant execute on function public.cfdi_registrar_envio(uuid, text) to authenticated;

-- ── 2. Cancelación (motivos 01 a 04) ─────────────────────────────────────────
create or replace function public.cfdi_iniciar_cancelacion(p_factura_id uuid, p_motivo text, p_sustituta text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  f public.cfdi_facturas%rowtype;
  v_sust text := nullif(upper(btrim(coalesce(p_sustituta, ''))), '');
  v_rel record;
begin
  if not coalesce(public.tiene_permiso('cancelar_facturas'), false) then
    raise exception 'Necesitas el permiso «Cancelar facturas».';
  end if;
  if p_motivo not in ('01', '02', '03', '04') then
    raise exception 'El motivo de cancelación es 01, 02, 03 o 04.';
  end if;
  select * into f from public.cfdi_facturas x where x.id = p_factura_id and x.negocio_id = v_neg and x.deleted_at is null for update;
  if not found then
    raise exception 'Esa factura no existe.';
  end if;
  if f.estado <> 'vigente' then
    raise exception 'Solo se cancela una factura vigente (esta está %).', f.estado;
  end if;
  if p_motivo = '01' then
    if v_sust is null then
      raise exception 'El motivo 01 lleva el UUID de la factura que la sustituye.';
    end if;
    if not exists (
      select 1 from public.cfdi_facturas s
      where s.negocio_id = v_neg and upper(s.uuid_fiscal) = v_sust and s.estado in ('vigente', 'cancelacion_pendiente')
        and s.relacionada_a = f.id and s.deleted_at is null
    ) then
      raise exception 'Ese UUID no es el de una factura vigente que sustituya a esta. Primero emite la sustituta (botón «Sustituir»).';
    end if;
  else
    v_sust := null;
  end if;
  -- Un CFDI con otros CFDI vigentes relacionados no se cancela (salvo su sustituta en el 01).
  select r.folio, r.serie, r.uuid_fiscal, r.tipo into v_rel
  from public.cfdi_facturas r
  where r.negocio_id = v_neg and r.relacionada_a = f.id and r.deleted_at is null
    and r.estado in ('vigente', 'cancelacion_pendiente', 'timbrando', 'revisar')
    and not (p_motivo = '01' and upper(r.uuid_fiscal) = v_sust)
  limit 1;
  if found then
    raise exception 'Esta factura tiene otra factura vigente relacionada (%): cancélala primero.', coalesce(v_rel.serie, '') || coalesce(v_rel.folio, '');
  end if;
  update public.cfdi_facturas set cancelacion_motivo = p_motivo, cancelacion_sustituta = v_sust, cancelacion_solicitada_at = now()
  where id = f.id;
  perform public.cfdi_log(f.id, f.cliente_id, 'cancelacion_solicitada', jsonb_build_object('motivo', p_motivo, 'sustituta', v_sust));
  return jsonb_build_object('id', f.id, 'pac_factura_id', f.pac_factura_id, 'uuid', f.uuid_fiscal, 'motivo', p_motivo, 'sustituta', v_sust, 'pac', f.pac);
end;
$$;
alter function public.cfdi_iniciar_cancelacion(uuid, text, text) owner to peludesk_definer;
revoke execute on function public.cfdi_iniciar_cancelacion(uuid, text, text) from public, anon;
grant execute on function public.cfdi_iniciar_cancelacion(uuid, text, text) to authenticated;

-- El PAC contestó: cancelada, pendiente de aceptación del receptor (hasta 3 días) o rechazada.
create or replace function public.cfdi_registrar_cancelacion(p_factura_id uuid, p_estatus text, p_detalle jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  f public.cfdi_facturas%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor registra la cancelación.';
  end if;
  select * into f from public.cfdi_facturas x where x.id = p_factura_id and x.negocio_id = v_neg for update;
  if not found or f.estado not in ('vigente', 'cancelacion_pendiente') then
    return;
  end if;
  if p_estatus = 'cancelada' then
    update public.cfdi_facturas set estado = 'cancelada', cancelada_at = now(),
      cancelacion_estatus = case when f.estado = 'cancelacion_pendiente' then coalesce(p_detalle ->> 'estatus', 'aceptada') else 'aceptada' end
    where id = f.id;
    update public.cfdi_factura_cobros set vigente = false where factura_id = f.id;
    -- la sustituta pasa a ser la factura vigente de esos cobros
    update public.cfdi_factura_cobros set es_sustitucion = false
    where factura_id in (select s.id from public.cfdi_facturas s where s.relacionada_a = f.id and s.negocio_id = v_neg);
  elsif p_estatus = 'pendiente' then
    update public.cfdi_facturas set estado = 'cancelacion_pendiente', cancelacion_estatus = 'pendiente',
      cancelacion_limite = coalesce(cancelacion_limite, now() + interval '3 days')
    where id = f.id;
  elsif p_estatus = 'rechazada' then
    update public.cfdi_facturas set estado = 'vigente', cancelacion_estatus = 'rechazada', cancelacion_limite = null where id = f.id;
  else
    raise exception 'Estatus de cancelación desconocido.';
  end if;
  perform public.cfdi_log(f.id, f.cliente_id, 'cancelacion_' || p_estatus, coalesce(p_detalle, '{}'::jsonb));
end;
$$;
alter function public.cfdi_registrar_cancelacion(uuid, text, jsonb) owner to peludesk_definer;
revoke execute on function public.cfdi_registrar_cancelacion(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.cfdi_registrar_cancelacion(uuid, text, jsonb) to service_role;

-- ── 3. Factura global al público en general ──────────────────────────────────
-- Un cobro sin factura propia, de un día en adelante de la activación, es de la global.
create or replace function public.cfdi_global_periodos()
returns table (desde date, hasta date, n_cobros integer, total numeric, limite_emision timestamptz, vencida boolean, factura_id uuid, factura_estado text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  g public.cfdi_config_negocio%rowtype;
  v_zona text := public.zona_negocio();
  v_hoy date := public.fecha_negocio();
begin
  if not coalesce(public.tiene_permiso('facturar'), false) then
    raise exception 'Necesitas el permiso «Facturar».';
  end if;
  select * into g from public.cfdi_config_negocio x where x.negocio_id = v_neg and x.deleted_at is null;
  if not found or not g.activa or g.global_desde is null then
    return;
  end if;
  return query
  with cb as (
    select c.id,
      (c.created_at at time zone v_zona)::date as dia,
      (select coalesce(sum(m.monto), 0) from public.cobro_metodos m where m.cobro_id = c.id and m.deleted_at is null)
        - (select coalesce(sum(dm.monto), 0) from public.devolucion_metodos dm join public.devoluciones d on d.id = dm.devolucion_id where d.cobro_id = c.id) as neto
    from public.cobros c
    where c.negocio_id = v_neg and c.deleted_at is null and c.anulado_at is null
      and (c.created_at at time zone v_zona)::date >= g.global_desde
      and not exists (select 1 from public.cfdi_factura_cobros fc where fc.cobro_id = c.id and fc.vigente and fc.deleted_at is null)
  ), pe as (
    select cb.*,
      case g.global_periodicidad
        when 'dia' then cb.dia
        when 'semana' then (date_trunc('week', cb.dia::timestamp))::date
        else (date_trunc('month', cb.dia::timestamp))::date end as d1,
      case g.global_periodicidad
        when 'dia' then cb.dia
        when 'semana' then (date_trunc('week', cb.dia::timestamp))::date + 6
        else ((date_trunc('month', cb.dia::timestamp)) + interval '1 month - 1 day')::date end as d2
    from cb where cb.neto > 0
  )
  select pe.d1, pe.d2, count(*)::int, sum(pe.neto),
    ((pe.d2 + 2)::timestamp at time zone v_zona),
    now() > ((pe.d2 + 2)::timestamp at time zone v_zona),
    (select f.id from public.cfdi_facturas f where f.negocio_id = v_neg and f.tipo = 'global' and f.periodo_desde = pe.d1 and f.periodo_hasta = pe.d2
       and f.estado in ('borrador', 'timbrando', 'revisar') and f.deleted_at is null limit 1),
    (select f.estado from public.cfdi_facturas f where f.negocio_id = v_neg and f.tipo = 'global' and f.periodo_desde = pe.d1 and f.periodo_hasta = pe.d2
       and f.estado in ('borrador', 'timbrando', 'revisar') and f.deleted_at is null limit 1)
  from pe
  where pe.d2 < v_hoy
  group by pe.d1, pe.d2
  order by pe.d1;
end;
$$;
alter function public.cfdi_global_periodos() owner to peludesk_definer;
revoke execute on function public.cfdi_global_periodos() from public, anon;
grant execute on function public.cfdi_global_periodos() to authenticated, service_role;

create or replace function public.cfdi_preparar_global(p_desde date, p_hasta date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  g public.cfdi_config_negocio%rowtype;
  v_zona text := public.zona_negocio();
  v_ids uuid[];
  v_fac uuid;
  v_cid uuid;
  v_ord int := 0;
  v_forma text;
  l record;
  rg record;
  v_base numeric;
  v_iva numeric;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_imp jsonb := '{}'::jsonb;
  v_t record;
  v_etiqueta text;
begin
  if not (coalesce(public.tiene_permiso('facturar'), false) or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Necesitas el permiso «Facturar».';
  end if;
  select * into g from public.cfdi_config_negocio x where x.negocio_id = v_neg and x.deleted_at is null;
  if not found or not g.activa then
    raise exception 'La facturación no está activa.';
  end if;
  if g.rfc is null or g.regimen_fiscal is null or g.cp_expedicion is null then
    raise exception 'Faltan los datos fiscales del negocio.';
  end if;
  if not exists (select 1 from public.cfdi_global_periodos() p where p.desde = p_desde and p.hasta = p_hasta) then
    raise exception 'Ese periodo no está cerrado o no tiene cobros pendientes de facturar.';
  end if;
  if (select u.agotado from public.cfdi_timbres_mes() u) then
    raise exception 'Se acabaron los timbres de este mes.';
  end if;
  select array_agg(c.id order by c.created_at) into v_ids
  from public.cobros c
  where c.negocio_id = v_neg and c.deleted_at is null and c.anulado_at is null
    and (c.created_at at time zone v_zona)::date between p_desde and p_hasta
    and (c.created_at at time zone v_zona)::date >= g.global_desde
    and not exists (select 1 from public.cfdi_factura_cobros fc where fc.cobro_id = c.id and fc.vigente and fc.deleted_at is null)
    and (select coalesce(sum(m.monto), 0) from public.cobro_metodos m where m.cobro_id = c.id and m.deleted_at is null)
      > (select coalesce(sum(dm.monto), 0) from public.devolucion_metodos dm join public.devoluciones d on d.id = dm.devolucion_id where d.cobro_id = c.id);
  if v_ids is null then
    raise exception 'No hay cobros por facturar en ese periodo.';
  end if;

  select case m.metodo when 'efectivo' then '01' when 'transferencia' then '03' else '04' end into v_forma
  from public.cobro_metodos m where m.cobro_id = any (v_ids) and m.deleted_at is null
  group by m.metodo order by sum(m.monto) desc limit 1;

  insert into public.cfdi_facturas (tipo, cliente_id, emisor, receptor, serie, pac, pac_modo, forma_pago, uso_cfdi,
                                    periodo_desde, periodo_hasta, periodicidad, limite_emision)
  values ('global', null,
    jsonb_build_object('rfc', g.rfc, 'nombre', g.razon_social),
    jsonb_build_object('rfc', 'XAXX010101000', 'nombre', 'PUBLICO EN GENERAL', 'cp', g.cp_expedicion, 'regimen', '616', 'uso', 'S01', 'extranjero', false),
    g.serie, g.pac, g.modo, coalesce(v_forma, '99'), 'S01', p_desde, p_hasta, g.global_periodicidad,
    ((p_hasta + 2)::timestamp at time zone v_zona))
  returning id into v_fac;

  create temp table if not exists pg_temp.cfdi_g (clase text, importe numeric) on commit drop;
  truncate pg_temp.cfdi_g;
  foreach v_cid in array v_ids loop
    insert into pg_temp.cfdi_g select l2.clase, l2.importe from public.cfdi_lineas_cobro(v_cid) l2;
    insert into public.cfdi_factura_cobros (factura_id, cobro_id, monto)
    select v_fac, v_cid, (select coalesce(sum(m.monto), 0) from public.cobro_metodos m where m.cobro_id = v_cid and m.deleted_at is null)
                         - (select coalesce(sum(dm.monto), 0) from public.devolucion_metodos dm join public.devoluciones d on d.id = dm.devolucion_id where d.cobro_id = v_cid);
  end loop;

  for l in select clase, sum(importe) as importe from pg_temp.cfdi_g group by clase order by clase loop
    select * into rg from public.cfdi_regla_clase(l.clase);
    v_ord := v_ord + 1;
    if rg.tratamiento = 'exento' or rg.tasa = 0 then
      v_base := l.importe; v_iva := 0;
    else
      v_base := round(l.importe / (1 + rg.tasa), 2); v_iva := round(v_base * rg.tasa, 2);
    end if;
    v_etiqueta := case l.clase
      when 'estetica' then 'Servicios de estética' when 'guarderia' then 'Servicios de guardería' when 'hospedaje' then 'Servicios de hospedaje'
      when 'consulta_veterinaria' then 'Consultas veterinarias' when 'medicina_patente' then 'Medicamentos veterinarios'
      when 'alimento_mascotas' then 'Alimento para mascotas' when 'otro_producto' then 'Productos' else 'Otros servicios' end;
    insert into public.cfdi_conceptos (factura_id, orden, descripcion, clase, clave_prod_serv, clave_unidad, unidad, cantidad, valor_unitario,
                                       importe, exento, tasa, iva, importe_con_iva)
    values (v_fac, v_ord, v_etiqueta || ' del ' || to_char(p_desde, 'DD/MM/YYYY') || ' al ' || to_char(p_hasta, 'DD/MM/YYYY'),
            l.clase, rg.clave_prod_serv, rg.clave_unidad, rg.unidad, 1, v_base, v_base, rg.tratamiento = 'exento',
            case when rg.tratamiento = 'exento' then 0 else rg.tasa end, v_iva, l.importe);
    v_subtotal := v_subtotal + v_base;
    v_total := v_total + v_base + v_iva;
  end loop;

  for v_t in select c.tasa, c.exento, sum(c.importe) as base, sum(c.iva) as iva from public.cfdi_conceptos c where c.factura_id = v_fac group by c.tasa, c.exento loop
    v_imp := v_imp || jsonb_build_object(case when v_t.exento then 'exento' else to_char(v_t.tasa * 100, 'FM990.##') end,
                                          jsonb_build_object('base', v_t.base, 'iva', v_t.iva));
  end loop;
  update public.cfdi_facturas set subtotal = v_subtotal, impuestos = v_imp, total = v_total,
    total_esperado = (select coalesce(sum(fc.monto), 0) from public.cfdi_factura_cobros fc where fc.factura_id = v_fac)
  where id = v_fac;
  perform public.cfdi_log(v_fac, null, 'global_preparada', jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'cobros', cardinality(v_ids), 'total', v_total));
  return v_fac;
end;
$$;
alter function public.cfdi_preparar_global(date, date) owner to peludesk_definer;
revoke execute on function public.cfdi_preparar_global(date, date) from public, anon;
grant execute on function public.cfdi_preparar_global(date, date) to authenticated, service_role;

-- «Necesita atención»: lo que vence o se atoró (solo a quien factura o cancela).
create or replace function public.cfdi_atencion()
returns table (clave text, texto text, desde date, urgente boolean, ruta text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  g public.cfdi_config_negocio%rowtype;
  u record;
  v_zona text := public.zona_negocio();
begin
  if not (coalesce(public.tiene_permiso('facturar'), false) or coalesce(public.tiene_permiso('cancelar_facturas'), false)) then
    return;
  end if;
  select * into g from public.cfdi_config_negocio x where x.negocio_id = v_neg and x.deleted_at is null;
  if not found or not g.activa then
    return;
  end if;
  if coalesce(public.tiene_permiso('facturar'), false) then
    return query
    select 'cfdi_global'::text,
      format('Factura global %s al %s por emitir (%s cobros): %s', to_char(p.desde, 'DD/MM'), to_char(p.hasta, 'DD/MM'), p.n_cobros,
             case when p.vencida then 'ya pasaron las 24 horas del cierre' else 'vence ' || to_char(p.limite_emision at time zone v_zona, 'DD/MM HH24:MI') end),
      p.hasta, p.vencida, '/caja/facturas'::text
    from public.cfdi_global_periodos() p;
  end if;
  select * into u from public.cfdi_timbres_mes();
  if u.cerca then
    return query select 'cfdi_timbres'::text,
      format('Llevas %s de %s timbres de este mes%s', u.usados, u.tope, case when u.agotado then ': ya no puedes facturar' else '' end),
      public.fecha_negocio(), u.agotado, '/caja/facturas'::text;
  end if;
  return query select 'cfdi_cancelacion'::text,
    format('La cancelación de la factura %s espera la respuesta del cliente (hasta %s)', coalesce(f.serie, '') || coalesce(f.folio, ''), to_char(f.cancelacion_limite at time zone v_zona, 'DD/MM')),
    (f.cancelacion_solicitada_at at time zone v_zona)::date, false, '/caja/facturas'::text
  from public.cfdi_facturas f where f.negocio_id = v_neg and f.estado = 'cancelacion_pendiente' and f.deleted_at is null;
  return query select 'cfdi_revisar'::text,
    format('La factura %s quedó por revisar: el timbrado se cortó y hay que confirmar si salió', coalesce(f.serie, '') || coalesce(f.folio, 'sin folio')),
    (f.updated_at at time zone v_zona)::date, true, '/caja/facturas'::text
  from public.cfdi_facturas f where f.negocio_id = v_neg and f.estado = 'revisar' and f.deleted_at is null;
end;
$$;
alter function public.cfdi_atencion() owner to peludesk_definer;
revoke execute on function public.cfdi_atencion() from public, anon;
grant execute on function public.cfdi_atencion() to authenticated;

-- La activación fija desde cuándo junta cobros la global.
create or replace function public.cfdi_marcar_global_desde()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.activa and new.global_desde is null then
    new.global_desde := public.fecha_negocio();
  end if;
  return new;
end;
$$;
alter function public.cfdi_marcar_global_desde() owner to peludesk_definer;
revoke execute on function public.cfdi_marcar_global_desde() from public, anon, authenticated;
create trigger cfdi_config_global_desde before insert or update on public.cfdi_config_negocio
  for each row execute function public.cfdi_marcar_global_desde();

-- ── 4. Candados sobre un cobro ya facturado ──────────────────────────────────
create or replace function public.cfdi_factura_de_cobro(p_cobro_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(f.serie, '') || coalesce(f.folio, '') || case when f.tipo = 'global' then ' (global)' else '' end
  from public.cfdi_factura_cobros fc join public.cfdi_facturas f on f.id = fc.factura_id
  where fc.cobro_id = p_cobro_id and fc.vigente and fc.deleted_at is null
    and f.estado in ('timbrando', 'vigente', 'cancelacion_pendiente', 'revisar')
  limit 1;
$$;
alter function public.cfdi_factura_de_cobro(uuid) owner to peludesk_definer;
revoke execute on function public.cfdi_factura_de_cobro(uuid) from public, anon;
grant execute on function public.cfdi_factura_de_cobro(uuid) to authenticated, service_role;

create or replace function public.cfdi_bloquea_anulacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f text;
begin
  if new.anulado_at is not null and old.anulado_at is null then
    v_f := public.cfdi_factura_de_cobro(new.id);
    if v_f is not null then
      raise exception 'Este cobro ya está facturado (%). Cancela la factura antes de anular el cobro.', btrim(v_f);
    end if;
  end if;
  return new;
end;
$$;
alter function public.cfdi_bloquea_anulacion() owner to peludesk_definer;
revoke execute on function public.cfdi_bloquea_anulacion() from public, anon, authenticated;
create trigger cfdi_bloquea_anulacion before update of anulado_at on public.cobros
  for each row execute function public.cfdi_bloquea_anulacion();

create or replace function public.cfdi_bloquea_monto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f text;
  v_cobro uuid := coalesce(old.cobro_id, new.cobro_id);
begin
  if tg_op = 'UPDATE' and old.monto is not distinct from new.monto and new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;
  v_f := public.cfdi_factura_de_cobro(v_cobro);
  if v_f is not null then
    raise exception 'Este cobro ya está facturado (%). Cancela la factura antes de corregir su monto.', btrim(v_f);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
alter function public.cfdi_bloquea_monto() owner to peludesk_definer;
revoke execute on function public.cfdi_bloquea_monto() from public, anon, authenticated;
create trigger cfdi_bloquea_monto before update or delete on public.cobro_metodos
  for each row execute function public.cfdi_bloquea_monto();

create or replace function public.cfdi_bloquea_devolucion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f text;
begin
  v_f := public.cfdi_factura_de_cobro(new.cobro_id);
  if v_f is not null then
    raise exception 'Este cobro está facturado (%). Cancela la factura antes de devolver el dinero.', btrim(v_f);
  end if;
  return new;
end;
$$;
alter function public.cfdi_bloquea_devolucion() owner to peludesk_definer;
revoke execute on function public.cfdi_bloquea_devolucion() from public, anon, authenticated;
create trigger cfdi_bloquea_devolucion before insert on public.devoluciones
  for each row execute function public.cfdi_bloquea_devolucion();

-- ── 5. La llave del PAC de cada negocio, en Vault ────────────────────────────
-- De postgres (Vault): a la lista blanca de auditoria_frontera(). Sin negocio de
-- parámetro: SIEMPRE el de la petición.
create or replace function public.cfdi_guardar_llave(p_llave text, p_modo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_id uuid;
  v_cfg public.cfdi_config_negocio%rowtype;
  v_hay boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor guarda credenciales.';
  end if;
  if v_neg is null then raise exception 'Falta el negocio.'; end if;
  if p_modo not in ('pruebas', 'produccion') then raise exception 'Modo desconocido.'; end if;
  if coalesce(p_llave, '') = '' then raise exception 'La llave está vacía.'; end if;
  select * into v_cfg from public.cfdi_config_negocio where negocio_id = v_neg and deleted_at is null for update;
  v_hay := found;
  if not v_hay then
    insert into public.cfdi_config_negocio (negocio_id, created_by) values (v_neg, null) returning * into v_cfg;
  end if;
  if v_cfg.llave_secreto_id is not null and exists (select 1 from vault.secrets s where s.id = v_cfg.llave_secreto_id) then
    perform vault.update_secret(v_cfg.llave_secreto_id, p_llave);
    v_id := v_cfg.llave_secreto_id;
  else
    v_id := vault.create_secret(p_llave, 'peludesk:' || v_neg || ':cfdi:' || gen_random_uuid(), 'Llave del PAC de un negocio de PeluDesk');
  end if;
  update public.cfdi_config_negocio set llave_secreto_id = v_id, llave_modo = p_modo, llave_guardada_at = now()
  where id = v_cfg.id;
  insert into public.cfdi_eventos (negocio_id, tipo, detalle) values (v_neg, 'llave_guardada', jsonb_build_object('modo', p_modo));
end;
$$;

create or replace function public.cfdi_leer_llave()
returns table (llave text, modo text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor lee credenciales.';
  end if;
  if public.negocio_actual() is null then return; end if;
  return query
  select d.decrypted_secret::text, c.llave_modo
  from public.cfdi_config_negocio c join vault.decrypted_secrets d on d.id = c.llave_secreto_id
  where c.negocio_id = public.negocio_actual() and c.deleted_at is null;
end;
$$;

create or replace function public.cfdi_borrar_llave()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor borra credenciales.';
  end if;
  select llave_secreto_id into v_id from public.cfdi_config_negocio
  where negocio_id = public.negocio_actual() and deleted_at is null for update;
  if v_id is not null then delete from vault.secrets where id = v_id; end if;
  update public.cfdi_config_negocio set llave_secreto_id = null, llave_modo = null, llave_guardada_at = null
  where negocio_id = public.negocio_actual() and deleted_at is null;
  insert into public.cfdi_eventos (negocio_id, tipo, detalle) values (public.negocio_actual(), 'llave_borrada', '{}'::jsonb);
end;
$$;
revoke execute on function public.cfdi_guardar_llave(text, text) from public, anon, authenticated;
revoke execute on function public.cfdi_leer_llave() from public, anon, authenticated;
revoke execute on function public.cfdi_borrar_llave() from public, anon, authenticated;
grant execute on function public.cfdi_guardar_llave(text, text) to service_role;
grant execute on function public.cfdi_leer_llave() to service_role;
grant execute on function public.cfdi_borrar_llave() to service_role;

-- ── 6. Tope de timbres: lo cambia solo la plataforma ─────────────────────────
create or replace function public.plataforma_cfdi_tope(p_negocio_id uuid, p_tope integer, p_aviso_pct integer, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo.';
  end if;
  if p_tope is null or p_tope < 0 then
    raise exception 'El tope no puede ser negativo.';
  end if;
  if p_aviso_pct is null or p_aviso_pct < 1 or p_aviso_pct > 100 then
    raise exception 'El aviso va entre 1 y 100 %%.';
  end if;
  if not exists (select 1 from public.negocios n where n.id = p_negocio_id and n.deleted_at is null) then
    raise exception 'Ese negocio no existe.';
  end if;
  insert into public.cfdi_config_negocio (negocio_id, tope_timbres_mes, aviso_timbres_pct, created_by)
  values (p_negocio_id, p_tope, p_aviso_pct, null)
  on conflict (negocio_id) where deleted_at is null
  do update set tope_timbres_mes = excluded.tope_timbres_mes, aviso_timbres_pct = excluded.aviso_timbres_pct;
  perform public.plataforma_registrar_evento('cfdi_tope', p_negocio_id, null, btrim(p_motivo), jsonb_build_object('tope', p_tope, 'aviso_pct', p_aviso_pct));
end;
$$;

create or replace function public.plataforma_cfdi_uso()
returns table (negocio_id uuid, nombre text, slug text, activa boolean, modo text, llave boolean, tope integer, aviso_pct integer, usados integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  return query
  select n.id, n.nombre, n.slug, coalesce(c.activa, false), coalesce(c.modo, 'pruebas'), c.llave_secreto_id is not null,
    coalesce(c.tope_timbres_mes, 100), coalesce(c.aviso_timbres_pct, 80),
    (select count(*)::int from public.cfdi_facturas f
      where f.negocio_id = n.id and f.fecha_timbrado is not null and f.deleted_at is null
        and (f.fecha_timbrado at time zone n.zona_horaria)::date >= date_trunc('month', (now() at time zone n.zona_horaria))::date)
  from public.negocios n
  left join public.cfdi_config_negocio c on c.negocio_id = n.id and c.deleted_at is null
  where n.deleted_at is null
  order by 9 desc, n.nombre;
end;
$$;
revoke execute on function public.plataforma_cfdi_tope(uuid, integer, integer, text) from public, anon;
revoke execute on function public.plataforma_cfdi_uso() from public, anon;
grant execute on function public.plataforma_cfdi_tope(uuid, integer, integer, text) to authenticated;
grant execute on function public.plataforma_cfdi_uso() to authenticated;

-- ── 7. Lista blanca de auditoria_frontera, demo_vaciar y compartidas ─────────
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.auditoria_frontera()'::regprocedure) into v_def;
  if position('cfdi_guardar_llave' in v_def) = 0 then
    v_def := replace(v_def, $a$('resumen_datos')$a$,
      $b$('resumen_datos'), ('cfdi_guardar_llave'), ('cfdi_leer_llave'), ('cfdi_borrar_llave'), ('plataforma_cfdi_tope'), ('plataforma_cfdi_uso')$b$);
    v_def := replace(v_def, $a$('planes_precios_stripe')$a$, $b$('planes_precios_stripe'), ('cfdi_catalogos')$b$);
    if position('cfdi_guardar_llave' in v_def) = 0 or position('cfdi_catalogos' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar la facturación.';
    end if;
    execute v_def;
  end if;
end $$;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.demo_vaciar(uuid)'::regprocedure) into v_def;
  if position('cfdi_eventos' in v_def) = 0 then
    v_def := replace(v_def, $a$'adelantos', 'asistencia_correcciones'$a$,
      $b$'cfdi_enlaces', 'cfdi_eventos', 'cfdi_conceptos', 'cfdi_factura_cobros', 'cfdi_facturas', 'cfdi_datos_fiscales', 'cfdi_insumo_fiscal', 'cfdi_servicio_fiscal', 'cfdi_clases', 'cfdi_config_negocio', 'adelantos', 'asistencia_correcciones'$b$);
    if position('cfdi_eventos' in v_def) = 0 then
      raise exception 'demo_vaciar cambió: no se pudieron agregar las tablas de facturación.';
    end if;
    execute v_def;
  end if;
end $$;
