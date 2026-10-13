-- Dos mensajes que decían poco (segunda pasada de QA, 13 de octubre de 2026):
-- 1) El rechazo de una estancia por requisito sanitario decía «un requisito» sin
--    decir cuál ni de qué perro. Ahora: «Falta bordetella vigente de Firulais.».
-- 2) extra_guardar con la clase fiscal nula (por la API) pasaba el `not in` (NULL no
--    es TRUE) y reventaba con el error crudo de la restricción. Ahora la valida.
-- Las dos funciones se parchan sobre su definición vigente (nunca reescritas a mano).

-- ── 1) Texto de lo que falta ─────────────────────────────────────────────────
create or replace function public.mensaje_requisitos_faltantes(p_perro_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  with f as (
    select lower(pre.etiqueta) as etiqueta, pre.perro_nombre,
           count(*) over () as n
    from public.perro_requisitos_sanitarios_estado pre
    where pre.perro_id = p_perro_id
      and pre.estado in ('vencida', 'sin_registro')
  )
  select case
    when count(*) = 0 then 'Este perro tiene un requisito sanitario obligatorio vencido o sin registro.'
    when count(*) = 1 then 'Falta ' || min(etiqueta) || ' vigente de ' || min(perro_nombre) || '.'
    else 'Faltan ' || string_agg(etiqueta, ', ' order by etiqueta) || ' vigentes de ' || min(perro_nombre) || '.'
  end
  from f;
$$;
revoke execute on function public.mensaje_requisitos_faltantes(uuid) from public, anon;
grant execute on function public.mensaje_requisitos_faltantes(uuid) to authenticated, service_role;

do $$
declare
  v_def text;
  v_viejo constant text := $q$raise exception 'Este perro tiene un requisito sanitario obligatorio vencido o sin registro. Un admin puede autorizar una excepción con motivo.';$q$;
  v_nuevo constant text := $q$raise exception '% Un admin puede autorizar una excepción con motivo.', public.mensaje_requisitos_faltantes(new.perro_id);$q$;
begin
  select pg_get_functiondef('public.validar_estancia()'::regprocedure) into v_def;
  if position(v_viejo in v_def) = 0 then
    raise exception 'validar_estancia ya no trae el mensaje esperado; revisar a mano.';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;

-- ── 2) extra_guardar valida la clase fiscal nula ─────────────────────────────
do $$
declare
  v_def text;
  v_viejo constant text := $q$if p_clase_fiscal not in ('estetica', 'hospedaje', 'guarderia', 'otro_servicio') then$q$;
  v_nuevo constant text := $q$if p_clase_fiscal is null or p_clase_fiscal not in ('estetica', 'hospedaje', 'guarderia', 'otro_servicio') then$q$;
  v_firma regprocedure := 'public.extra_guardar(uuid,text,text,text,text,numeric,text,text,boolean)'::regprocedure;
begin
  select pg_get_functiondef(v_firma) into v_def;
  if position(v_viejo in v_def) = 0 then
    raise exception 'extra_guardar ya no trae la validación esperada; revisar a mano.';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;
