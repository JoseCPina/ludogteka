-- Dos ajustes de precio dictados por el negocio (22 de septiembre de 2026).

-- ── 1. Guardería día completo: $350 ──────────────────────────────────
-- Era la única celda sin tarifa de la Fase 17 (el cartel no traía precio
-- de día suelto). Con esto los pases y la mensualidad ya se pueden
-- consumir: cada día cubierto por un pase se muestra valuado a $350 de
-- lista, y lo que descuenta del saldo es ese valor (Fase 5).
insert into public.tarifas
  (servicio_id, grupo_raza_id, tamano_id, pelaje_id, cantidad_desde, cantidad_hasta, vigencia_desde, precio, no_aplica, updated_at)
select s.id, null, null, null, 1, null, current_date, 350.00, false, now()
from public.servicios s
where s.clave = 'guarderia_dia'
  and s.deleted_at is null
  and not exists (
    select 1 from public.tarifas_vigentes tv
    where tv.servicio_id = s.id and tv.tamano_id is null and tv.grupo_raza_id is null and not tv.no_aplica
  );

-- ── 2. Comida especial: cargo de monto libre ─────────────────────────
-- Sí existe, pero no tiene precio fijo: se cobra caso por caso según lo
-- que coma cada perro. Un cargo de monto libre no tiene celda en la
-- matriz; el importe y qué se le dio los captura recepción al aplicarlo.
-- Queda registrado quién (created_by) y por cuánto (precio), se cancela
-- con motivo (marcar_cargo_cancelado) y nunca se borra (no hay política
-- de DELETE en cargos_aplicados) — igual que cualquier cargo.
alter table public.servicios
  add column if not exists monto_libre boolean not null default false;

alter table public.servicios
  drop constraint if exists servicios_monto_libre_solo_cargos;
alter table public.servicios
  add constraint servicios_monto_libre_solo_cargos
  check (not monto_libre or categoria = 'cargo');

comment on column public.servicios.monto_libre is
  'Solo cargos: sin tarifa en la matriz; el importe y la descripción se capturan al aplicarlo.';

update public.servicios
set monto_libre = true
where clave = 'cargo_comida_especial';

alter table public.cargos_aplicados
  add column if not exists descripcion text;

comment on column public.cargos_aplicados.descripcion is
  'Qué se le dio o por qué se cobra. Obligatoria en cargos de monto libre.';

-- El trigger: cuerpo de 20260729023404_add_cargos_cancelacion_y_bloqueo_estado.sql
-- más la rama de monto libre. Para un cargo de monto libre el precio
-- VIENE en la fila (lo capturó recepción) y no se resuelve; se exige
-- importe positivo y descripción, y una vez aplicado el importe no se
-- cambia: se cancela con motivo y se aplica otro.
create or replace function public.validar_cargo_aplicado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_categoria text;
  v_depende_tamano boolean;
  v_monto_libre boolean;
  v_perro_id uuid;
  v_estado_estancia text;
  v_precio numeric;
  v_estado_precio text;
  v_debe_resolver boolean;
begin
  select categoria, depende_tamano, monto_libre
    into v_categoria, v_depende_tamano, v_monto_libre
  from public.servicios where id = new.servicio_id;

  if v_categoria is null or v_categoria <> 'cargo' then
    raise exception 'Este servicio no es un cargo; no se puede usar en un cargo aplicado.';
  end if;

  select perro_id, estado into v_perro_id, v_estado_estancia
  from public.estancias where id = new.estancia_id;

  if v_estado_estancia in ('cancelada', 'no_llego') then
    raise exception 'No se pueden aplicar cargos a una estancia cancelada o que no llegó.';
  end if;

  if v_monto_libre then
    if new.precio is null or new.precio <= 0 then
      raise exception 'Captura el importe de este cargo: se cobra según lo que se le dio.';
    end if;
    if new.descripcion is null or btrim(new.descripcion) = '' then
      raise exception 'Describe qué se le dio para poder aplicar este cargo.';
    end if;
    if TG_OP = 'UPDATE' and new.precio is distinct from old.precio then
      raise exception 'El importe de un cargo aplicado no se cambia. Cancélalo con motivo y aplica otro.';
    end if;
    new.tamano_id := null;
    return new;
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

-- Un cargo de monto libre se puede cobrar siempre: entra a la vista de
-- lo cotizable sin necesitar tarifa. Así el check-out lo ofrece y la
-- validación de "celdas sin tarifa" no lo reporta como hueco.
create or replace view public.servicios_cotizables
with (security_invoker = true)
as
select s.id, s.clave, s.nombre, s.categoria, s.orden, s.duracion_minutos, s.monto_libre
from public.servicios s
where s.deleted_at is null
  and (
    s.monto_libre
    or exists (
      select 1
      from public.tarifas_vigentes tv
      where tv.servicio_id = s.id
        and not tv.no_aplica
    )
  );

-- ── Comprobación: ya sin excepciones ─────────────────────────────────
-- Todo servicio vivo de guardería, hotel, bono y cargo tiene que ser
-- cotizable. La excepción de guarderia_dia de la migración anterior ya
-- no existe (tiene precio) y el de monto libre entra por la vista.
do $$
declare
  v_faltan text;
begin
  select string_agg(s.clave, ', ' order by s.categoria, s.orden) into v_faltan
  from public.servicios s
  where s.categoria in ('guarderia', 'hotel', 'bono', 'cargo')
    and s.deleted_at is null
    and not exists (select 1 from public.servicios_cotizables c where c.id = s.id);

  if v_faltan is not null then
    raise exception 'Servicios vivos sin ningún precio con el que cobrar: %', v_faltan;
  end if;
end;
$$;
