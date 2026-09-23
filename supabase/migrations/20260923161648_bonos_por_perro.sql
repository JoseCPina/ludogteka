-- Los day pass y la mensualidad son POR PERRO, no por cliente.
--
-- Cómo estaba (Fase 17): el paquete era del dueño (bonos_clientes.
-- cliente_id) y cualquiera de sus perros lo consumía. Fue una definición
-- equivocada: el negocio cobra cada perro por separado, y un dueño con
-- dos perros que quiere pases para ambos compra dos paquetes.
--
-- Cómo queda: el bono se vende para UN perro (bonos_clientes.perro_id) y
-- solo ese perro lo consume. cliente_id se queda (es el dueño que pagó, y
-- la cuenta "Compra de bono" y los reportes lo usan), pero ya no decide
-- quién consume.
--
-- En producción no había ningún bono vendido al escribir esto
-- (bonos_clientes = 0, movimientos_bono = 0, verificado contra la base):
-- no hay nada que repartir. En desarrollo sí hay bonos de prueba; se les
-- asigna el perro de su primer consumo o, si nunca se usaron, el primer
-- perro vivo del dueño.

-- ── 1. El perro del bono ─────────────────────────────────────────────
alter table public.bonos_clientes
  add column if not exists perro_id uuid references public.perros(id);

create index if not exists bonos_clientes_perro_id_idx on public.bonos_clientes (perro_id);

comment on column public.bonos_clientes.perro_id is
  'El perro para el que se vendió el paquete. Solo ese perro lo consume. cliente_id es el dueño que lo pagó.';

update public.bonos_clientes bc
set perro_id = coalesce(
  (
    select coalesce(e.perro_id, ce.perro_id, ec.perro_id)
    from public.movimientos_bono mb
    left join public.estancias e on mb.item_tipo = 'estancia' and e.id = mb.item_id
    left join public.citas_estetica ce on mb.item_tipo = 'estetica' and ce.id = mb.item_id
    left join public.cargos_aplicados ca on mb.item_tipo = 'cargo' and ca.id = mb.item_id
    left join public.estancias ec on ec.id = ca.estancia_id
    where mb.bono_cliente_id = bc.id and mb.tipo = 'consumo'
    order by mb.created_at
    limit 1
  ),
  (
    select p.id from public.perros p
    where p.cliente_id = bc.cliente_id and p.deleted_at is null
    order by coalesce(p.fallecido, false), p.created_at
    limit 1
  )
)
where bc.perro_id is null;

-- Obligatorio de aquí en adelante. Si quedara algún bono viejo sin perro
-- posible (dueño sin perros), la regla se exige solo para lo nuevo en vez
-- de inventarle un perro.
do $$
begin
  if exists (select 1 from public.bonos_clientes where perro_id is null) then
    alter table public.bonos_clientes
      add constraint bonos_clientes_perro_obligatorio check (perro_id is not null) not valid;
  else
    alter table public.bonos_clientes alter column perro_id set not null;
  end if;
end;
$$;

-- ── 2. Vender: se escoge el perro ────────────────────────────────────
-- Misma firma de tipos que la anterior (uuid, uuid, text, jsonb) pero el
-- primer parámetro cambia de significado: se borra y se crea, no se
-- reemplaza, para que nadie llame por error la versión "por cliente".
drop function if exists public.comprar_bono(uuid, uuid, text, jsonb);

create function public.comprar_bono(
  p_perro_id uuid,
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
  v_perro record;
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

  select p.id, p.nombre, p.cliente_id, coalesce(p.fallecido, false) as fallecido
    into v_perro
  from public.perros p
  join public.clientes c on c.id = p.cliente_id and c.deleted_at is null
  where p.id = p_perro_id and p.deleted_at is null;
  if not found then
    raise exception 'Elige el perro para el que es el paquete.';
  end if;
  if v_perro.fallecido then
    raise exception 'Este perro está marcado como fallecido: no se le puede vender un paquete.';
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
  values (v_perro.cliente_id, 'Compra de bono: ' || v_servicio.nombre || ' para ' || v_perro.nombre)
  returning id into v_reserva_id;

  v_fecha_vencimiento := case
    when v_servicio.vigencia_dias is not null then v_fecha_compra + v_servicio.vigencia_dias
    else null
  end;

  if v_servicio.ilimitado then
    -- Días que abre guardería en la vigencia (horario_semana): el máximo
    -- de veces que físicamente se puede consumir.
    v_cantidad := greatest(1, public.dias_que_abre_guarderia(v_fecha_compra, v_fecha_vencimiento));
  else
    v_cantidad := v_servicio.cantidad_incluida;
  end if;

  insert into public.bonos_clientes (
    cliente_id, perro_id, servicio_id, reserva_id, cantidad_total, cantidad_disponible,
    precio_pagado, fecha_compra, fecha_vencimiento, ilimitado
  )
  values (
    v_perro.cliente_id, v_perro.id, p_servicio_id, v_reserva_id, v_cantidad, v_cantidad,
    v_precio, v_fecha_compra, v_fecha_vencimiento, v_servicio.ilimitado
  )
  returning id into v_bono_id;

  insert into public.movimientos_bono (bono_cliente_id, tipo, cantidad, monto, turno_id, created_by)
  values (v_bono_id, 'venta', v_cantidad, v_precio, v_turno_id, auth.uid());

  perform public.registrar_cobro(v_reserva_id, p_notas, p_metodos);

  return v_bono_id;
end;
$$;

revoke execute on function public.comprar_bono(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.comprar_bono(uuid, uuid, text, jsonb) to authenticated;

-- ── 3. Consumir: solo el perro del bono ──────────────────────────────
-- Cuerpo de 20260923000000; además del cliente, la línea tiene que ser
-- del perro del bono.
create or replace function public.consumir_bono(
  p_bono_cliente_id uuid,
  p_item_tipo text,
  p_item_id uuid,
  p_cantidad int
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bono record;
  v_item_servicio_id uuid;
  v_item_cliente_id uuid;
  v_item_perro_id uuid;
  v_item_estado text;
  v_item_cantidad int;
  v_ya_cubierta int;
  v_monto numeric;
  v_turno_id uuid;
  v_movimiento_id uuid;
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden aplicar un bono.';
  end if;

  if p_item_tipo is null or p_item_tipo not in ('estancia', 'cargo', 'estetica') then
    raise exception 'Tipo de línea inválido: %', p_item_tipo;
  end if;
  if p_cantidad is null or p_cantidad < 1 then
    raise exception 'La cantidad a cubrir con el bono debe ser al menos 1.';
  end if;

  select bc.id, bc.cliente_id, bc.perro_id, bc.cantidad_disponible, bc.cantidad_total, bc.precio_pagado,
    bc.fecha_vencimiento, s.servicio_incluido_id
  into v_bono
  from public.bonos_clientes bc
  join public.servicios s on s.id = bc.servicio_id
  where bc.id = p_bono_cliente_id and bc.deleted_at is null;

  if not found then
    raise exception 'Bono no encontrado.';
  end if;

  if v_bono.fecha_vencimiento is not null and v_bono.fecha_vencimiento < public.fecha_negocio() then
    raise exception 'Este bono ya venció.';
  end if;

  if v_bono.cantidad_disponible < p_cantidad then
    raise exception 'El bono no tiene suficientes unidades disponibles (quedan %).', v_bono.cantidad_disponible;
  end if;

  if p_item_tipo = 'estancia' then
    select e.servicio_id, p.cliente_id, e.estado, (e.fecha_salida - e.fecha_entrada), e.perro_id
      into v_item_servicio_id, v_item_cliente_id, v_item_estado, v_item_cantidad, v_item_perro_id
    from public.estancias e join public.perros p on p.id = e.perro_id
    where e.id = p_item_id;
  elsif p_item_tipo = 'cargo' then
    select c.servicio_id, p.cliente_id,
      case when c.cancelado then 'cancelada' else 'activa' end,
      c.cantidad, e.perro_id
      into v_item_servicio_id, v_item_cliente_id, v_item_estado, v_item_cantidad, v_item_perro_id
    from public.cargos_aplicados c
    join public.estancias e on e.id = c.estancia_id
    join public.perros p on p.id = e.perro_id
    where c.id = p_item_id;
  else
    select ce.servicio_id, p.cliente_id, ce.estado, 1, ce.perro_id
      into v_item_servicio_id, v_item_cliente_id, v_item_estado, v_item_cantidad, v_item_perro_id
    from public.citas_estetica ce join public.perros p on p.id = ce.perro_id
    where ce.id = p_item_id;
  end if;

  if v_item_servicio_id is null then
    raise exception 'No se encontró esa línea.';
  end if;

  if v_item_estado in ('cancelada', 'no_llego') then
    raise exception 'Esa línea está cancelada; no se le puede aplicar un bono.';
  end if;

  if v_item_cliente_id is distinct from v_bono.cliente_id then
    raise exception 'Este bono no pertenece al cliente de esa línea.';
  end if;

  -- Por perro, no por dueño: un pase de un perro no cubre al otro
  -- aunque sean del mismo cliente.
  if v_item_perro_id is distinct from v_bono.perro_id then
    raise exception 'Este paquete es de otro perro; cada perro usa el suyo.';
  end if;

  if v_item_servicio_id is distinct from v_bono.servicio_incluido_id then
    raise exception 'Este bono no aplica al servicio de esa línea.';
  end if;

  v_ya_cubierta := public.cobertura_bono_de_item(p_item_tipo, p_item_id);

  if v_ya_cubierta + p_cantidad > v_item_cantidad then
    raise exception 'Esa línea ya tiene % de % unidades cubiertas con bono; no se puede cubrir más de lo que vale.',
      v_ya_cubierta, v_item_cantidad;
  end if;

  update public.bonos_clientes
  set cantidad_disponible = cantidad_disponible - p_cantidad
  where id = p_bono_cliente_id;

  v_monto := round((v_bono.precio_pagado / v_bono.cantidad_total) * p_cantidad, 2);

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;

  insert into public.movimientos_bono (bono_cliente_id, tipo, cantidad, monto, item_tipo, item_id, turno_id, created_by)
  values (p_bono_cliente_id, 'consumo', p_cantidad, v_monto, p_item_tipo, p_item_id, v_turno_id, auth.uid())
  returning id into v_movimiento_id;

  return v_movimiento_id;
end;
$$;

-- ── 4. Aplicar al reservar (y en series): el pase de ESE perro ───────
-- Cuerpo de 20260923000000; busca por el perro de la estancia, no por
-- el cliente.
create or replace function public.aplicar_bono_a_estancia(p_estancia_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estancia record;
  v_cliente_id uuid;
  v_unidad text;
  v_categoria text;
  v_dias int;
  v_cubierta int;
  v_faltante int;
  v_bono record;
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden aplicar un bono.';
  end if;

  select e.id, e.perro_id, e.servicio_id, e.estado, e.fecha_entrada, e.fecha_salida
    into v_estancia
  from public.estancias e
  where e.id = p_estancia_id and e.deleted_at is null;

  if not found then
    raise exception 'Estancia no encontrada.';
  end if;
  if v_estancia.estado in ('cancelada', 'no_llego') then
    return jsonb_build_object('aplicado', false, 'motivo', 'estancia_inactiva');
  end if;

  select s.unidad, s.categoria into v_unidad, v_categoria
  from public.servicios s where s.id = v_estancia.servicio_id;

  if v_categoria <> 'guarderia' or v_unidad <> 'dia' then
    return jsonb_build_object('aplicado', false, 'motivo', 'no_aplica');
  end if;

  select p.cliente_id into v_cliente_id from public.perros p where p.id = v_estancia.perro_id;

  v_dias := v_estancia.fecha_salida - v_estancia.fecha_entrada;
  v_cubierta := public.cobertura_bono_de_item('estancia', p_estancia_id);
  v_faltante := v_dias - v_cubierta;
  if v_faltante <= 0 then
    return jsonb_build_object('aplicado', false, 'motivo', 'ya_cubierta');
  end if;

  select bc.id, bc.cantidad_total, bc.cantidad_disponible, bc.fecha_vencimiento, bc.ilimitado, s.nombre
    into v_bono
  from public.bonos_clientes bc
  join public.servicios s on s.id = bc.servicio_id
  where bc.perro_id = v_estancia.perro_id
    and bc.deleted_at is null
    and s.servicio_incluido_id = v_estancia.servicio_id
    and (bc.fecha_vencimiento is null or bc.fecha_vencimiento >= greatest(v_estancia.fecha_entrada, public.fecha_negocio()))
    and bc.cantidad_disponible >= v_faltante
  order by bc.fecha_vencimiento asc nulls last, bc.fecha_compra asc
  limit 1;

  if not found then
    return jsonb_build_object('aplicado', false, 'motivo', 'sin_bono');
  end if;

  perform public.consumir_bono(v_bono.id, 'estancia', p_estancia_id, v_faltante);

  return jsonb_build_object(
    'aplicado', true,
    'bono_id', v_bono.id,
    'nombre', v_bono.nombre,
    'ilimitado', v_bono.ilimitado,
    'usados', v_faltante,
    'total', v_bono.cantidad_total,
    'restantes', v_bono.cantidad_disponible - v_faltante,
    'vence', v_bono.fecha_vencimiento
  );
end;
$$;

-- ── 5. La vista de saldo dice de qué perro es ────────────────────────
-- Columnas nuevas al final (create or replace view no deja reordenar).
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
  bc.ilimitado,
  c.nombre as cliente_nombre,
  bc.perro_id,
  p.nombre as perro_nombre
from public.bonos_clientes bc
join public.servicios s on s.id = bc.servicio_id
left join public.servicios si on si.id = s.servicio_incluido_id
join public.clientes c on c.id = bc.cliente_id
left join public.perros p on p.id = bc.perro_id;

-- ── 6. El contrato de guardería: solo para el perro del paquete ──────
create or replace function public.generar_contratos_de_paquete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria_incluida text;
  v_paquete text;
  v_tipo record;
begin
  select si.categoria, s.nombre into v_categoria_incluida, v_paquete
  from public.servicios s
  left join public.servicios si on si.id = s.servicio_incluido_id
  where s.id = new.servicio_id;

  if v_categoria_incluida is distinct from 'guarderia' or new.perro_id is null then
    return new;
  end if;

  for v_tipo in
    select t.id, pl.id as plantilla_id
    from public.tipos_contrato t
    join public.plantillas_contrato pl on pl.tipo_contrato_id = t.id and pl.activa
    where t.deleted_at is null and t.se_genera_al = 'compra_paquete'
  loop
    -- El pendiente de una compra anterior de ESTE perro ya no aplica: el
    -- nuevo trae el paquete y la vigencia de esta compra.
    update public.contratos c
    set estado = 'cancelado',
        motivo_cancelacion = format('Reemplazado por el contrato de la compra de %s del %s.',
          v_paquete, to_char(new.fecha_compra, 'DD/MM/YYYY'))
    from public.plantillas_contrato pl
    where pl.id = c.plantilla_id
      and pl.tipo_contrato_id = v_tipo.id
      and c.perro_id = new.perro_id
      and c.estado = 'pendiente_firma';

    insert into public.contratos (perro_id, cliente_id, plantilla_id, bono_cliente_id, created_by)
    values (new.perro_id, new.cliente_id, v_tipo.plantilla_id, new.id, auth.uid());
  end loop;

  return new;
end;
$$;

-- El paquete vigente de un PERRO (antes: de un cliente). Con él se liga
-- un contrato de guardería que se genera a mano o se regenera.
drop function if exists public.paquete_guarderia_vigente(uuid);

create function public.paquete_guarderia_vigente_de_perro(p_perro_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select bc.id
  from public.bonos_clientes bc
  join public.servicios s on s.id = bc.servicio_id
  join public.servicios si on si.id = s.servicio_incluido_id
  where bc.perro_id = p_perro_id
    and bc.deleted_at is null
    and si.categoria = 'guarderia'
    and (bc.fecha_vencimiento is null or bc.fecha_vencimiento >= public.fecha_negocio())
  order by bc.fecha_compra desc, bc.created_at desc
  limit 1;
$$;

revoke execute on function public.paquete_guarderia_vigente_de_perro(uuid) from public, anon;
grant execute on function public.paquete_guarderia_vigente_de_perro(uuid) to authenticated;

-- generar_contrato: cuerpo de 20260923155157, con el paquete del perro.
create or replace function public.generar_contrato(p_perro_id uuid, p_tipo_contrato_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente_id uuid;
  v_plantilla_id uuid;
  v_tipo_nombre text;
  v_se_genera_al text;
  v_id uuid;
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden generar un contrato.';
  end if;

  select cliente_id into v_cliente_id from public.perros where id = p_perro_id and deleted_at is null;
  if v_cliente_id is null then
    raise exception 'Perro no encontrado.';
  end if;

  select nombre, se_genera_al into v_tipo_nombre, v_se_genera_al from public.tipos_contrato
  where id = p_tipo_contrato_id and deleted_at is null;
  if v_tipo_nombre is null then
    raise exception 'Tipo de contrato no encontrado o archivado.';
  end if;

  select id into v_plantilla_id from public.plantillas_contrato
  where tipo_contrato_id = p_tipo_contrato_id and activa = true;
  if v_plantilla_id is null then
    raise exception 'No hay una versión publicada de "%" todavía.', v_tipo_nombre;
  end if;

  if exists (
    select 1
    from public.contratos c
    join public.plantillas_contrato pl on pl.id = c.plantilla_id
    where c.perro_id = p_perro_id
      and c.estado = 'pendiente_firma'
      and pl.tipo_contrato_id = p_tipo_contrato_id
  ) then
    raise exception 'Ya hay un "%" pendiente de firma para este perro. Cancélalo antes de generar otro.', v_tipo_nombre;
  end if;

  insert into public.contratos (perro_id, cliente_id, plantilla_id, bono_cliente_id, created_by)
  values (
    p_perro_id, v_cliente_id, v_plantilla_id,
    case when v_se_genera_al = 'compra_paquete' then public.paquete_guarderia_vigente_de_perro(p_perro_id) end,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;
