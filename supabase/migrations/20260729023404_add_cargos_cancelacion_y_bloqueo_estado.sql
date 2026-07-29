-- Punto 2 (cargos): cancelar un cargo tiene que dejar rastro — es dinero.
-- Mismo espíritu que perro_alertas (nunca se borra), pero con más rigor:
-- aquí "quién" y "cuándo" son columnas propias, no texto libre dentro de
-- notas, porque el hueco clásico de caja es justo "¿quién quitó este
-- cargo y por qué?" sin que quede una respuesta clara y consultable.
alter table public.cargos_aplicados
  add column cancelado boolean not null default false,
  add column motivo_cancelacion text,
  add column cancelado_por uuid references auth.users(id) on delete set null,
  add column cancelado_at timestamptz,
  add constraint cargos_aplicados_motivo_si_cancelado
    check (not cancelado or motivo_cancelacion is not null);

-- cancelado_por/cancelado_at nunca los manda el cliente. Cancelar es un
-- camino de una sola vía — mismo principio que tarifas/estancias
-- (insert-only, nunca reescribir un hecho ya ocurrido): si se canceló por
-- error, se aplica un cargo nuevo, no se reactiva el viejo.
create or replace function public.marcar_cargo_cancelado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cancelado and not old.cancelado then
    if new.motivo_cancelacion is null or btrim(new.motivo_cancelacion) = '' then
      raise exception 'Escribe el motivo para cancelar este cargo.';
    end if;
    new.cancelado_at := now();
    new.cancelado_por := auth.uid();
  elsif not new.cancelado and old.cancelado then
    raise exception 'Un cargo cancelado no se puede reactivar. Aplica un cargo nuevo si corresponde.';
  end if;
  return new;
end;
$$;

create trigger marcar_cargo_cancelado
before update on public.cargos_aplicados
for each row execute function public.marcar_cargo_cancelado();

-- validar_cargo_aplicado() se extiende con dos cosas:
--   1. Bloquear cargos sobre una estancia cancelada/no-llegó — un
--      hospedaje que nunca ocurrió no debería acumular cobros.
--   2. Corrige un bug real (mismo tipo que ya mordió dos veces): usaba
--      current_date (hora del SERVIDOR, UTC) para resolver el precio en
--      vez de fecha_negocio() (hora de San Luis Potosí) — un cargo
--      aplicado ya entrada la noche podía resolverse contra la fecha
--      equivocada.
create or replace function public.validar_cargo_aplicado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_categoria text;
  v_depende_tamano boolean;
  v_perro_id uuid;
  v_estado_estancia text;
  v_precio numeric;
  v_estado_precio text;
  v_debe_resolver boolean;
begin
  select categoria, depende_tamano into v_categoria, v_depende_tamano
  from public.servicios where id = new.servicio_id;

  if v_categoria <> 'cargo' then
    raise exception 'Este servicio no es un cargo; no se puede usar en un cargo aplicado.';
  end if;

  select perro_id, estado into v_perro_id, v_estado_estancia
  from public.estancias where id = new.estancia_id;

  if v_estado_estancia in ('cancelada', 'no_llego') then
    raise exception 'No se pueden aplicar cargos a una estancia cancelada o que no llegó.';
  end if;

  v_debe_resolver := TG_OP = 'INSERT'
    or new.servicio_id is distinct from old.servicio_id
    or new.estancia_id is distinct from old.estancia_id
    or new.cantidad is distinct from old.cantidad;

  if v_debe_resolver then
    if v_depende_tamano then
      select tamano_id into new.tamano_id from public.perros where id = v_perro_id;
      if new.tamano_id is null then
        raise exception 'Este perro no tiene tamaño registrado. Complétalo en su expediente antes de aplicar el cargo.';
      end if;
    else
      new.tamano_id := null;
    end if;

    select precio, estado into v_precio, v_estado_precio
    from public.resolver_precio(new.servicio_id, new.tamano_id, null, new.cantidad, public.fecha_negocio());

    if v_estado_precio = 'sin_tarifa' then
      raise exception 'No hay tarifa capturada para este cargo. Captúrala antes de aplicarlo.';
    elsif v_estado_precio = 'no_aplica' then
      raise exception 'Este cargo no aplica para el tamaño de este perro.';
    end if;

    new.precio := v_precio;
  end if;

  return new;
end;
$$;
