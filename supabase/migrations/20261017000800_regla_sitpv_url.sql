-- Veterinaria, Fase 4 · parte 9: la dirección del SITPV es una regla editable por la plataforma
-- (el botón «Abrir SITPV» la usa). El valor sembrado hay que verificarlo contra el portal vigente.
insert into public.vet_reglas (clave, valor, titulo, descripcion, fuente, orden) values
  ('sitpv_url', '"https://sitpv.senasica.gob.mx"', 'Dirección del SITPV', 'A dónde manda el botón «Abrir SITPV». Verifica que sea el portal vigente de SENASICA.', 'Por verificar contra el portal vigente', 140);

create or replace function public.plataforma_vet_regla_guardar(p_clave text, p_valor jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_antes jsonb;
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  select r.valor into v_antes from public.vet_reglas r where r.clave = p_clave;
  if not found then
    raise exception 'Esa regla no existe.';
  end if;
  if p_clave = 'sitpv_url' then
    if jsonb_typeof(p_valor) <> 'string' or (p_valor #>> '{}') !~ '^https://[A-Za-z0-9.-]+(/[^ ]*)?$' then
      raise exception 'Escribe una dirección que empiece con https://';
    end if;
  elsif p_clave like 'leyenda_%' then
    if jsonb_typeof(p_valor) <> 'string' or btrim(p_valor #>> '{}') = '' then
      raise exception 'Escribe el texto de la leyenda.';
    end if;
  else
    if jsonb_typeof(p_valor) <> 'number' or (p_valor #>> '{}')::numeric < 0 or (p_valor #>> '{}')::numeric <> trunc((p_valor #>> '{}')::numeric) then
      raise exception 'Escribe un número entero de cero o más.';
    end if;
    if p_clave in ('lgs_tratamiento_max_dias', 'sitpv_bloque_folios', 'sitpv_reporte_dia_recordatorio', 'sitpv_reporte_dia_aviso', 'sitpv_meses_sin_reporte_bloqueo')
       and (p_valor #>> '{}')::numeric < 1 then
      raise exception 'Este valor debe ser de 1 o más.';
    end if;
    if p_clave in ('sitpv_reporte_dia_recordatorio', 'sitpv_reporte_dia_aviso') and (p_valor #>> '{}')::numeric > 28 then
      raise exception 'El día va del 1 al 28.';
    end if;
  end if;
  update public.vet_reglas set valor = p_valor where clave = p_clave;
  perform public.plataforma_registrar_evento('editar_regla_vet', null, null, null,
    jsonb_build_object('regla', p_clave, 'antes', v_antes, 'despues', p_valor));
end;
$fn$;
revoke execute on function public.plataforma_vet_regla_guardar(text, jsonb) from public, anon;
grant execute on function public.plataforma_vet_regla_guardar(text, jsonb) to authenticated, service_role;
