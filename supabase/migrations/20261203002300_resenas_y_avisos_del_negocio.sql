-- App para dueños · Fase 3, parte 2 (ux/resenas-y-avisos-f3, 3 de noviembre de 2026). docs/app-duenos/FASE-3.md.
-- 1. Reseñas: el personal las contesta y las esconde con el permiso «Responder reseñas» (el admin siempre).
-- 2. Avisos al dueño cuando el NEGOCIO confirma, mueve o cancela su cita de estética o su estancia: un trigger en la
--    base (cubre todos los caminos: agenda, reservas, series, cancelar cuenta) deja el aviso en app_avisos al momento
--    (la pestaña Avisos de la app) con datos.push_pendiente; el servidor manda el push (las acciones del personal al
--    terminar y, por si acaso, el cron de la app). Solo cuando lo hace alguien del personal: lo que hace el dueño (por la
--    app o contestando el WhatsApp) no se le avisa a él mismo. Nada en la demo.

-- ── 1. Permiso y reseñas ──────────────────────────────────────────────────────────────────────────────────────────
insert into public.permisos_catalogo (clave, etiqueta, modulos, orden, updated_at)
values ('responder_resenas', 'Responder y esconder reseñas', '{portal}', coalesce((select max(orden) from public.permisos_catalogo), 0) + 1, now())
on conflict (clave) do nothing;

drop policy if exists resenas_update_staff on public.resenas;
create policy resenas_update_staff on public.resenas for update to authenticated
  using ((select public.current_rol()) in ('admin', 'recepcion') and (select public.tiene_permiso('responder_resenas')))
  with check ((select public.current_rol()) in ('admin', 'recepcion') and (select public.tiene_permiso('responder_resenas')));

-- ── 2. Avisos del negocio al dueño ────────────────────────────────────────────────────────────────────────────────
alter table public.app_avisos drop constraint if exists app_avisos_tipo_check;
alter table public.app_avisos add constraint app_avisos_tipo_check check (tipo in ('bienvenida', 'vinculo', 'prueba', 'recordatorio', 'perdida', 'encontrada', 'mensaje', 'sistema', 'registro', 'negocio'));

create or replace function public.aviso_del_negocio_al_dueno(p_perro uuid, p_titulo text, p_cuerpo text, p_origen text, p_origen_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_plan text;
  v_dueno uuid;
  v_mascota uuid;
  v_hay boolean;
begin
  -- Solo el personal (no el dueño ni la llave de servicio) y nunca en la demo.
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion', 'estetica') then
    return;
  end if;
  select n.plan into v_plan from public.negocios n where n.id = v_neg;
  if v_plan = 'demo' then
    return;
  end if;
  select m.dueno_id, m.id into v_dueno, v_mascota
  from public.mascotas_vinculos mv join public.mascotas m on m.id = mv.mascota_id
  where mv.perro_id = p_perro and mv.deleted_at is null and m.deleted_at is null
  limit 1;
  v_hay := found;
  if not v_hay or v_dueno is null then
    return;
  end if;
  insert into public.app_avisos (dueno_id, mascota_id, tipo, titulo, cuerpo, url, datos, created_by, updated_at)
  values (v_dueno, v_mascota, 'negocio', left(p_titulo, 120), left(p_cuerpo, 600), '/visitas',
          jsonb_build_object('push_pendiente', true, 'negocio_id', v_neg, 'origen', p_origen, 'origen_id', p_origen_id), null, now());
end;
$$;
alter function public.aviso_del_negocio_al_dueno(uuid, text, text, text, uuid) owner to peludesk_definer;
revoke execute on function public.aviso_del_negocio_al_dueno(uuid, text, text, text, uuid) from public, anon, authenticated;

-- Fecha y hora de un instante en la zona del negocio, dichas como «3/11 a las 10:30».
create or replace function public.texto_cuando_negocio(p_instante timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p_instante at time zone public.zona_negocio(), 'FMDD/FMMM "a las" HH24:MI');
$$;
revoke execute on function public.texto_cuando_negocio(timestamptz) from public, anon;
grant execute on function public.texto_cuando_negocio(timestamptz) to authenticated, service_role, peludesk_definer;

-- Estética, mover y cancelar: el historial de la agenda (citas_estetica_cambios) ya dice qué pasó y cuándo era.
create or replace function public.aviso_cambio_cita_estetica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cita record;
  v_negocio text;
begin
  if new.tipo not in ('reprogramacion', 'cancelacion') then
    return new;
  end if;
  select c.perro_id, c.inicio, coalesce(c.servicio_nombre, 'Estética') as servicio, p.nombre as perro into v_cita
  from public.citas_estetica c join public.perros p on p.id = c.perro_id where c.id = new.cita_id;
  if v_cita.perro_id is null then
    return new;
  end if;
  select n.nombre into v_negocio from public.negocios n where n.id = public.negocio_actual();
  if new.tipo = 'reprogramacion' then
    perform public.aviso_del_negocio_al_dueno(v_cita.perro_id,
      v_negocio || ' movió la cita de ' || v_cita.perro,
      v_cita.servicio || ': ahora es el ' || public.texto_cuando_negocio(coalesce(new.inicio_despues, v_cita.inicio))
        || coalesce(' (antes el ' || public.texto_cuando_negocio(new.inicio_antes) || ')', '') || '.',
      'cita_estetica', new.cita_id);
  else
    perform public.aviso_del_negocio_al_dueno(v_cita.perro_id,
      v_negocio || ' canceló la cita de ' || v_cita.perro,
      v_cita.servicio || ' del ' || public.texto_cuando_negocio(coalesce(new.inicio_antes, v_cita.inicio)) || '.'
        || coalesce(' Motivo: ' || nullif(btrim(new.motivo), ''), ''),
      'cita_estetica', new.cita_id);
  end if;
  return new;
end;
$$;
alter function public.aviso_cambio_cita_estetica() owner to peludesk_definer;
revoke execute on function public.aviso_cambio_cita_estetica() from public, anon, authenticated;
drop trigger if exists aviso_cambio_cita_estetica on public.citas_estetica_cambios;
create trigger aviso_cambio_cita_estetica after insert on public.citas_estetica_cambios
  for each row execute function public.aviso_cambio_cita_estetica();

-- Estética, confirmar: el personal la pasa de reservada a confirmada.
create or replace function public.aviso_confirma_cita_estetica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio text;
  v_perro text;
begin
  if new.estado = 'confirmada' and old.estado = 'reservada' then
    select n.nombre into v_negocio from public.negocios n where n.id = public.negocio_actual();
    select p.nombre into v_perro from public.perros p where p.id = new.perro_id;
    perform public.aviso_del_negocio_al_dueno(new.perro_id,
      v_negocio || ' confirmó la cita de ' || v_perro,
      coalesce(new.servicio_nombre, 'Estética') || ': el ' || public.texto_cuando_negocio(new.inicio) || '.',
      'cita_estetica', new.id);
  end if;
  return new;
end;
$$;
alter function public.aviso_confirma_cita_estetica() owner to peludesk_definer;
revoke execute on function public.aviso_confirma_cita_estetica() from public, anon, authenticated;
drop trigger if exists aviso_confirma_cita_estetica on public.citas_estetica;
create trigger aviso_confirma_cita_estetica after update of estado on public.citas_estetica
  for each row when (new.estado is distinct from old.estado) execute function public.aviso_confirma_cita_estetica();

-- Estancias: confirmar, cancelar y mover fechas.
create or replace function public.aviso_cambio_estancia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio text;
  v_perro text;
  v_que text;
  v_fechas text;
begin
  select n.nombre into v_negocio from public.negocios n where n.id = public.negocio_actual();
  select p.nombre into v_perro from public.perros p where p.id = new.perro_id;
  select case when s.categoria = 'hotel' then 'la estancia de hotel' else 'la guardería' end into v_que from public.servicios s where s.id = new.servicio_id;
  v_que := coalesce(v_que, 'la estancia');
  v_fechas := case when new.fecha_salida > new.fecha_entrada
                   then 'del ' || to_char(new.fecha_entrada, 'FMDD/FMMM') || ' al ' || to_char(new.fecha_salida, 'FMDD/FMMM')
                   else 'el ' || to_char(new.fecha_entrada, 'FMDD/FMMM') end;
  if new.estado is distinct from old.estado and new.estado = 'confirmada' and old.estado = 'reservada' then
    perform public.aviso_del_negocio_al_dueno(new.perro_id, v_negocio || ' confirmó ' || v_que || ' de ' || v_perro, 'Te esperan ' || v_fechas || '.', 'estancia', new.id);
  elsif new.estado is distinct from old.estado and new.estado = 'cancelada' and old.estado in ('reservada', 'confirmada') then
    perform public.aviso_del_negocio_al_dueno(new.perro_id, v_negocio || ' canceló ' || v_que || ' de ' || v_perro,
      'Era ' || case when old.fecha_salida > old.fecha_entrada then 'del ' || to_char(old.fecha_entrada, 'FMDD/FMMM') || ' al ' || to_char(old.fecha_salida, 'FMDD/FMMM') else 'el ' || to_char(old.fecha_entrada, 'FMDD/FMMM') end || '. Si no lo esperabas, escríbeles.',
      'estancia', new.id);
  elsif new.estado = old.estado and new.estado in ('reservada', 'confirmada')
        and (new.fecha_entrada is distinct from old.fecha_entrada or new.fecha_salida is distinct from old.fecha_salida) then
    perform public.aviso_del_negocio_al_dueno(new.perro_id, v_negocio || ' cambió las fechas de ' || v_que || ' de ' || v_perro, 'Ahora es ' || v_fechas || '.', 'estancia', new.id);
  end if;
  return new;
end;
$$;
alter function public.aviso_cambio_estancia() owner to peludesk_definer;
revoke execute on function public.aviso_cambio_estancia() from public, anon, authenticated;
drop trigger if exists aviso_cambio_estancia on public.estancias;
create trigger aviso_cambio_estancia after update of estado, fecha_entrada, fecha_salida on public.estancias
  for each row execute function public.aviso_cambio_estancia();

-- Reseñas: cuando el negocio contesta, el dueño se entera (la respuesta se ve en la página del negocio).
create or replace function public.aviso_respuesta_resena()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio text;
begin
  if new.respuesta is not null and btrim(new.respuesta) <> '' and new.respuesta is distinct from old.respuesta and new.perro_id is not null then
    select n.nombre into v_negocio from public.negocios n where n.id = public.negocio_actual();
    perform public.aviso_del_negocio_al_dueno(new.perro_id, v_negocio || ' contestó tu reseña', left(new.respuesta, 300), 'resena', new.id);
  end if;
  return new;
end;
$$;
alter function public.aviso_respuesta_resena() owner to peludesk_definer;
revoke execute on function public.aviso_respuesta_resena() from public, anon, authenticated;
drop trigger if exists aviso_respuesta_resena on public.resenas;
create trigger aviso_respuesta_resena after update of respuesta on public.resenas
  for each row execute function public.aviso_respuesta_resena();

-- El push pendiente: el servidor los toma (más recientes que un día) y los manda.
create index if not exists app_avisos_push_pendiente_idx on public.app_avisos (created_at) where (datos ->> 'push_pendiente') = 'true';
