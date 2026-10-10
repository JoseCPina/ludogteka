/**
 * Permisos que admin le puede dar a una persona de recepción en
 * particular (24 de septiembre de 2026). La fuente de verdad es la base
 * (permisos_staff + tiene_permiso(), migración 20260924025425): aquí solo
 * están los nombres y lo que cada uno implica, para la pantalla de admin,
 * la navegación y para esconder botones que la base de todos modos
 * rechazaría.
 *
 * Lo que NUNCA se delega (sigue siendo de admin): dar o quitar permisos,
 * crear o quitar admins, cambiar el rol de alguien, el tope de descuentos
 * de recepción, las devoluciones y quitar una evaluación de comportamiento.
 */
export const PERMISOS = [
  {
    clave: "inventario_costos",
    etiqueta: "Costos y compras de inventario",
    implica:
      "Ve lo que costó cada compra y el costo promedio de los insumos, registra compras y da de alta o edita proveedores. El catálogo de insumos sigue siendo de admin.",
  },
  {
    clave: "tarifas",
    etiqueta: "Precios y tarifas",
    implica:
      "Edita los precios de la matriz de cada servicio y los precios por día de la semana. Crear o cambiar servicios sigue siendo de admin.",
  },
  {
    clave: "reportes_financieros",
    etiqueta: "Reportes financieros",
    implica:
      "Ve los reportes completos: ingresos, costos, margen por servicio y operativos, con los mismos números que ve admin.",
  },
  {
    clave: "personal",
    etiqueta: "Personal",
    implica:
      "Invita gente de recepción y estética y ve la lista del personal. No puede crear admins ni cambiarle el rol a nadie.",
  },
  {
    clave: "configuracion_negocio",
    etiqueta: "Configuración del negocio",
    implica:
      "Cambia el cupo, el horario de atención, el teléfono de recepción y la dirección base de la camioneta. El tope de descuentos no: ese sigue siendo de admin.",
  },
  {
    clave: "excepciones_reserva",
    etiqueta: "Excepciones al reservar",
    implica:
      "Puede reservar a un perro con vacunas vencidas o sin evaluación de comportamiento, con un motivo por escrito que queda registrado con su nombre.",
  },
  {
    clave: "descuentos_sin_tope",
    etiqueta: "Descuentos sin tope",
    implica:
      "Aplica descuentos arriba del tope de recepción, con un motivo por escrito que queda registrado con su nombre.",
  },
  {
    clave: "plantillas_contrato",
    etiqueta: "Plantillas de contrato",
    implica:
      "Crea, edita, archiva y publica versiones de los contratos, y decide cuándo se genera cada uno.",
  },
  {
    clave: "nomina",
    etiqueta: "Nómina",
    implica:
      "Da de alta empleados y su horario, ve y captura sueldos, comisiones y adelantos, calcula la nómina y la marca pagada. Corregir asistencia y aprobar ausencias sigue siendo de admin. «Costos y compras de inventario» no da acceso a esto.",
  },
  {
    clave: "gastos",
    etiqueta: "Gastos del local",
    implica:
      "Registra y ve los gastos del local (renta, luz, camioneta…), los marca pagados, los cancela o corrige, y maneja los gastos recurrentes. Editar las categorías sigue siendo de admin. Ni «Costos y compras de inventario» ni «Nómina» dan acceso a esto.",
  },
  {
    clave: "reportes_guarderia",
    etiqueta: "Reportes de guardería",
    implica:
      "Llena y envía el reporte de comportamiento diario de guardería, y toma o sube fotos y videos de los perros que están adentro (hotel y guardería) para mandárselos a su dueño. Cambiar la plantilla del reporte sigue siendo de admin.",
  },
  {
    clave: "corregir_estilista",
    etiqueta: "Corregir estilista de servicios cerrados",
    implica:
      "Cambia la estilista de un servicio de estética que ya terminó (con un motivo por escrito que queda en el historial de la cita). Si el periodo de nómina de alguna de las dos ya se pagó, la diferencia de comisión o propina se ajusta en su siguiente pago. Reasignar antes de empezar o con el servicio en curso lo hace recepción sin este permiso.",
  },
  {
    clave: "corregir_servicio",
    etiqueta: "Corregir servicio de citas",
    implica:
      "Cambia el servicio de una cita de estética cuando se capturó mal (abierta o ya terminada y cobrada), con un motivo por escrito que queda en el historial de la cita. El precio se recalcula con las reglas de hoy y, si ya se había cobrado, la cuenta queda con un cobro adicional o un saldo a favor (nunca se toca el cobro original). Si el servicio ya se terminó, también ajusta el inventario y, si su nómina ya se pagó, la comisión en el siguiente pago.",
  },
  {
    clave: "tarjeta_manual",
    etiqueta: "Registrar tarjeta manual",
    implica:
      "Registra un cobro con «Tarjeta (registro manual)» cuando no se puede usar la terminal vinculada (terminal caída, sin señal, otra terminal), con el folio del voucher y el motivo. Viene prendido para toda la recepción; quítalo a quien no deba. El cobro cuenta como pagado pero queda «sin verificar» hasta que un admin lo revisa en Caja → Conciliación.",
  },
  {
    clave: "ajustar_pases",
    etiqueta: "Ajustar días de pases",
    implica:
      "Corrige los días usados de un pase de guardería (day pass o mensualidad) con un motivo por escrito que queda en el historial del pase, deshace un check-in hecho por error devolviendo el día al pase, y registra un pase nuevo que ya lleva días usados. No mueve dinero ni la caja. Extender la vigencia de un pase sigue siendo de admin. Viene apagado: dáselo solo a quien deba corregir saldos.",
  },
  {
    clave: "anular_cobros",
    etiqueta: "Anular cobros",
    implica:
      "Anula un cobro hecho a mano (efectivo, transferencia o tarjeta manual) con un motivo por escrito. El cobro no se borra: queda en el historial, sale de los totales de la caja y de los reportes, y la cuenta vuelve a quedar por cobrar. Los cobros por la terminal o el link de pago no se anulan: se devuelven. Con el turno ya cerrado hace falta también «Corregir cobros de turnos cerrados». Viene apagado.",
  },
  {
    clave: "editar_monto_cobros",
    etiqueta: "Editar monto de cobros",
    implica:
      "Corrige cuánto se cobró en un cobro hecho a mano, y corrige el precio de una línea de la cuenta, con un motivo por escrito y sin generar un descuento. Queda el valor anterior, el nuevo y quién lo hizo. Con el turno ya cerrado hace falta también «Corregir cobros de turnos cerrados». Viene apagado.",
  },
  {
    clave: "corregir_turnos_cerrados",
    etiqueta: "Corregir cobros de turnos cerrados",
    implica:
      "Permite anular o corregir (con «Anular cobros» o «Editar monto de cobros») un cobro de un turno que ya se cerró. El corte de ese turno no cambia: la corrección queda como un ajuste visible en el turno abierto. Viene apagado: dáselo solo a quien deba corregir días anteriores.",
  },
  {
    clave: "agregar_efectivo",
    etiqueta: "Agregar efectivo a caja",
    implica:
      "Registra efectivo que entra al cajón del turno abierto sin ser una venta (se acabó el cambio, un préstamo de otra caja, una aportación del dueño) y cancela los que registró con motivo. Cuenta en el efectivo esperado del corte. Viene apagado.",
  },
  {
    clave: "eliminar_citas",
    etiqueta: "Eliminar citas",
    implica:
      "Elimina una cita de estética capturada por error o duplicada, con un motivo por escrito: sale de la agenda y libera el horario, pero no se borra (queda en el historial de la cita). Cancelar una cita y marcar que no se presentó no necesitan este permiso. Una cita con cobro se elimina hasta anular el cobro. Viene apagado.",
  },
  {
    clave: "facturar",
    etiqueta: "Facturar",
    implica:
      "Emite la factura (CFDI) de un cobro o de un cobro junto, la factura global al público en general, y manda las facturas al cliente por WhatsApp o correo. No cancela facturas ni edita datos fiscales. Viene apagado.",
  },
  {
    clave: "cancelar_facturas",
    etiqueta: "Cancelar facturas",
    implica:
      "Cancela facturas ante el SAT (motivos 01 a 04) y sustituye una factura con errores por otra. Una cancelación no se deshace. Viene apagado.",
  },
  {
    clave: "editar_datos_fiscales",
    etiqueta: "Editar datos fiscales",
    implica:
      "Captura y cambia el RFC, la razón social, el régimen y el código postal fiscal de los clientes y del negocio, el IVA de cada concepto y la llave del timbrado. Viene apagado.",
  },
] as const;

export type ClavePermiso = (typeof PERMISOS)[number]["clave"];

export function etiquetaDePermiso(clave: string): string {
  return PERMISOS.find((p) => p.clave === clave)?.etiqueta ?? clave;
}

/** Admin tiene todos; los demás, solo los que la base dice. */
export function tienePermiso(
  sesion: { rol: string; permisos: string[] } | null | undefined,
  clave: ClavePermiso
): boolean {
  if (!sesion) return false;
  return sesion.rol === "admin" || sesion.permisos.includes(clave);
}
