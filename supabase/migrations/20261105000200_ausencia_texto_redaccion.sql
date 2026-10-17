-- Mejor redacción del aviso: «<nombre> tiene una ausencia aprobada (Vacaciones) del … al …».
create or replace function public.ausencia_texto(
  p_nombre text, p_tipo text, p_desde date, p_hasta date, p_hora_desde time, p_hora_hasta time
) returns text
language sql
immutable
set search_path = ''
as $$
  select p_nombre || ' tiene una ausencia aprobada (' ||
    case p_tipo when 'vacaciones' then 'vacaciones' when 'incapacidad' then 'incapacidad'
                when 'dia_personal' then 'día personal' else 'falta justificada' end ||
    ')' ||
    case
      when p_hora_desde is not null then ' el ' || to_char(p_desde, 'DD/MM/YYYY') || ' de ' || to_char(p_hora_desde, 'HH24:MI') || ' a ' || to_char(p_hora_hasta, 'HH24:MI')
      when p_desde = p_hasta then ' el ' || to_char(p_desde, 'DD/MM/YYYY')
      else ' del ' || to_char(p_desde, 'DD/MM/YYYY') || ' al ' || to_char(p_hasta, 'DD/MM/YYYY')
    end;
$$;
