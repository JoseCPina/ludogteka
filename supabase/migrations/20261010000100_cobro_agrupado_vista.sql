-- La vista de órdenes trae también las cuentas del grupo, para que cada una de
-- ellas vea la orden de cobro junto en su pantalla. Solo agrega columnas al
-- final (conserva sus opciones de seguridad).
create or replace view public.mp_ordenes_estado as
 SELECT o.id,
    o.tipo,
    o.reserva_id,
    r.cliente_id,
    cl.nombre AS cliente_nombre,
    cl.telefono AS cliente_telefono,
    o.monto,
    o.descripcion,
    o.estado,
    o.mp_order_id,
    o.mp_payment_id,
    o.url_pago,
    o.installments,
    o.mp_payment_type,
    o.metodo_registrado,
    o.cobro_id,
    o.simulado,
    o.expira_at,
    o.pagada_at,
    o.detalle_error,
    o.created_at,
    ((o.estado = 'pagada'::text) AND (o.cobro_id IS NULL)) AS pendiente_de_registrar,
    o.monto_reembolsado,
    o.reembolsada_at,
    o.proveedor,
    o.grupo_cuentas,
    o.grupo_id
   FROM ((mp_ordenes o
     JOIN reservas r ON ((r.id = o.reserva_id)))
     JOIN clientes cl ON ((cl.id = r.cliente_id)))
  WHERE (o.deleted_at IS NULL);
