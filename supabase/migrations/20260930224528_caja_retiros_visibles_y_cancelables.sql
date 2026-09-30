-- Caja (30 de septiembre de 2026, reporte de Ludogteka).
--
-- 1. Recepción no veía los retiros de un turno que no abrió ella. La
--    política de lectura de movimientos_caja (29 de julio) era «admin, o
--    los turnos que yo abrí»; registrar_retiro sí deja registrar en el
--    turno abierto por cualquiera. En Ludogteka el turno lo abrió la admin
--    con su cuenta, en el mostrador se trabaja con la cuenta de recepción:
--    el retiro se guardaba y la pantalla no lo enseñaba, así que se volvió
--    a guardar y quedó duplicado. Lo ve todo el personal de caja del
--    negocio (admin y recepción); la red del negocio ya acota.
-- 2. Un retiro duplicado se cancela por la app, con motivo y quién:
--    cancelar_retiro (admin cualquiera; recepción el suyo), solo con el
--    turno abierto y nunca el retiro de un gasto (ese se cancela en Gastos).
--    Baja lógica: deleted_at, igual que cancelar_gasto; nada se borra.
-- 3. La imagen con la que Ludogteka se comparte (WhatsApp) vuelve a ser la
--    de siempre: negocios.marca.imagen_compartir. Configuración de la
--    plataforma (como favicon), no datos del negocio.

drop policy if exists movimientos_caja_select on public.movimientos_caja;
create policy movimientos_caja_select on public.movimientos_caja
  for select to authenticated
  using ((select public.current_rol()) in ('admin', 'recepcion'));

alter table public.movimientos_caja
  add column cancelado_por uuid references auth.users(id) on delete set null,
  add column cancelado_at timestamptz,
  add column motivo_cancelacion text;
comment on column public.movimientos_caja.deleted_at is
  'Retiro dado de baja: por cancelar_gasto (gasto cancelado con el turno abierto) o por cancelar_retiro (con motivo y quién). No cuenta en el corte.';

create or replace function public.cancelar_retiro(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.movimientos_caja%rowtype;
  v_estado text;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden cancelar un retiro.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe por qué se cancela el retiro.';
  end if;
  select * into v from public.movimientos_caja where id = p_id;
  if not found then
    raise exception 'Ese retiro no existe.';
  end if;
  if v.deleted_at is not null then
    raise exception 'Ese retiro ya estaba cancelado.';
  end if;
  if exists (select 1 from public.gastos g where g.movimiento_caja_id = v.id) then
    raise exception 'Este retiro es de un gasto pagado del cajón: cancela el gasto en Gastos y el retiro se quita solo.';
  end if;
  select t.estado into v_estado from public.turnos_caja t where t.id = v.turno_id;
  if v_estado <> 'abierto' then
    raise exception 'El turno de este retiro ya se cerró: el corte ya lo tomó en cuenta. Anótalo en el siguiente corte.';
  end if;
  if not public.is_admin() and v.created_by is distinct from auth.uid() then
    raise exception 'Solo quien registró el retiro, o un admin, puede cancelarlo.';
  end if;
  update public.movimientos_caja
  set deleted_at = now(), cancelado_por = auth.uid(), cancelado_at = now(), motivo_cancelacion = btrim(p_motivo)
  where id = v.id;
end;
$$;
alter function public.cancelar_retiro(uuid, text) owner to peludesk_definer;
revoke execute on function public.cancelar_retiro(uuid, text) from public, anon;
grant execute on function public.cancelar_retiro(uuid, text) to authenticated;

-- Ludogteka: la imagen de siempre al compartir un link (era el
-- opengraph-image.jpg de la raíz, que aplicaba a todas sus páginas).
update public.negocios
set marca = coalesce(marca, '{}'::jsonb) || '{"imagen_compartir": "/opengraph-image.jpg"}'::jsonb
where slug = 'ludogteka'
  and coalesce(marca ->> 'imagen_compartir', '') = '';
