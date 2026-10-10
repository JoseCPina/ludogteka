import type { TonoChip } from "@/components/ui/chip";

// Lo que se dice en pantalla de una factura. El estado real lo guarda la base
// (cfdi_facturas.estado); aquí solo está cómo se lee.
export const ESTADOS_FACTURA: Record<string, { texto: string; tono: TonoChip }> = {
  borrador: { texto: "Sin timbrar", tono: "neutro" },
  timbrando: { texto: "Timbrando…", tono: "proceso" },
  vigente: { texto: "Vigente", tono: "exito" },
  cancelacion_pendiente: { texto: "Cancelación en proceso", tono: "proceso" },
  cancelada: { texto: "Cancelada", tono: "pendiente" },
  revisar: { texto: "Por revisar", tono: "pendiente" },
  descartada: { texto: "Descartada", tono: "neutro" },
};

export const ETIQUETA_CLASE: Record<string, string> = {
  medicina_patente: "Medicina de patente veterinaria",
  alimento_mascotas: "Alimento procesado para mascotas",
  otro_producto: "Otros productos",
  estetica: "Estética",
  hospedaje: "Hospedaje (hotel)",
  guarderia: "Guardería",
  consulta_veterinaria: "Consulta veterinaria",
  otro_servicio: "Otros servicios",
};

export const CLASES_DE_SERVICIO = ["estetica", "hospedaje", "guarderia", "consulta_veterinaria", "otro_servicio"] as const;
export const CLASES_DE_PRODUCTO = ["medicina_patente", "alimento_mascotas", "otro_producto"] as const;

/** Valores por omisión del IVA (los mismos que cfdi_regla_clase() en la base). */
export function ivaPorOmision(clase: string, tipoPersona: string | null): { tratamiento: "tasa" | "exento"; tasa: number } {
  if (clase === "medicina_patente") return { tratamiento: "tasa", tasa: 0 };
  if (clase === "consulta_veterinaria" && (tipoPersona === "fisica" || tipoPersona === "sociedad_civil")) return { tratamiento: "exento", tasa: 0 };
  return { tratamiento: "tasa", tasa: 0.16 };
}

export const dinero = (n: number | string) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n));

export type ItemCatalogo = { tipo: string; clave: string; descripcion: string; persona: string };

export const PRUEBAS_AVISO = "PRUEBAS (sandbox): estas facturas no tienen validez fiscal.";
