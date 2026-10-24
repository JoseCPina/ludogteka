-- Check-in con la casa llena (QA S31, 24 de octubre de 2026). Una llegada atrasada no cuenta en la ocupación, así que
-- su check-in tardío puede dejar la casa arriba del cupo. No se bloquea (el perro ya está en la puerta), pero se pide
-- confirmar y queda anotado:
--   * Al pasar a «en curso», si con esta entrada la ocupación de hoy rebasa el cupo (de día, o de noche si es hotel),
--     el check-in no se guarda: lanza el texto «La casa está llena (10/10); al registrar la entrada quedas en 11/10.»
--     con hint `sobrecupo`. La pantalla lo enseña y pide confirmar.
--   * Confirmado (`checkin_sobrecupo = 'confirmado'` en el mismo UPDATE), se guarda y la columna queda con lo que
--     resultó («11/10 de día»). registro_ediciones (la bitácora) anota quién y cuándo, como cualquier edición.
--   * La columna solo la escribe esta función: fuera del check-in conserva su valor.

alter table public.estancias add column if not exists checkin_sobrecupo text;

create or replace function public.estancias_sobrecupo_checkin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_hoy date := public.fecha_negocio();
  v_cupo_d int;
  v_cupo_n int;
  v_hotel boolean;
  v_d int;
  v_n int;
  v_txt text;
  v_queda text;
begin
  if not (new.estado = 'en_curso' and old.estado is distinct from 'en_curso') then
    new.checkin_sobrecupo := old.checkin_sobrecupo;
    return new;
  end if;
  -- Una entrada con la hora de otro día es historia (poner al día el demo): el cupo de hoy no aplica.
  if new.hora_entrada_real is not null and (new.hora_entrada_real at time zone public.zona_negocio())::date <> v_hoy then
    new.checkin_sobrecupo := null;
    return new;
  end if;

  select c.cupo_diurno, c.cupo_nocturno into v_cupo_d, v_cupo_n from public.resolver_cupo_configuracion(v_hoy) c;
  select s.categoria = 'hotel' into v_hotel from public.servicios s where s.id = new.servicio_id;
  -- Los que cuentan hoy sin esta estancia, más ella (al entrar cuenta como adentro).
  v_d := public.ocupacion_del_dia(v_hoy, false, new.id) + 1;
  if coalesce(v_hotel, false) then
    v_n := public.ocupacion_del_dia(v_hoy, true, new.id) + 1;
  end if;

  if v_cupo_d is not null and v_d > v_cupo_d then
    v_txt := format('La casa está llena (%s/%s); al registrar la entrada quedas en %s/%s.', v_d - 1, v_cupo_d, v_d, v_cupo_d);
    v_queda := format('%s/%s de día', v_d, v_cupo_d);
  elsif v_n is not null and v_cupo_n is not null and v_n > v_cupo_n then
    v_txt := format('El cupo de noche está lleno (%s/%s); al registrar la entrada quedas en %s/%s.', v_n - 1, v_cupo_n, v_n, v_cupo_n);
    v_queda := format('%s/%s de noche', v_n, v_cupo_n);
  end if;

  if v_txt is null then
    new.checkin_sobrecupo := null;
    return new;
  end if;
  if new.checkin_sobrecupo is distinct from 'confirmado' then
    raise exception '%', v_txt using hint = 'sobrecupo';
  end if;
  new.checkin_sobrecupo := v_queda;
  return new;
end;
$$;
revoke execute on function public.estancias_sobrecupo_checkin() from public, anon;
grant execute on function public.estancias_sobrecupo_checkin() to authenticated, service_role;

drop trigger if exists estancias_sobrecupo_checkin on public.estancias;
create trigger estancias_sobrecupo_checkin
  before update on public.estancias
  for each row execute function public.estancias_sobrecupo_checkin();
