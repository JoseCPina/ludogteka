// «Tarjeta (registro manual)»: el método para cuando no se puede cobrar con la
// terminal vinculada. Es APARTE de «Terminal»: se captura con el folio del
// voucher, cuenta como pagado desde que se registra, pero queda «sin verificar»
// y el admin lo revisa en Caja → Conciliación. La fuente de verdad es la base
// (registrar_cobro, migración 20261008000000); aquí solo están los textos.

export const ETIQUETA_TARJETA_MANUAL = "Tarjeta (registro manual)";
export const ETIQUETA_TARJETA_MANUAL_LINEA = "Tarjeta manual (sin verificar)";

export const MOTIVOS_TARJETA_MANUAL = [
  { clave: "terminal_no_responde", etiqueta: "Terminal vinculada no responde" },
  { clave: "sin_senal", etiqueta: "Sin señal o sin internet" },
  { clave: "otra_terminal", etiqueta: "Cobro en otra terminal" },
  { clave: "otro", etiqueta: "Otro (escríbelo)" },
] as const;

export type MotivoTarjetaManual = (typeof MOTIVOS_TARJETA_MANUAL)[number]["clave"];

export function etiquetaMotivo(clave: string, texto?: string | null): string {
  if (clave === "otro" && texto) return `Otro: ${texto}`;
  return MOTIVOS_TARJETA_MANUAL.find((m) => m.clave === clave)?.etiqueta ?? clave;
}

/** Los campos de una línea de cobro con tarjeta manual (se mandan tal cual a registrar_cobro). */
export type DatosTarjetaManual = {
  folio: string;
  motivo: string;
  motivo_texto: string;
  ultimos4: string;
  banco: string;
};

export function datosVacios(): DatosTarjetaManual {
  return { folio: "", motivo: "", motivo_texto: "", ultimos4: "", banco: "" };
}

/** Lo mismo que exige la base, para avisar antes de mandar. Devuelve el error o null. */
export function validarTarjetaManual(d: DatosTarjetaManual): string | null {
  const folio = d.folio.trim();
  if (folio.length < 4) return "Escribe el folio o número de autorización del voucher (mínimo 4 caracteres).";
  if (!MOTIVOS_TARJETA_MANUAL.some((m) => m.clave === d.motivo)) return "Elige por qué no se cobró con la terminal vinculada.";
  if (d.motivo === "otro" && d.motivo_texto.trim().length < 3) return "Cuéntanos el motivo (escríbelo en «Otro»).";
  if (d.ultimos4.trim() && !/^[0-9]{4}$/.test(d.ultimos4.trim())) return "Los últimos dígitos son 4 números. Nunca captures la tarjeta completa.";
  return null;
}

/** Lo que va al servidor: solo los campos con valor. */
export function cargaTarjetaManual(d: DatosTarjetaManual) {
  return {
    folio: d.folio.trim(),
    motivo: d.motivo,
    ...(d.motivo === "otro" ? { motivo_texto: d.motivo_texto.trim() } : {}),
    ...(d.ultimos4.trim() ? { ultimos4: d.ultimos4.trim() } : {}),
    ...(d.banco.trim() ? { banco: d.banco.trim() } : {}),
  };
}

export const AVISO_COBRO_TARJETA =
  "El cobro con tarjeta se hace con «Cobrar con terminal» (se confirma solo con Mercado Pago). Si no se puede, usa «Tarjeta (registro manual)» con el folio del voucher. A mano también: efectivo y transferencia.";
