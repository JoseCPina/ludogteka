/**
 * Revertir operaciones (migración 20261203004300; docs/revertir-operaciones.md).
 *
 * Toda operación del panel que cambia estado o dinero tiene «Deshacer» o su acción inversa: con motivo obligatorio,
 * permiso «Deshacer operaciones» (admin siempre), bitácora (operaciones_revertidas) y efectos encadenados. Aquí viven
 * los tipos, los textos y la regla de las 24 horas: lo hecho hace menos de un día sale como botón «Deshacer …» en el
 * detalle; lo más viejo, dentro del menú «Corregir».
 */
export type TipoReversion =
  | "checkin_estancia"
  | "checkout_estancia"
  | "no_llego_estancia"
  | "cancelacion_estancia"
  | "cancelacion_cita"
  | "no_llego_cita"
  | "eliminacion_cita"
  | "finalizacion_cita"
  | "cargo_cancelado"
  | "venta_cancelada"
  | "cuenta_cancelada"
  | "devolucion";

export type OperacionReversible = {
  tipo: TipoReversion;
  /** La estancia, cita, cargo, venta, reserva (cuenta) o devolución. */
  id: string;
  /** Cuándo se hizo lo que se va a deshacer (ISO); sin fecha, va al menú «Corregir». */
  hechoEn?: string | null;
  /** Para deshacer un check-in: a dónde regresa (una reserva vuelve a «reservada»; un walk-in por error se cancela). */
  destino?: "reservada" | "cancelada";
};

export const HORAS_DESHACER = 24;

/** Lo hecho hace menos de 24 horas se deshace con un botón a la vista; lo demás, desde «Corregir». */
export function esReciente(hechoEn: string | null | undefined, ahora: Date = new Date()): boolean {
  if (!hechoEn) return false;
  const t = new Date(hechoEn).getTime();
  return Number.isFinite(t) && ahora.getTime() - t < HORAS_DESHACER * 3600 * 1000;
}

type TextosReversion = {
  /** «Deshacer el check-in», «Reabrir la cuenta»… */
  boton: string;
  /** Lo que va a pasar, para la confirmación. */
  explica: string;
  /** Para la bitácora y la ayuda. */
  nombre: string;
};

export const TEXTOS_REVERSION: Record<TipoReversion, TextosReversion> = {
  checkin_estancia: {
    boton: "Deshacer el check-in",
    nombre: "Check-in",
    explica: "La estancia vuelve a «reservada» (si fue un walk-in por error, se cancela y libera el lugar). Si el día se descontó de un pase, regresa al pase. Los cobros no cambian. El check-in capturado queda en la bitácora.",
  },
  checkout_estancia: {
    boton: "Deshacer la salida",
    nombre: "Check-out",
    explica: "La estancia vuelve a «en curso» y su cuenta se reabre. Si la salida anticipada había bajado la cuenta, esa corrección se anula. Lo cobrado sigue cobrado.",
  },
  no_llego_estancia: {
    boton: "Deshacer «no llegó»",
    nombre: "No llegó (estancia)",
    explica: "La estancia vuelve a «reservada» y ocupa su lugar otra vez (si la fecha no ha pasado, se revisa el cupo). El día de pase que se devolvió se vuelve a descontar y el saldo a favor que esto había dejado desaparece. Después, si llegó, haz su check-in.",
  },
  cancelacion_estancia: {
    boton: "Deshacer la cancelación",
    nombre: "Cancelación de estancia",
    explica: "La estancia vuelve a «reservada» y ocupa su lugar otra vez (si la fecha no ha pasado, se revisa el cupo). El día de pase que se devolvió se vuelve a descontar.",
  },
  cancelacion_cita: {
    boton: "Reabrir la cita",
    nombre: "Cancelación de cita",
    explica: "La cita vuelve a «reservada» en su misma hora (si otra cita ya tomó la hora, no se reabre: reprográmala). Sus correcciones de precio regresan.",
  },
  no_llego_cita: {
    boton: "Deshacer «no se presentó»",
    nombre: "No se presentó (cita)",
    explica: "La cita vuelve a «reservada» en su misma hora. Sus correcciones de precio regresan.",
  },
  eliminacion_cita: {
    boton: "Restaurar la cita",
    nombre: "Eliminación de cita",
    explica: "La cita vuelve a la agenda tal como estaba.",
  },
  finalizacion_cita: {
    boton: "Deshacer la finalización",
    nombre: "Finalización de cita",
    explica: "La cita vuelve a «en curso»; lo que descontó del inventario regresa con un ajuste. Lo cobrado sigue cobrado.",
  },
  cargo_cancelado: {
    boton: "Reactivar el cargo",
    nombre: "Cargo cancelado",
    explica: "El cargo vuelve a sumar en la cuenta.",
  },
  venta_cancelada: {
    boton: "Reactivar el renglón",
    nombre: "Renglón de venta cancelado",
    explica: "El renglón vuelve a sumar en la cuenta y, si era un producto, se vuelve a descontar del inventario.",
  },
  cuenta_cancelada: {
    boton: "Reabrir la cuenta",
    nombre: "Cuenta cancelada",
    explica: "La cuenta vuelve a «por cobrar» con su saldo. Las citas o estancias que se cancelaron junto con ella se regresan una por una desde su detalle.",
  },
  devolucion: {
    boton: "Anular la devolución",
    nombre: "Devolución",
    explica: "La devolución deja de contar en caja, en la cuenta y en reportes (solo mientras su turno siga abierto). El cobro original queda como estaba.",
  },
};
