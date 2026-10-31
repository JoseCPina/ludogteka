-- Dar de baja una mascota sin tocar al dueño (31 de octubre de 2026).
--
-- Regla: en la ficha de la mascota, admin y recepción la dan de baja con motivo (se capturó por error, ya no viene,
-- falleció, cambió de dueño). Sin historial (citas, estancias, consultas, cobros, vacunas, contratos…) se ELIMINA de
-- verdad con lo que colgaba de su ficha; con historial queda INACTIVA: `deleted_at` (lo que todas las pantallas,
-- buscadores, agenda, reservas, cupos, pases y recordatorios ya filtran) más el motivo, quién y la nota, y su
-- expediente sigue abierto desde la ficha del dueño en «Mascotas dadas de baja», con «Reactivar». Con una cita,
-- reserva, estancia, consulta u hospitalización viva no se puede: se pide cancelarla o terminarla primero. Falleció
-- deja además `fallecido` (los recordatorios de vacunas y citas ya lo excluyen) y apaga los que estaban programados.
-- Las series recurrentes se terminan; los pases con saldo quedan visibles para devolución o traspaso a otra mascota
-- del mismo dueño. El dueño pide la baja desde su portal y el negocio la confirma («Necesita atención»).
-- Bitácora: perros_bajas (quién, cuándo, por qué, qué pasó) y registro_ediciones (concurrencia_despues).

-- ── 1. Columnas de la baja en perros ───────────────────────────────────────────────────────────────────────────────
alter table public.perros
  add column if not exists baja_motivo text check (baja_motivo is null or baja_motivo in ('error', 'ya_no_viene', 'fallecio', 'cambio_dueno')),
  add column if not exists baja_nota text check (baja_nota is null or char_length(baja_nota) <= 500),
  add column if not exists baja_por uuid references auth.users(id) on delete set null;

comment on column public.perros.baja_motivo is 'Por qué se dio de baja (deleted_at es cuándo): error, ya_no_viene, fallecio, cambio_dueno. NULL si está activa o si la baja es anterior a esta regla.';

-- ── 2. Bitácora de bajas y solicitudes del portal ──────────────────────────────────────────────────────────────────
create table public.perros_bajas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  -- Se conserva aunque la mascota se elimine de verdad (perro_id queda en null y el nombre se queda).
  perro_id uuid references public.perros(id) on delete set null,
  perro_nombre text not null,
  cliente_id uuid not null references public.clientes(id),
  -- solicitud: la pidió el dueño desde su portal; baja: la hizo el personal (o confirmó la solicitud); reactivacion.
  tipo text not null check (tipo in ('solicitud', 'baja', 'reactivacion')),
  motivo text check (motivo is null or motivo in ('error', 'ya_no_viene', 'fallecio', 'cambio_dueno')),
  nota text check (nota is null or char_length(nota) <= 500),
  -- solicitud: pendiente → confirmada | rechazada. baja: eliminada | inactiva. reactivacion: reactivada.
  resultado text not null check (resultado in ('pendiente', 'confirmada', 'rechazada', 'eliminada', 'inactiva', 'reactivada')),
  respuesta text check (respuesta is null or char_length(respuesta) <= 500),
  atendida_por uuid references auth.users(id) on delete set null,
  atendida_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (tipo <> 'solicitud' or motivo is not null)
);
create index perros_bajas_negocio_idx on public.perros_bajas (negocio_id);
create index perros_bajas_perro_idx on public.perros_bajas (perro_id, created_at desc);
create index perros_bajas_cliente_idx on public.perros_bajas (cliente_id, created_at desc);
create index perros_bajas_pendientes_idx on public.perros_bajas (negocio_id, created_at) where tipo = 'solicitud' and resultado = 'pendiente' and deleted_at is null;
create trigger set_updated_at before insert or update on public.perros_bajas for each row execute function public.set_updated_at();
alter table public.perros_bajas enable row level security;
-- El personal la lee (bitácora y solicitudes); el dueño ve lo suyo. Se escribe solo por las funciones de abajo.
create policy perros_bajas_select_staff on public.perros_bajas for select to authenticated using ((select public.is_staff()));
create policy perros_bajas_select_propio on public.perros_bajas for select to authenticated using (cliente_id = (select public.mi_cliente_id()));
create policy perros_bajas_insert_staff on public.perros_bajas for insert to authenticated with check ((select public.current_rol()) in ('admin', 'recepcion'));
create policy perros_bajas_update_staff on public.perros_bajas for update to authenticated using ((select public.current_rol()) in ('admin', 'recepcion')) with check ((select public.current_rol()) in ('admin', 'recepcion'));
create policy perros_bajas_negocio on public.perros_bajas as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy perros_bajas_negocio_definer on public.perros_bajas for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.perros_bajas to peludesk_definer;

-- ── 3. Qué tiene la mascota: lo vivo (bloquea), el historial (decide eliminar o inactivar), series y pases ──────────
create or replace function public.perro_baja_resumen(p_perro_id uuid)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_perro record;
  v_vivos jsonb := '[]'::jsonb;
  v_historial jsonb := '[]'::jsonb;
  v_n int;
  v_series int;
  v_pases jsonb;
  v_solicitud jsonb;
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal del negocio.' using errcode = '42501';
  end if;
  select * into v_perro from public.perros p where p.id = p_perro_id;
  if not found then raise exception 'Esa mascota no existe.' using errcode = 'P0002'; end if;

  -- Lo vivo: una cita, reserva/estancia, consulta u hospitalización que no ha terminado.
  select count(*) into v_n from public.citas_estetica c where c.perro_id = p_perro_id and c.deleted_at is null and c.estado in ('reservada', 'confirmada', 'en_curso');
  if v_n > 0 then v_vivos := v_vivos || jsonb_build_object('tipo', 'cita de estética', 'n', v_n, 'ruta', '/estetica'); end if;
  select count(*) into v_n from public.estancias e where e.perro_id = p_perro_id and e.deleted_at is null and e.estado in ('reservada', 'confirmada', 'en_curso');
  if v_n > 0 then v_vivos := v_vivos || jsonb_build_object('tipo', 'reserva o estancia de guardería u hotel', 'n', v_n, 'ruta', '/reservas'); end if;
  if to_regclass('public.vet_citas') is not null then
    select count(*) into v_n from public.vet_citas c where c.perro_id = p_perro_id and c.deleted_at is null and c.estado in ('programada', 'confirmada', 'en_curso');
    if v_n > 0 then v_vivos := v_vivos || jsonb_build_object('tipo', 'consulta de veterinaria', 'n', v_n, 'ruta', '/veterinaria/agenda'); end if;
  end if;
  if to_regclass('public.hospitalizaciones') is not null then
    select count(*) into v_n from public.hospitalizaciones h where h.perro_id = p_perro_id and h.deleted_at is null and h.estado = 'ingresado';
    if v_n > 0 then v_vivos := v_vivos || jsonb_build_object('tipo', 'hospitalización', 'n', v_n, 'ruta', '/veterinaria/hospitalizacion'); end if;
  end if;

  -- El historial: lo que hace que la ficha se conserve (inactiva) en vez de eliminarse.
  select count(*) into v_n from public.citas_estetica c where c.perro_id = p_perro_id;
  if v_n > 0 then v_historial := v_historial || jsonb_build_object('tipo', 'citas de estética', 'n', v_n); end if;
  select count(*) into v_n from public.estancias e where e.perro_id = p_perro_id;
  if v_n > 0 then v_historial := v_historial || jsonb_build_object('tipo', 'estancias', 'n', v_n); end if;
  select count(*) into v_n from public.vet_citas c where c.perro_id = p_perro_id;
  if v_n > 0 then v_historial := v_historial || jsonb_build_object('tipo', 'citas de veterinaria', 'n', v_n); end if;
  select count(*) into v_n from public.vet_consultas c where c.perro_id = p_perro_id;
  if v_n > 0 then v_historial := v_historial || jsonb_build_object('tipo', 'consultas', 'n', v_n); end if;
  select count(*) into v_n from public.hospitalizaciones h where h.perro_id = p_perro_id;
  if v_n > 0 then v_historial := v_historial || jsonb_build_object('tipo', 'hospitalizaciones', 'n', v_n); end if;
  select count(*) into v_n from public.requisitos_sanitarios_aplicados r where r.perro_id = p_perro_id;
  if v_n > 0 then v_historial := v_historial || jsonb_build_object('tipo', 'vacunas y requisitos', 'n', v_n); end if;
  select count(*) into v_n from public.carnet_vacunas v where v.perro_id = p_perro_id;
  if v_n > 0 then v_historial := v_historial || jsonb_build_object('tipo', 'vacunas del carnet', 'n', v_n); end if;
  select count(*) into v_n from public.carnet_desparasitaciones d where d.perro_id = p_perro_id;
  if v_n > 0 then v_historial := v_historial || jsonb_build_object('tipo', 'desparasitaciones', 'n', v_n); end if;
  select count(*) into v_n from public.contratos c where c.perro_id = p_perro_id;
  if v_n > 0 then v_historial := v_historial || jsonb_build_object('tipo', 'contratos', 'n', v_n); end if;
  select count(*) into v_n from public.consentimientos c where c.perro_id = p_perro_id;
  if v_n > 0 then v_historial := v_historial || jsonb_build_object('tipo', 'consentimientos', 'n', v_n); end if;
  select count(*) into v_n from public.bonos_clientes b where b.perro_id = p_perro_id;
  if v_n > 0 then v_historial := v_historial || jsonb_build_object('tipo', 'pases comprados', 'n', v_n); end if;
  select count(*) into v_n from public.servicios_extra_aplicados s where s.perro_id = p_perro_id;
  if v_n > 0 then v_historial := v_historial || jsonb_build_object('tipo', 'servicios extra', 'n', v_n); end if;
  select count(*) into v_n from public.bitacora_entradas b where b.perro_id = p_perro_id;
  if v_n > 0 then v_historial := v_historial || jsonb_build_object('tipo', 'entradas de bitácora', 'n', v_n); end if;
  select count(*) into v_n from public.reportes_guarderia r where r.perro_id = p_perro_id;
  if v_n > 0 then v_historial := v_historial || jsonb_build_object('tipo', 'reportes de comportamiento', 'n', v_n); end if;
  select count(*) into v_n from public.vet_recetas r where r.perro_id = p_perro_id;
  if v_n > 0 then v_historial := v_historial || jsonb_build_object('tipo', 'recetas', 'n', v_n); end if;
  select count(*) into v_n from public.vet_estimados e where e.perro_id = p_perro_id;
  if v_n > 0 then v_historial := v_historial || jsonb_build_object('tipo', 'estimados', 'n', v_n); end if;
  select count(*) into v_n from public.certificados_salud c where c.perro_id = p_perro_id;
  if v_n > 0 then v_historial := v_historial || jsonb_build_object('tipo', 'certificados', 'n', v_n); end if;

  select count(*) into v_series from public.series_recurrentes s where s.perro_id = p_perro_id and s.deleted_at is null and (s.fecha_fin is null or s.fecha_fin >= public.fecha_negocio());
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'disponibles', b.cantidad_disponible, 'total', b.cantidad_total, 'vence', b.fecha_vencimiento, 'servicio', s.nombre) order by b.created_at), '[]'::jsonb)
    into v_pases
  from public.bonos_clientes b join public.servicios s on s.id = b.servicio_id
  where b.perro_id = p_perro_id and b.deleted_at is null and b.cantidad_disponible > 0 and (b.fecha_vencimiento is null or b.fecha_vencimiento >= public.fecha_negocio());
  select jsonb_build_object('id', x.id, 'motivo', x.motivo, 'nota', x.nota, 'pedida_at', x.created_at) into v_solicitud
  from public.perros_bajas x where x.perro_id = p_perro_id and x.tipo = 'solicitud' and x.resultado = 'pendiente' and x.deleted_at is null
  order by x.created_at desc limit 1;

  return jsonb_build_object(
    'activa', v_perro.deleted_at is null,
    'baja_at', v_perro.deleted_at, 'baja_motivo', v_perro.baja_motivo, 'baja_nota', v_perro.baja_nota, 'baja_por', v_perro.baja_por,
    'fallecido', v_perro.fallecido,
    'vivos', v_vivos,
    'historial', v_historial,
    'tiene_historial', jsonb_array_length(v_historial) > 0,
    'series_activas', v_series,
    'pases_con_saldo', v_pases,
    'solicitud_pendiente', v_solicitud
  );
end;
$$;
alter function public.perro_baja_resumen(uuid) owner to peludesk_definer;
revoke execute on function public.perro_baja_resumen(uuid) from public, anon;
grant execute on function public.perro_baja_resumen(uuid) to authenticated, service_role;

-- ── 4. La baja ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.perro_dar_de_baja(p_perro_id uuid, p_motivo text, p_nota text default null, p_solicitud_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_perro record;
  v_resumen jsonb;
  v_vivos jsonb;
  v_texto text;
  v_resultado text;
  v_dep record;
  v_bitacora uuid;
  v_hoy date := public.fecha_negocio();
  v_apagados int := 0;
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden dar de baja una mascota.' using errcode = '42501';
  end if;
  perform public.exigir_negocio_escribible();
  if p_motivo is null or p_motivo not in ('error', 'ya_no_viene', 'fallecio', 'cambio_dueno') then
    raise exception 'Elige el motivo de la baja.';
  end if;
  select * into v_perro from public.perros p where p.id = p_perro_id;
  if not found then raise exception 'Esa mascota no existe.' using errcode = 'P0002'; end if;
  if v_perro.deleted_at is not null then raise exception 'Esa mascota ya está dada de baja.'; end if;

  v_resumen := public.perro_baja_resumen(p_perro_id);
  v_vivos := v_resumen -> 'vivos';
  if jsonb_array_length(v_vivos) > 0 then
    select string_agg(format('%s %s', x->>'n', x->>'tipo'), ', ') into v_texto from jsonb_array_elements(v_vivos) x;
    raise exception 'No se puede dar de baja a % mientras tenga % sin terminar: cancélala o termínala primero.', v_perro.nombre, v_texto using errcode = 'P0001';
  end if;

  -- La bitácora primero (si se elimina, perro_id queda en null y el nombre se queda).
  insert into public.perros_bajas (negocio_id, perro_id, perro_nombre, cliente_id, tipo, motivo, nota, resultado, atendida_por, atendida_at)
  values (v_perro.negocio_id, p_perro_id, v_perro.nombre, v_perro.cliente_id, 'baja', p_motivo, nullif(btrim(coalesce(p_nota, '')), ''), 'inactiva', auth.uid(), now())
  returning id into v_bitacora;

  -- Series recurrentes: terminan (no se generan más estancias). Lo ya reservado habría bloqueado la baja.
  update public.series_recurrentes s set deleted_at = now() where s.perro_id = p_perro_id and s.deleted_at is null;
  -- Recordatorios programados que todavía no salen: se apagan (los que se generan después ya no la toman).
  update public.recordatorios_wa r set estado = 'cancelado' where r.perro_id = p_perro_id and r.estado in ('programado', 'pausado');
  get diagnostics v_apagados = row_count;
  update public.carnet_recordatorios r set estado = 'omitido' where r.perro_id = p_perro_id and r.estado = 'pendiente';

  if (v_resumen ->> 'tiene_historial')::boolean then
    v_resultado := 'inactiva';
    update public.perros p set
      deleted_at = now(),
      baja_motivo = p_motivo,
      baja_nota = nullif(btrim(coalesce(p_nota, '')), ''),
      baja_por = auth.uid(),
      fallecido = p.fallecido or p_motivo = 'fallecio',
      fecha_fallecimiento = case when p_motivo = 'fallecio' then coalesce(p.fecha_fallecimiento, v_hoy) else p.fecha_fallecimiento end
    where p.id = p_perro_id;
  else
    -- Sin historial: se elimina de verdad, con lo que cuelga de su ficha (foto, alertas, alergias, pesos, accesos
    -- compartidos, propuestas de raza…), tabla por tabla según las llaves foráneas. Si algo de eso tiene a su vez
    -- dependientes que no se pueden borrar, se deja inactiva en vez de fallar.
    v_resultado := 'eliminada';
    begin
      for v_dep in
        select c.conrelid::regclass as tabla, a.attname as columna
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
        where c.contype = 'f' and c.confrelid = 'public.perros'::regclass
      loop
        if v_dep.tabla::text in ('public.perros_bajas', 'perros_bajas') then continue; end if;
        execute format('delete from %s where %I = $1', v_dep.tabla, v_dep.columna) using p_perro_id;
      end loop;
      delete from public.perros p where p.id = p_perro_id;
    exception when foreign_key_violation or restrict_violation then
      v_resultado := 'inactiva';
      update public.perros p set
        deleted_at = now(), baja_motivo = p_motivo, baja_nota = nullif(btrim(coalesce(p_nota, '')), ''), baja_por = auth.uid(),
        fallecido = p.fallecido or p_motivo = 'fallecio',
        fecha_fallecimiento = case when p_motivo = 'fallecio' then coalesce(p.fecha_fallecimiento, v_hoy) else p.fecha_fallecimiento end
      where p.id = p_perro_id;
    end;
  end if;

  update public.perros_bajas b set resultado = v_resultado where b.id = v_bitacora;
  if p_solicitud_id is not null then
    update public.perros_bajas b set resultado = 'confirmada', atendida_por = auth.uid(), atendida_at = now()
    where b.id = p_solicitud_id and b.tipo = 'solicitud' and b.resultado = 'pendiente';
  end if;

  return jsonb_build_object('resultado', v_resultado, 'perro_id', p_perro_id, 'cliente_id', v_perro.cliente_id, 'nombre', v_perro.nombre, 'recordatorios_apagados', v_apagados, 'pases_con_saldo', v_resumen -> 'pases_con_saldo');
end;
$$;
alter function public.perro_dar_de_baja(uuid, text, text, uuid) owner to peludesk_definer;
revoke execute on function public.perro_dar_de_baja(uuid, text, text, uuid) from public, anon;
grant execute on function public.perro_dar_de_baja(uuid, text, text, uuid) to authenticated, service_role;

-- ── 5. Reactivar ───────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.perro_reactivar(p_perro_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_perro record;
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden reactivar una mascota.' using errcode = '42501';
  end if;
  perform public.exigir_negocio_escribible();
  select * into v_perro from public.perros p where p.id = p_perro_id;
  if not found then raise exception 'Esa mascota no existe.' using errcode = 'P0002'; end if;
  if v_perro.deleted_at is null then raise exception 'Esa mascota ya está activa.'; end if;
  -- Reactivar es decir que la baja fue un error: también se quita «falleció» si vino de esa baja.
  update public.perros p set
    deleted_at = null,
    fallecido = case when p.baja_motivo = 'fallecio' then false else p.fallecido end,
    fecha_fallecimiento = case when p.baja_motivo = 'fallecio' then null else p.fecha_fallecimiento end,
    baja_motivo = null, baja_nota = null, baja_por = null
  where p.id = p_perro_id;
  insert into public.perros_bajas (negocio_id, perro_id, perro_nombre, cliente_id, tipo, motivo, nota, resultado, atendida_por, atendida_at)
  values (v_perro.negocio_id, p_perro_id, v_perro.nombre, v_perro.cliente_id, 'reactivacion', v_perro.baja_motivo, null, 'reactivada', auth.uid(), now());
  return jsonb_build_object('perro_id', p_perro_id, 'cliente_id', v_perro.cliente_id, 'nombre', v_perro.nombre);
end;
$$;
alter function public.perro_reactivar(uuid) owner to peludesk_definer;
revoke execute on function public.perro_reactivar(uuid) from public, anon;
grant execute on function public.perro_reactivar(uuid) to authenticated, service_role;

-- ── 6. El dueño pide la baja desde su portal; el negocio confirma o la rechaza ─────────────────────────────────────
create or replace function public.portal_solicitar_baja_mascota(p_perro_id uuid, p_motivo text, p_nota text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_perro record;
  v_id uuid;
begin
  if public.mi_cliente_id() is null then
    raise exception 'Solo el dueño, desde su portal.' using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in ('error', 'ya_no_viene', 'fallecio', 'cambio_dueno') then
    raise exception 'Elige el motivo.';
  end if;
  select * into v_perro from public.perros p where p.id = p_perro_id and p.cliente_id = public.mi_cliente_id();
  if not found then raise exception 'Esa mascota no es tuya.' using errcode = '42501'; end if;
  if v_perro.deleted_at is not null then raise exception 'Esa mascota ya está dada de baja.'; end if;
  if exists (select 1 from public.perros_bajas b where b.perro_id = p_perro_id and b.tipo = 'solicitud' and b.resultado = 'pendiente' and b.deleted_at is null) then
    raise exception 'Ya pediste la baja de esta mascota: el negocio la va a confirmar.';
  end if;
  insert into public.perros_bajas (negocio_id, perro_id, perro_nombre, cliente_id, tipo, motivo, nota, resultado)
  values (v_perro.negocio_id, p_perro_id, v_perro.nombre, v_perro.cliente_id, 'solicitud', p_motivo, nullif(btrim(coalesce(p_nota, '')), ''), 'pendiente')
  returning id into v_id;
  return v_id;
end;
$$;
alter function public.portal_solicitar_baja_mascota(uuid, text, text) owner to peludesk_definer;
revoke execute on function public.portal_solicitar_baja_mascota(uuid, text, text) from public, anon;
grant execute on function public.portal_solicitar_baja_mascota(uuid, text, text) to authenticated, service_role;

create or replace function public.perro_solicitud_baja_rechazar(p_solicitud_id uuid, p_respuesta text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_s record;
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción.' using errcode = '42501';
  end if;
  perform public.exigir_negocio_escribible();
  if btrim(coalesce(p_respuesta, '')) = '' then
    raise exception 'Para rechazar la solicitud hay que decir por qué: el dueño lo va a leer.';
  end if;
  select * into v_s from public.perros_bajas b where b.id = p_solicitud_id and b.tipo = 'solicitud' and b.deleted_at is null;
  if not found then raise exception 'Esa solicitud no existe.' using errcode = 'P0002'; end if;
  if v_s.resultado <> 'pendiente' then raise exception 'Esa solicitud ya se atendió.'; end if;
  update public.perros_bajas b set resultado = 'rechazada', respuesta = btrim(p_respuesta), atendida_por = auth.uid(), atendida_at = now() where b.id = p_solicitud_id;
  return jsonb_build_object('id', p_solicitud_id, 'perro_id', v_s.perro_id);
end;
$$;
alter function public.perro_solicitud_baja_rechazar(uuid, text) owner to peludesk_definer;
revoke execute on function public.perro_solicitud_baja_rechazar(uuid, text) from public, anon;
grant execute on function public.perro_solicitud_baja_rechazar(uuid, text) to authenticated, service_role;

-- ── 7. Traspasar un pase con saldo a otra mascota del mismo dueño ──────────────────────────────────────────────────
create or replace function public.pase_traspasar_a_mascota(p_bono_id uuid, p_perro_destino uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_b record;
  v_origen record;
  v_destino record;
begin
  if not (coalesce(public.is_admin(), false) or coalesce(public.tiene_permiso('ajustar_pases'), false)) then
    raise exception 'No tienes el permiso «Ajustar días de pases». Pídeselo a un admin.' using errcode = '42501';
  end if;
  perform public.exigir_negocio_escribible();
  select * into v_b from public.bonos_clientes b where b.id = p_bono_id and b.deleted_at is null;
  if not found then raise exception 'Ese pase no existe.' using errcode = 'P0002'; end if;
  if v_b.cantidad_disponible <= 0 then raise exception 'Ese pase ya no tiene saldo.'; end if;
  select * into v_destino from public.perros p where p.id = p_perro_destino and p.deleted_at is null and not coalesce(p.fallecido, false);
  if not found then raise exception 'La mascota destino tiene que estar activa.'; end if;
  if v_destino.cliente_id <> v_b.cliente_id then raise exception 'El pase solo se traspasa a otra mascota del mismo dueño.'; end if;
  if v_b.perro_id = p_perro_destino then raise exception 'El pase ya es de esa mascota.'; end if;
  select * into v_origen from public.perros p where p.id = v_b.perro_id;
  update public.bonos_clientes b set perro_id = p_perro_destino where b.id = p_bono_id;
  insert into public.bonos_ajustes (negocio_id, bono_cliente_id, perro_id, origen, motivo, motivo_texto, usados_antes, usados_despues, total, disponibles_antes, disponibles_despues, vencimiento_antes, vencimiento_despues, estado_antes, estado_despues)
  values (v_b.negocio_id, p_bono_id, p_perro_destino, 'ajuste', 'otro', format('Traspaso desde %s (dada de baja)', coalesce(v_origen.nombre, 'otra mascota')),
    v_b.cantidad_total - v_b.cantidad_disponible, v_b.cantidad_total - v_b.cantidad_disponible, v_b.cantidad_total, v_b.cantidad_disponible, v_b.cantidad_disponible,
    v_b.fecha_vencimiento, v_b.fecha_vencimiento, 'activo', 'activo');
  return jsonb_build_object('bono_id', p_bono_id, 'perro_id', p_perro_destino, 'destino', v_destino.nombre);
end;
$$;
alter function public.pase_traspasar_a_mascota(uuid, uuid) owner to peludesk_definer;
revoke execute on function public.pase_traspasar_a_mascota(uuid, uuid) from public, anon;
grant execute on function public.pase_traspasar_a_mascota(uuid, uuid) to authenticated, service_role;
