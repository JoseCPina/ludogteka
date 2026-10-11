// Servicios extra cobrables (Hotel y guardería). Tipos y textos compartidos por
// el tablero, la hoja de traslados, la ficha de la estancia y el catálogo.

export type UnidadExtra = "vez" | "dia" | "sesion" | "viaje";
export type TipoExtra = "general" | "traslado";
export type EstadoExtra = "pendiente" | "en_camino" | "hecho" | "cancelado";
export type ClaseFiscalExtra = "estetica" | "hospedaje" | "guarderia" | "otro_servicio";

export const UNIDADES_EXTRA: { valor: UnidadExtra; etiqueta: string }[] = [
  { valor: "vez", etiqueta: "Por vez" },
  { valor: "dia", etiqueta: "Por día" },
  { valor: "sesion", etiqueta: "Por sesión" },
  { valor: "viaje", etiqueta: "Por viaje" },
];

export const CLASES_FISCALES_EXTRA: { valor: ClaseFiscalExtra; etiqueta: string }[] = [
  { valor: "otro_servicio", etiqueta: "Otro servicio (el de siempre)" },
  { valor: "guarderia", etiqueta: "Guardería" },
  { valor: "hospedaje", etiqueta: "Hospedaje" },
  { valor: "estetica", etiqueta: "Estética" },
];

export function etiquetaUnidadExtra(u: string): string {
  return UNIDADES_EXTRA.find((x) => x.valor === u)?.etiqueta.toLowerCase() ?? u;
}

/** Lo que dice cada estado: un traslado se lee «Entregado», no «Hecho». */
export function etiquetaEstadoExtra(estado: string, tipo: string, sentido?: string | null): string {
  if (estado === "cancelado") return "Cancelado";
  if (tipo === "traslado") {
    if (estado === "pendiente") return "Pendiente";
    if (estado === "en_camino") return "En camino";
    return sentido === "recoger" ? "Recogido" : "Entregado";
  }
  return estado === "hecho" ? "Hecho" : "Por hacer";
}

export type ExtraFila = {
  id: string;
  fecha: string;
  hora: string | null;
  estado: EstadoExtra;
  atrasada: boolean;
  extra_id: string;
  extra_nombre: string;
  tipo: TipoExtra;
  unidad: UnidadExtra;
  cantidad: number;
  precio_unitario: number;
  zona_nombre: string | null;
  direccion: string | null;
  sentido: "recoger" | "entregar" | null;
  notas: string | null;
  estancia_id: string;
  perro_id: string;
  perro_nombre: string;
  cliente_id: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cargo_id: string | null;
  cubierto_paquete: boolean;
  aviso_whatsapp_at: string | null;
  motivo_cancelacion: string | null;
};

export type ZonaExtra = { id: string; extra_id: string; nombre: string; km_hasta: number | null; precio: number; activo: boolean };

export type CatalogoExtra = {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipo: TipoExtra;
  unidad: UnidadExtra;
  precio: number;
  clase_fiscal: ClaseFiscalExtra;
  clave_prod_serv: string | null;
  activo: boolean;
  paquete_servicio_id: string | null;
  zonas: ZonaExtra[];
};

/** El mensaje que sale por WhatsApp al dueño cuando el traslado sale. */
export function mensajeTraslado(o: { dueno: string | null; perro: string; negocio: string; sentido: "recoger" | "entregar" | null; hora: string | null }): string {
  const saludo = o.dueno ? `Hola ${o.dueno}` : "Hola";
  const hora = o.hora ? ` (programado a las ${o.hora.slice(0, 5)})` : "";
  return o.sentido === "recoger"
    ? `${saludo}, ya salimos de ${o.negocio} a recoger a ${o.perro}${hora}. Estamos en camino.`
    : `${saludo}, ya salimos de ${o.negocio} para llevar a ${o.perro} a tu domicilio${hora}. Estamos en camino.`;
}

/** wa.me al dueño (10 dígitos). Nunca manda nada solo: abre WhatsApp con el texto escrito. */
export function enlaceWhatsAppExtra(telefono10: string, mensaje: string): string {
  return `https://wa.me/52${telefono10.replace(/\D/g, "")}?text=${encodeURIComponent(mensaje)}`;
}
