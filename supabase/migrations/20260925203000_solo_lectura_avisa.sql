-- Solo lectura que AVISA en vez de filtrar en silencio.
--
-- Las políticas <tabla>_escritura_ins/upd/del (migración 20260925175159)
-- decían `negocio_escribible()`: un INSERT fallaba con el texto crudo de
-- RLS, en inglés, y un UPDATE directo a una tabla no fallaba — simplemente
-- no encontraba filas, y la pantalla decía "guardado" sin haber guardado
-- nada (en el demo y en una prueba vencida, donde la gente sí aprieta
-- botones). Ahora llaman a exigir_negocio_escribible(), que lanza el
-- mensaje en español con el código 42501; envuelta en (select …) se evalúa
-- una vez por sentencia.
create or replace function public.exigir_negocio_escribible()
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.negocio_escribible() then
    raise exception 'Este negocio está en solo lectura: no se pueden guardar cambios.' using errcode = '42501';
  end if;
  return true;
end;
$$;
revoke execute on function public.exigir_negocio_escribible() from public, anon;
grant execute on function public.exigir_negocio_escribible() to authenticated, service_role, peludesk_definer;

do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname, cmd from pg_policies
    where schemaname in ('public', 'storage') and policyname ~ '_escritura_(ins|upd|del)$'
  loop
    if r.cmd = 'INSERT' then
      execute format('alter policy %I on %I.%I with check ((select public.exigir_negocio_escribible()))', r.policyname, r.schemaname, r.tablename);
    elsif r.cmd = 'UPDATE' then
      execute format('alter policy %I on %I.%I using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()))', r.policyname, r.schemaname, r.tablename);
    else
      execute format('alter policy %I on %I.%I using ((select public.exigir_negocio_escribible()))', r.policyname, r.schemaname, r.tablename);
    end if;
  end loop;
end;
$$;
