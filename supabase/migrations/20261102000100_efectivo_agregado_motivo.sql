-- N7 (QA externa, 16 de octubre de 2026): «Agregar efectivo» pide el motivo con un selector corto (Cambio,
-- Ingreso, Otro) y guarda la nota tal cual la escribió quien la capturó. Los motivos anteriores (préstamo de otra
-- caja, aportación del dueño) siguen siendo válidos para lo ya registrado.
alter table public.movimientos_caja drop constraint movimientos_caja_origen_ingreso_check;
alter table public.movimientos_caja
  add constraint movimientos_caja_origen_ingreso_check
  check (origen_ingreso is null or origen_ingreso in ('cambio', 'ingreso', 'prestamo_caja', 'aportacion_dueno', 'otro'));

create or replace function public.registrar_efectivo_agregado(p_monto numeric, p_origen text, p_nota text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno uuid;
  v_id uuid;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_etiqueta text;
begin
  if not coalesce(public.tiene_permiso('agregar_efectivo'), false) then
    raise exception 'No tienes el permiso «Agregar efectivo a caja». Pídeselo a un admin (Administración → Permisos).' using errcode = '42501';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;
  if p_origen is null or p_origen not in ('cambio', 'ingreso', 'prestamo_caja', 'aportacion_dueno', 'otro') then
    raise exception 'Elige el motivo del efectivo.';
  end if;
  if p_origen = 'otro' and char_length(coalesce(v_nota, '')) < 3 then
    raise exception 'Con «Otro», cuenta de dónde viene el efectivo en la nota.';
  end if;
  select t.id into v_turno from public.turnos_caja t where t.estado = 'abierto' limit 1;
  if v_turno is null then
    raise exception 'No hay turno de caja abierto.';
  end if;
  v_etiqueta := case p_origen when 'cambio' then 'Cambio' when 'ingreso' then 'Ingreso' when 'prestamo_caja' then 'Préstamo de otra caja' when 'aportacion_dueno' then 'Aportación del dueño' else 'Otro' end;
  insert into public.movimientos_caja (turno_id, monto, motivo, tipo, origen_ingreso, nota, created_by)
  values (v_turno, round(p_monto, 2), v_etiqueta, 'ingreso', p_origen, v_nota, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
alter function public.registrar_efectivo_agregado(numeric, text, text) owner to peludesk_definer;
revoke execute on function public.registrar_efectivo_agregado(numeric, text, text) from public, anon;
grant execute on function public.registrar_efectivo_agregado(numeric, text, text) to authenticated, service_role;
