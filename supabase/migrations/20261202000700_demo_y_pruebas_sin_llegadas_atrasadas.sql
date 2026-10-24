-- El demo nunca enseña «Llegadas atrasadas» ni ocupación desfasada (QA S31, 24 de octubre de 2026). El demo Patitas &
-- Co. se siembra un día y después nadie lo opera (es de solo lectura): lo que se sembró para los días siguientes se
-- vuelve pasado sin check-in (21 llegadas atrasadas en producción) y quien estaba adentro se queda con la salida
-- vencida (7). Los negocios PRUEBA de QA quedaron igual.
--
-- `estancias_poner_al_dia(negocio, modo)` resuelve lo que ya pasó:
--   * Reservas vivas con la entrada vencida y sin check-in:
--       modo 'atender' (demo): check-in a las 10:00 de su entrada y, si ya salieron, check-out a su hora (hotel: 12:00
--         de su salida; guardería: el mismo día, a las horas que reservó o 8 h). Una de cada 8 queda «No llegó».
--       modo 'no_llego' (negocios de prueba): «No llegó».
--   * Adentro con la salida vencida (hotel con salida antes de hoy, guardería de un día anterior): check-out a su hora.
--   * Lo que no se pueda (una regla de la base lo impide) queda «No llegó»; nunca se deja a medias.
-- Solo la llave de servicio la ejecuta: la usan el cron diario del demo (/api/cron/demo) y sembrar-demo al terminar.
-- La salida que toca hoy se queda en «Se van hoy», como en un día real.

create or replace function public.estancias_poner_al_dia(p_negocio uuid, p_modo text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_hoy date;
  v_zona text;
  r record;
  v_entra timestamptz;
  v_sale timestamptz;
  v_checkin int := 0;
  v_checkout int := 0;
  v_no_llego int := 0;
begin
  if p_modo not in ('atender', 'no_llego') then
    raise exception 'Modo desconocido: %', p_modo;
  end if;
  perform set_config('app.negocio_id', p_negocio::text, true);
  v_hoy := public.fecha_negocio();
  v_zona := public.zona_negocio();

  for r in
    select e.id, e.fecha_entrada, e.fecha_salida, e.estado, e.hora_entrada_real, e.horas, s.categoria, c.nombre as cliente
      from public.estancias e
      join public.servicios s on s.id = e.servicio_id
      join public.perros p on p.id = e.perro_id
      join public.clientes c on c.id = p.cliente_id
     where e.negocio_id = p_negocio
       and e.deleted_at is null
       and ((e.estado in ('reservada', 'confirmada') and e.hora_entrada_real is null and e.fecha_entrada < v_hoy)
            or (e.estado = 'en_curso'
                and ((s.categoria = 'hotel' and e.fecha_salida < v_hoy) or (s.categoria <> 'hotel' and e.fecha_entrada < v_hoy))))
     order by e.fecha_entrada, e.id
  loop
    begin
      if r.estado <> 'en_curso' then
        if p_modo = 'no_llego' or abs(hashtext(r.id::text)) % 8 = 0 then
          update public.estancias set estado = 'no_llego' where id = r.id;
          v_no_llego := v_no_llego + 1;
          continue;
        end if;
        v_entra := (r.fecha_entrada + time '10:00') at time zone v_zona;
        -- Es historia: con la hora de otro día, el aviso de la casa llena no aplica (estancias_sobrecupo_checkin).
        update public.estancias
           set estado = 'en_curso', entregado_por_nombre = r.cliente, hora_entrada_real = v_entra
         where id = r.id;
        v_checkin := v_checkin + 1;
      else
        v_entra := r.hora_entrada_real;
      end if;

      if r.categoria = 'hotel' and r.fecha_salida >= v_hoy then
        continue; -- sigue adentro (o se va hoy)
      end if;
      v_sale := case
        when r.categoria = 'hotel' then (r.fecha_salida + time '12:00') at time zone v_zona
        else coalesce(v_entra, (r.fecha_entrada + time '10:00') at time zone v_zona) + make_interval(hours => coalesce(r.horas, 8))
      end;
      update public.estancias
         set estado = 'finalizada', recogido_por_nombre = r.cliente, recogido_por_es_dueno = true, hora_salida_real = v_sale
       where id = r.id;
      v_checkout := v_checkout + 1;
    exception when others then
      update public.estancias set estado = 'no_llego' where id = r.id and estado in ('reservada', 'confirmada');
      if found then v_no_llego := v_no_llego + 1; end if;
    end;
  end loop;

  return jsonb_build_object('checkin', v_checkin, 'checkout', v_checkout, 'no_llego', v_no_llego);
end;
$$;
revoke execute on function public.estancias_poner_al_dia(uuid, text) from public, anon, authenticated;
grant execute on function public.estancias_poner_al_dia(uuid, text) to service_role;

-- Una vez, ya: el demo y los negocios PRUEBA de QA (los «prueba» con otro nombre pueden ser prospectos reales en su
-- prueba gratis: esos no se tocan).
do $$
declare
  n record;
  v jsonb;
begin
  for n in
    select id, slug, plan from public.negocios
     where plan = 'demo' or (plan = 'prueba' and nombre ilike 'PRUEBA %')
     order by slug
  loop
    v := public.estancias_poner_al_dia(n.id, case when n.plan = 'demo' then 'atender' else 'no_llego' end);
    raise notice 'estancias_poner_al_dia %: %', n.slug, v;
  end loop;
end $$;
