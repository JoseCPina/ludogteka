-- Fase 17, parte 2: bonos de consumo ilimitado (la mensualidad).
--
-- "Mensualidad $1,950: días ilimitados de lunes a viernes durante el
-- mes." Es un bono más del mecanismo de Fase 5 — se vende igual, se
-- consume igual (cada día que asiste es un consumo, para que Fase 8
-- reconozca el ingreso ese día) — con una sola diferencia: no tiene tope
-- de días.
--
-- Cómo se modela sin romper la contabilidad del bono: cantidad_total NO
-- es un tope inventado, es el máximo físico — un perro no puede asistir
-- más de una vez por día, y solo hay servicio de lunes a viernes, así
-- que cantidad_total = días hábiles de la vigencia. Con eso la fórmula de
-- reconocimiento de Fase 5 (precio_pagado / cantidad_total por consumo)
-- sigue siendo exacta: cada día asistido reconoce la parte proporcional
-- del mes. Lo que no se asista se queda como ingreso diferido que vence
-- con el bono, igual que un pase no usado.

alter table public.servicios
  add column if not exists ilimitado boolean not null default false;

comment on column public.servicios.ilimitado is
  'Solo bonos: consumo sin tope dentro de su vigencia. Exige vigencia_dias y deja cantidad_incluida en null.';

-- La restricción original no tiene nombre propio (Postgres le puso el
-- suyo), así que se busca por lo que dice y no por cómo se llama.
do $$
declare
  v_nombre text;
begin
  for v_nombre in
    select conname
    from pg_constraint
    where conrelid = 'public.servicios'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%cantidad_incluida%'
  loop
    execute format('alter table public.servicios drop constraint %I', v_nombre);
  end loop;
end;
$$;

alter table public.servicios
  add constraint servicios_bono_coherente check (
    (
      categoria = 'bono'
      and servicio_incluido_id is not null
      and (
        (not ilimitado and cantidad_incluida is not null)
        or (ilimitado and cantidad_incluida is null and vigencia_dias is not null)
      )
    )
    or (
      categoria <> 'bono'
      and servicio_incluido_id is null
      and cantidad_incluida is null
      and vigencia_dias is null
      and not ilimitado
    )
  );

alter table public.bonos_clientes
  add column if not exists ilimitado boolean not null default false;

comment on column public.bonos_clientes.ilimitado is
  'Copia de servicios.ilimitado al momento de la compra. cantidad_total es entonces el número de días hábiles de la vigencia, no un tope comercial.';

-- comprar_bono: cuerpo de 20260729050213_add_bonos_funciones.sql, con la
-- rama del ilimitado. Todo lo demás es idéntico.
create or replace function public.comprar_bono(
  p_cliente_id uuid,
  p_servicio_id uuid,
  p_notas text,
  p_metodos jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_servicio public.servicios%rowtype;
  v_precio numeric;
  v_estado_precio text;
  v_turno_id uuid;
  v_reserva_id uuid;
  v_bono_id uuid;
  v_fecha_compra date;
  v_fecha_vencimiento date;
  v_cantidad int;
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden vender un bono.';
  end if;

  select * into v_servicio from public.servicios
  where id = p_servicio_id and categoria = 'bono' and deleted_at is null;
  if not found then
    raise exception 'Bono no encontrado en el catálogo.';
  end if;

  if not exists (select 1 from public.clientes where id = p_cliente_id and deleted_at is null) then
    raise exception 'Cliente no encontrado.';
  end if;

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto. Ábrelo antes de vender un bono.';
  end if;

  v_fecha_compra := public.fecha_negocio();

  select precio, estado into v_precio, v_estado_precio
  from public.resolver_precio(p_servicio_id, null, null, 1, v_fecha_compra);

  if v_estado_precio = 'sin_tarifa' then
    raise exception 'No hay tarifa capturada para este bono. Captúrala antes de venderlo.';
  elsif v_estado_precio = 'no_aplica' then
    raise exception 'Este bono no aplica.';
  end if;

  insert into public.reservas (cliente_id, notas)
  values (p_cliente_id, 'Compra de bono: ' || v_servicio.nombre)
  returning id into v_reserva_id;

  v_fecha_vencimiento := case
    when v_servicio.vigencia_dias is not null then v_fecha_compra + v_servicio.vigencia_dias
    else null
  end;

  if v_servicio.ilimitado then
    -- Días hábiles (lunes a viernes) entre la compra y el vencimiento:
    -- el máximo de veces que físicamente se puede consumir.
    select greatest(1, count(*))::int into v_cantidad
    from generate_series(v_fecha_compra, v_fecha_vencimiento - 1, interval '1 day') d
    where extract(dow from d) between 1 and 5;
  else
    v_cantidad := v_servicio.cantidad_incluida;
  end if;

  insert into public.bonos_clientes (
    cliente_id, servicio_id, reserva_id, cantidad_total, cantidad_disponible,
    precio_pagado, fecha_compra, fecha_vencimiento, ilimitado
  )
  values (
    p_cliente_id, p_servicio_id, v_reserva_id, v_cantidad, v_cantidad,
    v_precio, v_fecha_compra, v_fecha_vencimiento, v_servicio.ilimitado
  )
  returning id into v_bono_id;

  insert into public.movimientos_bono (bono_cliente_id, tipo, cantidad, monto, turno_id, created_by)
  values (v_bono_id, 'venta', v_cantidad, v_precio, v_turno_id, auth.uid());

  perform public.registrar_cobro(v_reserva_id, p_notas, p_metodos);

  return v_bono_id;
end;
$$;

-- La vista gana la bandera al final, para que la pantalla diga
-- "ilimitado" en vez de "22/22 disponibles".
create or replace view public.bonos_clientes_estado
with (security_invoker = true)
as
select
  bc.id,
  bc.cliente_id,
  bc.servicio_id,
  s.nombre as servicio_nombre,
  s.servicio_incluido_id,
  si.nombre as servicio_incluido_nombre,
  bc.cantidad_total,
  bc.cantidad_disponible,
  bc.precio_pagado,
  bc.fecha_compra,
  bc.fecha_vencimiento,
  case
    when bc.deleted_at is not null then 'cancelado'
    when bc.cantidad_disponible = 0 then 'agotado'
    when bc.fecha_vencimiento is not null and bc.fecha_vencimiento < public.fecha_negocio() then 'vencido'
    else 'activo'
  end as estado,
  bc.ilimitado
from public.bonos_clientes bc
join public.servicios s on s.id = bc.servicio_id
left join public.servicios si on si.id = s.servicio_incluido_id;
