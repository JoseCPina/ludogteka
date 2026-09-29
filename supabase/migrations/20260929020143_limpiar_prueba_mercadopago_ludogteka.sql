-- Limpieza de la prueba de cobro con Mercado Pago hecha en Ludogteka (producción).
--
-- Caso operativo puntual, NO un cambio de esquema ni una carga de datos de
-- negocio: la única SQL a mano que tolera CLAUDE.md en producción, documentada
-- aquí y pedida por escrito por el dueño de PeluDesk (José Carlos Piña) el 29
-- de septiembre de 2026. Va como migración para que quede versionada y la
-- aplique el script de despliegue (respaldo, conteos antes y después,
-- auditoria_frontera).
--
-- Qué pasó (28 de septiembre de 2026, 5:43–5:50 p.m. hora de San Luis Potosí,
-- con la cuenta de recepción de Ludogteka): un cliente de prueba «jose»
-- (teléfono del dueño) con un perro «me», una reserva con un «Baño exprés» de
-- $370 finalizado, un cobro con la terminal Point de $10 y otro con link de
-- pago de $10 (Mercado Pago en vivo, los dos pagados y registrados en el
-- turno de caja abierto a las 5:40 p.m.) y la «Comisión de Mercado Pago» de
-- $5.05 que se registró sola como gasto del link.
--
-- Mercado Pago ya reembolsó los dos cobros y regresó la comisión (lo hizo el
-- dueño allá): aquí NO se reembolsa nada, solo se deja la contabilidad de
-- Ludogteka como si la prueba no hubiera pasado:
--   1. devolución de cada cobro, en SU turno (el que sigue abierto), con el
--      método con el que se cobró: terminal y transferencia. Es lo que escribe
--      registrar_devolucion(), pero esa función pone de autorizador al
--      admin de la sesión: el único admin de Ludogteka es otra persona, que
--      no autorizó esto. Autoriza el dueño de PeluDesk, con su persona en
--      PeluDesk.
--   2. el gasto «Comisión de Mercado Pago» cancelado con el motivo pedido
--      (lo mismo que cancelar_gasto(); no tiene retiro de caja).
--   3. la cita pasa a cancelada: sale de la cuenta (saldo 0 con las dos
--      devoluciones), de la comisión de la estilista (comision_de_cita solo
--      cuenta finalizadas; además Karen no tiene expediente de empleado ni
--      pagos de nómina) y de los costos. Si hubiera descontado inventario se
--      regresa con un ajuste positivo (el «Baño exprés» no tiene receta: se
--      comprueba y no hay nada que regresar).
--   4. baja del cliente «jose» y del perro «me» (deleted_at, como la app).
-- Los contratos del expediente viejo «José Carlos Piña» no se tocan (los
-- firmados son evidencia). Los turnos abiertos no se cierran: los cierra
-- recepción con el conteo real. Las órdenes de Mercado Pago se quedan como
-- las dejó el proveedor (la app nunca cambia una orden pagada).
--
-- Candados: solo corre donde existe EXACTAMENTE esta prueba (en cualquier
-- otra base no hace nada); si ya se limpió, no hace nada; y si el estado no
-- es el esperado, aborta sin tocar nada.

do $$
declare
  c_negocio    constant uuid := '10000000-0000-4000-8000-000000000001';
  c_cliente    constant uuid := '4fb6ba68-e877-4d48-a7a2-64204cdc8729';
  c_perro      constant uuid := '306f84c2-9ea8-4649-b3d3-023a63a26c10';
  c_reserva    constant uuid := 'a1f811da-1a37-44cb-aacf-5093eebfed23';
  c_cita       constant uuid := '52b8d6f5-dde5-4819-91b2-9dbf538f2a6b';
  c_turno      constant uuid := '8933562c-df91-45cb-8d42-c2168b58d6a5';
  c_gasto      constant uuid := '56d41636-7e0c-4fc9-98ab-efa3abaffcda';
  c_cobros     constant uuid[] := array['937907ca-7958-47bb-89d4-c3cd51088ca3', 'e563b3b8-7ff5-486e-8020-51db290bfdd1']::uuid[];
  -- Quien autoriza: la persona de José Carlos Piña en PeluDesk.
  c_autoriza   constant uuid := 'a83de437-3645-40cc-b73b-1376db17f4a7';
  c_motivo_dev constant text := 'Cobro de prueba de Mercado Pago (28 sep 2026): Mercado Pago ya lo reembolsó. Registrado por PeluDesk a pedido de José Carlos Piña.';
  c_motivo_gasto constant text := 'cobro de prueba devuelto; Mercado Pago regresó la comisión';
  c_nota       constant text := 'Prueba de cobro con Mercado Pago del 28 sep 2026, revertida el 29 sep 2026 por PeluDesk a pedido de José Carlos Piña (migración 20260929020143).';
  v_cobro uuid;
  v_dev uuid;
  v_n int;
  v_saldo numeric;
  m record;
begin
  -- ¿Es la base donde pasó la prueba?
  if not exists (select 1 from public.clientes where id = c_cliente and negocio_id = c_negocio) then
    raise notice 'limpieza de la prueba de Mercado Pago: no aplica en esta base';
    return;
  end if;

  -- ¿Ya se limpió?
  if exists (select 1 from public.clientes where id = c_cliente and deleted_at is not null)
     and exists (select 1 from public.gastos where id = c_gasto and estado = 'cancelado')
     and (select count(*) from public.devoluciones where cobro_id = any(c_cobros) and deleted_at is null) = 2 then
    raise notice 'limpieza de la prueba de Mercado Pago: ya estaba hecha';
    return;
  end if;

  -- El negocio de la petición, para los defaults y los triggers de módulo.
  perform set_config('app.negocio_id', c_negocio::text, true);

  -- ───── estado esperado (si algo no cuadra, se aborta sin tocar nada)
  if not exists (select 1 from public.clientes where id = c_cliente and deleted_at is null and telefono = '4441301539') then
    raise exception 'limpieza: el cliente de prueba no está como se esperaba';
  end if;
  if not exists (select 1 from public.perros where id = c_perro and cliente_id = c_cliente and deleted_at is null) then
    raise exception 'limpieza: el perro de prueba no está como se esperaba';
  end if;
  if not exists (select 1 from public.reservas where id = c_reserva and cliente_id = c_cliente and negocio_id = c_negocio and deleted_at is null) then
    raise exception 'limpieza: la reserva de prueba no está como se esperaba';
  end if;
  select count(*) into v_n from public.citas_estetica where reserva_id = c_reserva and deleted_at is null;
  if v_n <> 1 or not exists (select 1 from public.citas_estetica where id = c_cita and reserva_id = c_reserva and perro_id = c_perro and estado = 'finalizada') then
    raise exception 'limpieza: la reserva de prueba no tiene solo la cita finalizada esperada';
  end if;
  if exists (select 1 from public.estancias where reserva_id = c_reserva and deleted_at is null)
     or exists (select 1 from public.cargos_aplicados where reserva_id = c_reserva and deleted_at is null) then
    raise exception 'limpieza: la reserva de prueba tiene estancias o cargos que no se esperaban';
  end if;
  select count(*) into v_n from public.cobros where reserva_id = c_reserva;
  if v_n <> 2 or (select count(*) from public.cobros where id = any(c_cobros) and reserva_id = c_reserva and turno_id = c_turno) <> 2 then
    raise exception 'limpieza: los cobros de la prueba no son los esperados';
  end if;
  if (select coalesce(sum(monto), 0) from public.cobro_metodos where cobro_id = any(c_cobros)) <> 20
     or exists (select 1 from public.cobro_metodos where cobro_id = any(c_cobros) and (coalesce(propina, 0) <> 0 or metodo not in ('terminal', 'transferencia'))) then
    raise exception 'limpieza: los métodos de los cobros de prueba no son los esperados';
  end if;
  if exists (select 1 from public.devoluciones where cobro_id = any(c_cobros) and deleted_at is null) then
    raise exception 'limpieza: los cobros de prueba ya tienen devoluciones (a medias): revisar a mano';
  end if;
  if not exists (select 1 from public.turnos_caja where id = c_turno and estado = 'abierto') then
    raise exception 'limpieza: el turno de los cobros de prueba ya no está abierto: revisar dónde va la devolución';
  end if;
  if not exists (select 1 from public.gastos
                 where id = c_gasto and negocio_id = c_negocio and estado = 'pagado' and tipo = 'gasto'
                   and monto = 5.05 and movimiento_caja_id is null
                   and mp_orden_id = '285f7a11-1b47-492d-be00-bcbcb49c6010') then
    raise exception 'limpieza: el gasto de comisión no está como se esperaba';
  end if;
  if not exists (select 1 from auth.users where id = c_autoriza) then
    raise exception 'limpieza: no existe la persona que autoriza';
  end if;
  -- Nómina: si la estilista tuviera un pago que ya incluyó esa fecha, la
  -- comisión quedó congelada ahí y hay que revertir ese pago a mano.
  if exists (select 1 from public.nomina_pagos np
             join public.empleados e on e.id = np.empleado_id
             join public.citas_estetica c on c.id = c_cita and e.profile_id = c.empleado_id
             where np.deleted_at is null and date '2026-09-28' between np.periodo_desde and np.periodo_hasta) then
    raise exception 'limpieza: ya hay un pago de nómina que cubre la cita de prueba: revertirlo primero';
  end if;

  -- ───── 1. devoluciones, en el turno de cada cobro y con su método
  foreach v_cobro in array c_cobros loop
    insert into public.devoluciones (cobro_id, turno_id, motivo, autorizado_por, created_by, negocio_id)
    values (v_cobro, c_turno, c_motivo_dev, c_autoriza, c_autoriza, c_negocio)
    returning id into v_dev;
    insert into public.devolucion_metodos (devolucion_id, metodo, monto, created_by, negocio_id)
    select v_dev, cm.metodo, cm.monto, c_autoriza, c_negocio
    from public.cobro_metodos cm where cm.cobro_id = v_cobro;
  end loop;

  -- ───── 2. gasto de comisión cancelado (y sus ajustes vivos, como cancelar_gasto)
  update public.gastos
  set estado = 'cancelado', motivo_cancelacion = c_motivo_gasto, cancelado_por = c_autoriza, cancelado_at = now()
  where id = c_gasto or (ajuste_de = c_gasto and estado <> 'cancelado');

  -- ───── 3. inventario que hubiera descontado la cita: de regreso
  for m in select insumo_id, cantidad_base from public.movimientos_inventario
           where cita_estetica_id = c_cita and tipo = 'salida_consumo' and deleted_at is null loop
    insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, motivo, created_by, negocio_id)
    values (m.insumo_id, 'ajuste_positivo', m.cantidad_base, 'Regreso del consumo de la cita de prueba de Mercado Pago (28 sep 2026)', c_autoriza, c_negocio);
  end loop;

  --        la cita, cancelada (sale de la cuenta, de la comisión y de los costos)
  update public.citas_estetica
  set estado = 'cancelada', notas = concat_ws(E'\n', nullif(notas, ''), c_nota)
  where id = c_cita;
  update public.reservas set notas = concat_ws(E'\n', nullif(notas, ''), c_nota) where id = c_reserva;

  -- ───── 4. baja del cliente y de su perro
  update public.perros set deleted_at = now() where id = c_perro;
  update public.clientes set deleted_at = now() where id = c_cliente;

  -- ───── comprobación: como si la prueba no hubiera pasado
  select t.saldo into v_saldo from public.cuenta_totales_reserva(c_reserva) t;
  if coalesce(v_saldo, 0) <> 0 then
    raise exception 'limpieza: la cuenta de la prueba quedó con saldo % (se esperaba 0)', v_saldo;
  end if;
  if public.comision_de_cita(c_cita) <> 0 then
    raise exception 'limpieza: la cita de prueba sigue generando comisión';
  end if;
  if exists (select 1 from public.cuentas_abiertas(120) ca where ca.reserva_id = c_reserva) then
    raise exception 'limpieza: la cuenta de la prueba sigue en cuentas abiertas';
  end if;
  raise notice 'limpieza de la prueba de Mercado Pago: hecha';
end;
$$;
