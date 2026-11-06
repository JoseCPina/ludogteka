-- Recolección pedida por el dueño (app): los km ya no se le creen a la app. La base los vuelve a calcular con
-- recoleccion_cotizar (dirección guardada o ubicación que mandó), y rechaza lo que no se puede calcular o pasa de 60 km
-- (el celular estaba en otro lado: en el emulador salieron 3,680 km y $44,172). Y la respuesta trae el total real de la
-- cuenta, con la recolección incluida.
create or replace function public.recoleccion_km_del_portal(p_perro uuid, p_recoleccion jsonb)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cliente uuid;
  v_q jsonb;
  v_km numeric;
begin
  select p.cliente_id into v_cliente from public.perros p
   where p.id = p_perro and p.negocio_id = public.negocio_actual() and p.deleted_at is null;
  if v_cliente is null or v_cliente is distinct from public.mi_cliente_id() then
    raise exception 'Esa mascota no es tuya en este negocio.' using errcode = '42501';
  end if;
  v_q := public.recoleccion_cotizar(v_cliente, p_recoleccion ->> 'direccion', (p_recoleccion ->> 'lat')::double precision,
    (p_recoleccion ->> 'lng')::double precision, coalesce(p_recoleccion ->> 'punto', 'negocio'));
  v_km := (v_q ->> 'km')::numeric;
  if v_km is null then
    raise exception 'No pudimos calcular la distancia. Pídela desde la dirección donde pasan por tu mascota, o pregúntale al negocio.';
  end if;
  if v_km > 60 then
    raise exception 'Tu ubicación queda a más de 60 km del negocio. Pídela desde la dirección donde pasan por tu mascota.';
  end if;
  return v_km;
end;
$$;
alter function public.recoleccion_km_del_portal(uuid, jsonb) owner to peludesk_definer;
revoke execute on function public.recoleccion_km_del_portal(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.recoleccion_km_del_portal(uuid, jsonb) to service_role;

create or replace function public.portal_pedir_cita_con_recoleccion(p_perro uuid, p_servicio uuid, p_inicio timestamptz, p_recoleccion jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_cita jsonb; v_rec jsonb; v_km numeric; v_total numeric;
begin
  if p_recoleccion is not null and (p_recoleccion ->> 'direccion') is not null then
    v_km := public.recoleccion_km_del_portal(p_perro, p_recoleccion);
  end if;
  v_cita := public.portal_pedir_cita(p_perro, p_servicio, p_inicio);
  if v_km is not null then
    v_rec := public.recoleccion_guardar((v_cita ->> 'reserva_id')::uuid, null, (v_cita ->> 'cita_id')::uuid, null, (p_recoleccion ->> 'hora')::time,
      p_recoleccion ->> 'direccion', (p_recoleccion ->> 'lat')::double precision, (p_recoleccion ->> 'lng')::double precision,
      coalesce(p_recoleccion ->> 'punto', 'negocio'), v_km, p_recoleccion ->> 'notas', false);
    select t.total_cuenta into v_total from public.cuenta_totales_reserva((v_cita ->> 'reserva_id')::uuid) t;
    v_cita := v_cita || jsonb_build_object('total_cuenta', v_total);
  end if;
  return v_cita || jsonb_build_object('recoleccion', v_rec);
end;
$$;

create or replace function public.portal_reservar_con_recoleccion(p_perro uuid, p_servicio uuid, p_entrada date, p_salida date, p_horas int, p_recoleccion jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_res jsonb; v_rec jsonb; v_km numeric; t record;
begin
  if p_recoleccion is not null and (p_recoleccion ->> 'direccion') is not null then
    v_km := public.recoleccion_km_del_portal(p_perro, p_recoleccion);
  end if;
  v_res := public.portal_reservar(p_perro, p_servicio, p_entrada, p_salida, p_horas);
  if v_km is not null then
    v_rec := public.recoleccion_guardar((v_res ->> 'reserva_id')::uuid, (v_res ->> 'estancia_id')::uuid, null, null, (p_recoleccion ->> 'hora')::time,
      p_recoleccion ->> 'direccion', (p_recoleccion ->> 'lat')::double precision, (p_recoleccion ->> 'lng')::double precision,
      coalesce(p_recoleccion ->> 'punto', 'negocio'), v_km, p_recoleccion ->> 'notas', false);
    select x.total_cuenta, x.saldo into t from public.cuenta_totales_reserva((v_res ->> 'reserva_id')::uuid) x;
    v_res := v_res || jsonb_build_object('precio_total', t.total_cuenta, 'saldo', t.saldo);
  end if;
  return v_res || jsonb_build_object('recoleccion', v_rec);
end;
$$;
