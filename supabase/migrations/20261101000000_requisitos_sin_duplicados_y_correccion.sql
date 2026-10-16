-- QA externa (16 de octubre de 2026), N4: un requisito sanitario no se duplica (mismo perro, tipo y
-- fecha) y un registro capturado por error se corrige o se anula con motivo, sin borrarlo: queda en el
-- historial como anulado y cada corrección guarda lo que decía antes.

alter table public.requisitos_sanitarios_aplicados
  add column anulado_at timestamptz,
  add column anulado_por uuid references auth.users(id) on delete set null,
  add column anulado_motivo text,
  add column historial jsonb not null default '[]'::jsonb;

-- 1. Sin duplicados. Solo la sesión del personal (authenticated) pasa por aquí: lo que escriben las
--    funciones del sistema (carnet, importaciones, propuestas confirmadas) corre con su propio rol.
create or replace function public.requisito_aplicado_sin_duplicado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and exists (
    select 1 from public.requisitos_sanitarios_aplicados r
    where r.perro_id = new.perro_id and r.tipo_requisito_id = new.tipo_requisito_id
      and r.fecha_aplicacion = new.fecha_aplicacion and r.deleted_at is null
      and r.negocio_id = new.negocio_id and r.id is distinct from new.id
  ) then
    raise exception 'Ya hay un registro de ese requisito con esa fecha para esta mascota. Si fue un error, corrígelo o anúlalo con motivo en la tabla de abajo.' using errcode = '23505';
  end if;
  return new;
end;
$$;
revoke execute on function public.requisito_aplicado_sin_duplicado() from public, anon, authenticated;
alter function public.requisito_aplicado_sin_duplicado() owner to peludesk_definer;
create trigger requisito_aplicado_sin_duplicado before insert on public.requisitos_sanitarios_aplicados
  for each row execute function public.requisito_aplicado_sin_duplicado();

-- 2. Cambiar el contenido o dar de baja un registro solo pasa por las funciones de abajo (el
--    comprobante sí se puede adjuntar directo).
create or replace function public.requisito_aplicado_protegido()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.perro_id is distinct from old.perro_id
    or new.tipo_requisito_id is distinct from old.tipo_requisito_id
    or new.fecha_aplicacion is distinct from old.fecha_aplicacion
    or new.vigencia_meses_aplicado is distinct from old.vigencia_meses_aplicado
    or new.detalle is distinct from old.detalle
    or new.notas is distinct from old.notas
    or new.deleted_at is distinct from old.deleted_at
    or new.anulado_at is distinct from old.anulado_at
    or new.anulado_por is distinct from old.anulado_por
    or new.anulado_motivo is distinct from old.anulado_motivo
    or new.historial is distinct from old.historial
  ) then
    raise exception 'Un registro sanitario se corrige o se anula con «Corregir» o «Anular con motivo».' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.requisito_aplicado_protegido() from public, anon, authenticated;
alter function public.requisito_aplicado_protegido() owner to peludesk_definer;
create trigger requisito_aplicado_protegido before update on public.requisitos_sanitarios_aplicados
  for each row execute function public.requisito_aplicado_protegido();

-- 3. Corregir (deja lo que decía antes en el historial del registro).
create or replace function public.corregir_requisito_aplicado(p_id uuid, p_fecha date, p_detalle text, p_notas text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r record;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not (coalesce(public.is_admin(), false) or public.vet_puede('registrar_vacunas')) then
    raise exception 'Corregir un registro sanitario es de admin o de quien tenga «Registrar vacunas y desparasitaciones».' using errcode = '42501';
  end if;
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'Escribe el motivo de la corrección.';
  end if;
  select * into v_r from public.requisitos_sanitarios_aplicados r
  where r.id = p_id and r.negocio_id = public.negocio_actual();
  if not found then
    raise exception 'Ese registro no existe.';
  end if;
  if v_r.deleted_at is not null then
    raise exception 'Ese registro ya está anulado.';
  end if;
  if p_fecha is null or p_fecha > public.fecha_negocio() then
    raise exception 'La fecha de aplicación no puede ser futura.';
  end if;
  if p_fecha < date '1990-01-01' then
    raise exception 'La fecha de aplicación no es válida.';
  end if;
  if exists (
    select 1 from public.requisitos_sanitarios_aplicados r
    where r.perro_id = v_r.perro_id and r.tipo_requisito_id = v_r.tipo_requisito_id and r.fecha_aplicacion = p_fecha
      and r.deleted_at is null and r.negocio_id = v_r.negocio_id and r.id <> v_r.id
  ) then
    raise exception 'Ya hay otro registro de ese requisito con esa fecha para esta mascota.';
  end if;
  update public.requisitos_sanitarios_aplicados set
    fecha_aplicacion = p_fecha,
    detalle = nullif(btrim(coalesce(p_detalle, '')), ''),
    notas = nullif(btrim(coalesce(p_notas, '')), ''),
    historial = historial || jsonb_build_array(jsonb_build_object(
      'tipo', 'correccion', 'motivo', v_motivo, 'por', auth.uid(), 'cuando', now(),
      'antes', jsonb_build_object('fecha_aplicacion', v_r.fecha_aplicacion, 'detalle', v_r.detalle, 'notas', v_r.notas)))
  where id = v_r.id;
end;
$$;

-- 4. Anular con motivo (no se borra).
create or replace function public.anular_requisito_aplicado(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not (coalesce(public.is_admin(), false) or public.vet_puede('registrar_vacunas')) then
    raise exception 'Anular un registro sanitario es de admin o de quien tenga «Registrar vacunas y desparasitaciones».' using errcode = '42501';
  end if;
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'Escribe el motivo de la anulación.';
  end if;
  update public.requisitos_sanitarios_aplicados set
    deleted_at = now(), anulado_at = now(), anulado_por = auth.uid(), anulado_motivo = v_motivo,
    historial = historial || jsonb_build_array(jsonb_build_object('tipo', 'anulacion', 'motivo', v_motivo, 'por', auth.uid(), 'cuando', now()))
  where id = p_id and negocio_id = public.negocio_actual() and deleted_at is null;
  if not found then
    raise exception 'Ese registro no existe o ya estaba anulado.';
  end if;
end;
$$;

alter function public.corregir_requisito_aplicado(uuid, date, text, text, text) owner to peludesk_definer;
alter function public.anular_requisito_aplicado(uuid, text) owner to peludesk_definer;
revoke execute on function public.corregir_requisito_aplicado(uuid, date, text, text, text) from public, anon;
revoke execute on function public.anular_requisito_aplicado(uuid, text) from public, anon;
grant execute on function public.corregir_requisito_aplicado(uuid, date, text, text, text) to authenticated, service_role;
grant execute on function public.anular_requisito_aplicado(uuid, text) to authenticated, service_role;

-- 5. Carnet: tampoco se duplica la misma vacuna o desparasitación el mismo día; un error se anula con
--    motivo (ya existía) y se captura de nuevo.
create or replace function public.carnet_sin_duplicado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_hay boolean;
begin
  if tg_table_name = 'carnet_vacunas' then
    select exists (select 1 from public.carnet_vacunas c where c.perro_id = new.perro_id and c.negocio_id = new.negocio_id
      and c.fecha_aplicacion = new.fecha_aplicacion and lower(btrim(c.biologico)) = lower(btrim(new.biologico))
      and c.anulada_at is null and c.deleted_at is null and c.id is distinct from new.id) into v_hay;
    if v_hay then
      raise exception 'Ya hay una vacuna «%» de esta mascota con esa fecha en el carnet. Si fue un error, anúlala con motivo y vuelve a capturarla.', new.biologico;
    end if;
  else
    select exists (select 1 from public.carnet_desparasitaciones c where c.perro_id = new.perro_id and c.negocio_id = new.negocio_id
      and c.fecha_aplicacion = new.fecha_aplicacion and lower(btrim(c.producto)) = lower(btrim(new.producto))
      and c.anulada_at is null and c.deleted_at is null and c.id is distinct from new.id) into v_hay;
    if v_hay then
      raise exception 'Ya hay una desparasitación «%» de esta mascota con esa fecha en el carnet. Si fue un error, anúlala con motivo y vuelve a capturarla.', new.producto;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.carnet_sin_duplicado() from public, anon, authenticated;
alter function public.carnet_sin_duplicado() owner to peludesk_definer;
create trigger carnet_sin_duplicado before insert on public.carnet_vacunas for each row execute function public.carnet_sin_duplicado();
create trigger carnet_sin_duplicado before insert on public.carnet_desparasitaciones for each row execute function public.carnet_sin_duplicado();
