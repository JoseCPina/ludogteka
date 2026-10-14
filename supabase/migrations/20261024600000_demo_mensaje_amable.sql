-- El demo (plan demo) rechaza toda escritura, como siempre; solo cambia lo que lee quien lo explora:
-- «En la demo no se guardan cambios. Prueba 15 días gratis con tu negocio.» en vez del texto técnico.
-- Una prueba vencida o un negocio suspendido conservan el mensaje de siempre.
create or replace function public.exigir_negocio_escribible()
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.negocio_escribible() then
    if coalesce((select n.plan from public.negocios n where n.id = public.negocio_actual()), '') = 'demo' then
      raise exception 'En la demo no se guardan cambios. Prueba 15 días gratis con tu negocio.' using errcode = '42501';
    end if;
    raise exception 'Este negocio está en solo lectura: no se pueden guardar cambios.' using errcode = '42501';
  end if;
  return true;
end;
$$;
