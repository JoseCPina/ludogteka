// Tipos y textos de «Cancelar cuenta». Sin "use server": lo comparten la acción y la pantalla.

export type MotivoCancelarCuenta = "no_se_presento" | "cita_cancelada" | "cortesia" | "error_captura" | "otro";

export const MOTIVOS_CANCELAR_CUENTA: { clave: MotivoCancelarCuenta; etiqueta: string }[] = [
  { clave: "no_se_presento", etiqueta: "No se presentó" },
  { clave: "cita_cancelada", etiqueta: "Cita cancelada" },
  { clave: "cortesia", etiqueta: "Cortesía" },
  { clave: "error_captura", etiqueta: "Error de captura" },
  { clave: "otro", etiqueta: "Otro" },
];

export function etiquetaMotivoCuenta(clave: string): string {
  return MOTIVOS_CANCELAR_CUENTA.find((m) => m.clave === clave)?.etiqueta ?? clave;
}

export type InfoCancelarCuenta = {
  saldo: number;
  total_cobrado: number;
  servicio_realizado: boolean;
  citas_pendientes: { id: string; estado: string; inicio: string }[];
  cancelada: { motivo: string; motivo_texto: string | null; cuando: string; saldo_cancelado: number; por_nombre: string } | null;
};
