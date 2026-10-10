-- Veterinaria, Fase 0 · parte 2: ficha clínica de la mascota.
--
-- La tabla sigue llamándose `perros` (renombrarla tocaría cientos de
-- funciones, políticas y pantallas); en la app, con el módulo Veterinaria
-- prendido, se habla de «mascota». Lo que la ficha clínica pedía y YA
-- existía se reutiliza, no se duplica:
--   · esterilización → perros.esterilizado (sí / no / sin dato)
--   · peso con historial por fecha → pesos_registrados
--   · alergias → perro_alergias (alérgeno, gravedad, notas)
-- Lo nuevo, en perros: especie, microchip, folio de registro (texto libre,
-- p. ej. RUAC) y notas clínicas.
--
-- Quién escribe lo nuevo: admin, o recepción con «Editar ficha clínica»
-- (`tiene_permiso` da falso con el módulo apagado). El trigger lo exige
-- también contra la API directa; la llave de servidor (el alta por link,
-- las pruebas) queda fuera. Una especie distinta de «perro» solo existe con
-- Veterinaria prendida: hotel y estética siguen siendo de perros.

alter table public.perros
  add column especie text not null default 'perro' check (especie in ('perro', 'gato', 'otro')),
  add column especie_detalle text,
  add column microchip text,
  add column folio_registro text,
  add column notas_clinicas text;

-- Un microchip es de UNA mascota dentro del negocio (se compara sin espacios
-- ni guiones, sin importar mayúsculas).
create unique index perros_microchip_unico on public.perros (negocio_id, lower(microchip))
  where microchip is not null and deleted_at is null;

create or replace function public.proteger_ficha_clinica()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_toca boolean;
begin
  -- Normaliza: sin espacios ni guiones en el microchip; textos vacíos = nulo.
  new.microchip := nullif(regexp_replace(coalesce(new.microchip, ''), '[\s\-]', '', 'g'), '');
  new.folio_registro := nullif(btrim(coalesce(new.folio_registro, '')), '');
  new.notas_clinicas := nullif(btrim(coalesce(new.notas_clinicas, '')), '');
  new.especie_detalle := nullif(btrim(coalesce(new.especie_detalle, '')), '');
  if new.microchip is not null and new.microchip !~ '^[A-Za-z0-9]{9,20}$' then
    raise exception 'El microchip lleva de 9 a 20 letras o números (sin espacios). El estándar ISO tiene 15 dígitos.';
  end if;
  if new.especie <> 'otro' then
    new.especie_detalle := null;
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_toca := new.especie <> 'perro' or new.especie_detalle is not null or new.microchip is not null
              or new.folio_registro is not null or new.notas_clinicas is not null;
  else
    v_toca := new.especie is distinct from old.especie or new.especie_detalle is distinct from old.especie_detalle
              or new.microchip is distinct from old.microchip or new.folio_registro is distinct from old.folio_registro
              or new.notas_clinicas is distinct from old.notas_clinicas;
  end if;
  if not v_toca then
    return new;
  end if;
  if new.especie <> 'perro' and not public.modulo_activo('veterinaria') then
    raise exception 'Este negocio no tiene activo el módulo «Veterinaria»: solo registra perros.' using hint = 'modulo:veterinaria';
  end if;
  if not coalesce(public.tiene_permiso('editar_ficha_clinica'), false) then
    raise exception 'La ficha clínica (especie, microchip, folio de registro y notas clínicas) la edita un admin o quien tenga el permiso «Editar ficha clínica», con el módulo Veterinaria prendido.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.proteger_ficha_clinica() from public, anon;
create trigger proteger_ficha_clinica before insert or update on public.perros
  for each row execute function public.proteger_ficha_clinica();
