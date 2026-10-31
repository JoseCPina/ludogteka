-- ═══════════════════════════════════════════════════════════════════
-- Conciliación: «Dar por revisadas todas las anteriores a…» y la regla de
-- origen corregida (31 de octubre de 2026)
--
-- Qué pasó: la conciliación daba por «cobrado desde PeluDesk» todo pago cuyo
-- pos_id fuera el de la terminal vinculada. Ese pos_id es el del PUNTO DE
-- VENTA (lo comparten todas las Point de la cuenta) y una venta tecleada
-- directo en la Point lo trae igual (external_reference «Venta presencial»,
-- metadata.integration «none»). En Ludogteka, 23 alertas abiertas y cientos
-- cerradas y reabiertas cada hora eran ventas presenciales de la Point
-- (185452297704 por $4,975.00, 184408789493 por $2,020.00 y 185632440124
-- por $320.00 entre ellas). El servidor ya solo alerta lo de origen «orden».
--
-- Aquí:
--  · conciliacion_dar_por_revisadas_hasta: el admin del negocio cierra en un
--    paso todas sus diferencias abiertas anteriores a una fecha (hora del
--    negocio), con nota; la pantalla la ofrece en Caja → Conciliación.
--  · plataforma_conciliacion_cerrar_hasta / _revertir_cierre: lo mismo hecho
--    por la administración de PeluDesk a petición del negocio, con evento de
--    auditoría (quién lo pidió, motivo, cada fila) y reversa.
--  · plataforma_conciliacion_ajenos: un pago con origen «terminal» ya cuenta
--    como ajeno (la limpieza cerrar-pagos-ajenos.mjs sigue la regla nueva).
--
-- Ningún dato se escribe al migrar. Reversa del esquema: al final (comentada).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. El admin del negocio: todas las anteriores a una fecha ──────
create or replace function public.conciliacion_dar_por_revisadas_hasta(p_hasta date, p_nota text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_nota text := btrim(coalesce(p_nota, ''));
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin da por revisadas las diferencias.' using errcode = '42501';
  end if;
  if p_hasta is null then
    raise exception 'Indica hasta qué fecha.';
  end if;
  if p_hasta > public.fecha_negocio() + 1 then
    raise exception 'La fecha no puede ser posterior a mañana.';
  end if;
  if char_length(v_nota) < 5 then
    raise exception 'Escribe qué revisaste.';
  end if;
  with cerradas as (
    update public.conciliacion_terminal ct
    set resuelta_at = now(),
        resuelta_motivo = 'Revisadas por un admin hasta el ' || to_char(p_hasta, 'DD/MM/YYYY') || ': ' || v_nota,
        resuelta_por = auth.uid()
    where ct.negocio_id = public.negocio_actual()
      and ct.resuelta_at is null and ct.deleted_at is null
      and (ct.ocurrio_at at time zone public.zona_negocio())::date < p_hasta
    returning ct.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from cerradas;
  return jsonb_build_object('cerradas', coalesce(array_length(v_ids, 1), 0), 'ids', to_jsonb(v_ids));
end;
$$;
alter function public.conciliacion_dar_por_revisadas_hasta(date, text) owner to peludesk_definer;
revoke execute on function public.conciliacion_dar_por_revisadas_hasta(date, text) from public, anon;
grant execute on function public.conciliacion_dar_por_revisadas_hasta(date, text) to authenticated, service_role;
comment on function public.conciliacion_dar_por_revisadas_hasta(date, text) is
  'Admin: cierra todas las diferencias de conciliación abiertas del negocio cuyo pago o cobro ocurrió antes de la fecha (hora del negocio), con nota. Devuelve {cerradas, ids}.';

-- ── 2. Acciones nuevas de la bitácora de la plataforma ─────────────
do $$
declare v_def text; v_acciones text[];
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c where c.conname = 'plataforma_eventos_accion_check' and c.conrelid = 'public.plataforma_eventos'::regclass;
  v_acciones := string_to_array((regexp_match(v_def, '\{([^}]*)\}'))[1], ',');
  if coalesce(array_length(v_acciones, 1), 0) < 10 then raise exception 'plataforma_eventos_accion_check cambió de forma: no se pudo leer la lista de acciones.'; end if;
  v_acciones := (select array_agg(distinct a) from unnest(v_acciones || array['conciliacion_cerrar_revisadas', 'conciliacion_revertir_revisadas']) a);
  alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
  execute format('alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check check (accion = any (%L::text[]))', v_acciones);
end $$;

-- ── 3. La plataforma, a petición del negocio ───────────────────────
-- Cierra las diferencias abiertas de UN negocio anteriores a una fecha (hora
-- de ese negocio) con el motivo pedido, y deja un evento con quién lo pidió y
-- cada fila cerrada (para revertir). Sin nada abierto no escribe ni registra.
create or replace function public.plataforma_conciliacion_cerrar_hasta(p_negocio_id uuid, p_hasta date, p_motivo text, p_solicitante text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg record;
  v_filas jsonb;
  v_evento uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if coalesce(auth.role(), '') <> 'service_role' and not coalesce((select public.es_admin_plataforma()), false) then
    raise exception 'Solo la administración de PeluDesk.' using errcode = '42501';
  end if;
  if p_negocio_id is null or p_hasta is null then
    raise exception 'Indica el negocio y hasta qué fecha.';
  end if;
  if char_length(v_motivo) < 5 or char_length(btrim(coalesce(p_solicitante, ''))) < 3 then
    raise exception 'Indica el motivo y quién lo pidió.';
  end if;
  select n.id, n.nombre, n.zona_horaria into v_neg from public.negocios n where n.id = p_negocio_id;
  if not found then
    raise exception 'No existe ese negocio.';
  end if;
  with cerradas as (
    update public.conciliacion_terminal ct
    set resuelta_at = now(), resuelta_motivo = v_motivo, resuelta_por = auth.uid()
    where ct.negocio_id = v_neg.id
      and ct.resuelta_at is null and ct.deleted_at is null
      and (ct.ocurrio_at at time zone v_neg.zona_horaria)::date < p_hasta
    returning ct.id, ct.tipo, ct.clave, ct.mp_pago_id, ct.cobro_id, ct.monto, ct.ocurrio_at, ct.detectada_at
  )
  select jsonb_agg(jsonb_build_object('id', c.id, 'tipo', c.tipo, 'clave', c.clave, 'mp_pago_id', c.mp_pago_id, 'cobro_id', c.cobro_id,
                                      'monto', c.monto, 'ocurrio_at', c.ocurrio_at, 'detectada_at', c.detectada_at) order by c.ocurrio_at)
  into v_filas from cerradas c;
  if v_filas is null then
    return jsonb_build_object('negocio', v_neg.nombre, 'cerradas', 0);
  end if;
  insert into public.plataforma_eventos (accion, negocio_id, motivo, detalle, created_by)
  values ('conciliacion_cerrar_revisadas', v_neg.id, v_motivo,
    jsonb_build_object('hasta', p_hasta, 'solicitante', btrim(p_solicitante), 'filas', v_filas,
                       'via', case when auth.role() = 'service_role' then 'servicio' else 'sesion' end), auth.uid())
  returning plataforma_eventos.id into v_evento;
  return jsonb_build_object('evento_id', v_evento, 'negocio', v_neg.nombre, 'cerradas', jsonb_array_length(v_filas), 'filas', v_filas);
end;
$$;
revoke execute on function public.plataforma_conciliacion_cerrar_hasta(uuid, date, text, text) from public, anon;
grant execute on function public.plataforma_conciliacion_cerrar_hasta(uuid, date, text, text) to authenticated, service_role;

-- Reversa: reabre lo que ese evento cerró (salvo lo que la conciliación ya
-- volvió a abrir con la misma clave).
create or replace function public.plataforma_conciliacion_revertir_cierre(p_evento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ev record;
  v_f jsonb;
  v_n int := 0;
  v_evento uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not coalesce((select public.es_admin_plataforma()), false) then
    raise exception 'Solo la administración de PeluDesk.' using errcode = '42501';
  end if;
  select * into v_ev from public.plataforma_eventos e where e.id = p_evento_id and e.accion = 'conciliacion_cerrar_revisadas';
  if not found then
    raise exception 'No hay un cierre de conciliación con ese evento.';
  end if;
  if exists (select 1 from public.plataforma_eventos e where e.accion = 'conciliacion_revertir_revisadas' and (e.detalle ->> 'evento_revertido')::uuid = p_evento_id) then
    raise exception 'Ese cierre ya se revirtió.';
  end if;
  for v_f in select * from jsonb_array_elements(v_ev.detalle -> 'filas') loop
    update public.conciliacion_terminal ct
    set resuelta_at = null, resuelta_motivo = null, resuelta_por = null
    where ct.id = (v_f ->> 'id')::uuid and ct.resuelta_motivo = v_ev.motivo and ct.resuelta_at is not null
      and not exists (
        select 1 from public.conciliacion_terminal o
        where o.negocio_id = ct.negocio_id and o.tipo = ct.tipo and o.clave = ct.clave and o.resuelta_at is null
      );
    if found then v_n := v_n + 1; end if;
  end loop;
  insert into public.plataforma_eventos (accion, negocio_id, motivo, detalle, created_by)
  values ('conciliacion_revertir_revisadas', v_ev.negocio_id, 'Reversa del cierre ' || p_evento_id,
    jsonb_build_object('evento_revertido', p_evento_id, 'reabiertas', v_n), auth.uid())
  returning plataforma_eventos.id into v_evento;
  return jsonb_build_object('evento_id', v_evento, 'reabiertas', v_n);
end;
$$;
revoke execute on function public.plataforma_conciliacion_revertir_cierre(uuid) from public, anon;
grant execute on function public.plataforma_conciliacion_revertir_cierre(uuid) to authenticated, service_role;

-- ── 4. La limpieza de ajenos sigue la regla nueva ──────────────────
-- Solo el origen «orden» (o un pago ligado a una orden / con su referencia) es
-- de PeluDesk; «terminal» (pos_id del punto de venta) ya no lo es.
create or replace function public.plataforma_conciliacion_ajenos(p_negocio_id uuid default null)
returns table(id uuid, negocio_id uuid, negocio_nombre text, mp_pago_id text, monto numeric, ocurrio_at timestamptz, detectada_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not coalesce((select public.es_admin_plataforma()), false) then
    raise exception 'Solo la administración de PeluDesk.' using errcode = '42501';
  end if;
  return query
  select ct.id, ct.negocio_id, n.nombre, ct.mp_pago_id, ct.monto, ct.ocurrio_at, ct.detectada_at
  from public.conciliacion_terminal ct
  join public.negocios n on n.id = ct.negocio_id
  where ct.tipo = 'pago_sin_cobro' and ct.resuelta_at is null and ct.deleted_at is null
    and (p_negocio_id is null or ct.negocio_id = p_negocio_id)
    and coalesce(ct.detalle ->> 'origen', '') <> 'orden'
    and not exists (
      select 1 from public.mp_ordenes o
      where o.negocio_id = ct.negocio_id
        and (o.mp_payment_id = ct.mp_pago_id or o.mp_payment_ref = ct.mp_pago_id
             or (ct.detalle ->> 'referencia' is not null and o.id::text = ct.detalle ->> 'referencia'))
    )
  order by n.nombre, ct.detectada_at;
end;
$$;

-- ── 5. Lista blanca de la frontera (las dos nuevas son de postgres) ─
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position($a$('plataforma_conciliacion_cerrar_hasta')$a$ in v_def) = 0 then
    v_def := replace(v_def, $a$('plataforma_conciliacion_revertir_ajenos')$a$,
      $b$('plataforma_conciliacion_revertir_ajenos'), ('plataforma_conciliacion_cerrar_hasta'), ('plataforma_conciliacion_revertir_cierre')$b$);
    if position($a$('plataforma_conciliacion_cerrar_hasta')$a$ in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar plataforma_conciliacion_cerrar_hasta.';
    end if;
    execute v_def;
  end if;
end $$;

-- Reversa del esquema (no se corre sola):
--   drop function public.plataforma_conciliacion_revertir_cierre(uuid), public.plataforma_conciliacion_cerrar_hasta(uuid, date, text, text),
--     public.conciliacion_dar_por_revisadas_hasta(date, text);
--   (plataforma_conciliacion_ajenos: volver a «not in ('orden', 'terminal')»; las acciones nuevas pueden quedarse en el check)
