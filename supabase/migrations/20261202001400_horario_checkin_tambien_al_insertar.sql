-- N125 (cont.): una estancia que se da de alta ya «en curso» (o finalizada) por la API también pasa por la pregunta de
-- fuera de horario; antes solo la cuidaba el UPDATE. En un INSERT, OLD es NULL: v_entra / v_sale se calculan igual y
-- las columnas parten vacías salvo la confirmación. Las banderas van con coalesce (con OLD nulo darían NULL).
-- Cuerpo de 20261202001300 con ese cambio.
create or replace function public.estancias_horario_checkin_checkout()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_entra boolean := coalesce(new.estado = 'en_curso' and old.estado is distinct from 'en_curso', false);
  v_sale boolean := coalesce(new.estado = 'finalizada' and old.estado = 'en_curso', false);
  v_momento timestamptz;
  v_fuera text;
begin
  -- Las columnas solo cambian en su transición.
  if not v_entra then new.checkin_fuera_horario := old.checkin_fuera_horario; end if;
  if not v_sale then new.checkout_fuera_horario := old.checkout_fuera_horario; end if;
  if not (v_entra or v_sale) then
    return new;
  end if;

  v_momento := coalesce(case when v_entra then new.hora_entrada_real else new.hora_salida_real end, now());
  -- Sin sesión (el cron del demo) o con la hora de otro día (historia): no se pregunta.
  if auth.uid() is null or (v_momento at time zone public.zona_negocio())::date <> public.fecha_negocio() then
    if v_entra then new.checkin_fuera_horario := null; else new.checkout_fuera_horario := null; end if;
    return new;
  end if;

  v_fuera := public.fuera_de_horario(v_momento);
  if v_fuera is null then
    if v_entra then new.checkin_fuera_horario := null; else new.checkout_fuera_horario := null; end if;
    return new;
  end if;
  if (case when v_entra then new.checkin_fuera_horario else new.checkout_fuera_horario end) is distinct from 'confirmado' then
    raise exception '%', public.pregunta_fuera_de_horario(v_momento) using hint = 'fuera_horario';
  end if;
  if v_entra then new.checkin_fuera_horario := v_fuera; else new.checkout_fuera_horario := v_fuera; end if;
  return new;
end;
$$;
revoke execute on function public.estancias_horario_checkin_checkout() from public, anon;
grant execute on function public.estancias_horario_checkin_checkout() to authenticated, service_role;

drop trigger if exists estancias_horario_checkin_checkout on public.estancias;
create trigger estancias_horario_checkin_checkout
  before insert or update on public.estancias
  for each row execute function public.estancias_horario_checkin_checkout();
