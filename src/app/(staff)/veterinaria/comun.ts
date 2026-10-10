// Lo que comparten las pantallas de Veterinaria: etiquetas legibles de las
// dos clasificaciones (independientes entre sí) y su estilo.

export const GRUPOS_SENASICA: { valor: string; etiqueta: string }[] = [
  { valor: "I", etiqueta: "Grupo I" },
  { valor: "II", etiqueta: "Grupo II" },
  { valor: "III", etiqueta: "Grupo III" },
];

export const CLASIFICACIONES_LGS: { valor: string; etiqueta: string; corta: string }[] = [
  { valor: "estupefaciente_234", etiqueta: "Estupefaciente (art. 234 de la Ley General de Salud)", corta: "Estupefaciente · art. 234" },
  { valor: "psicotropico_245_II", etiqueta: "Psicotrópico, fracción II del art. 245", corta: "Psicotrópico · art. 245 fr. II" },
  { valor: "psicotropico_245_III", etiqueta: "Psicotrópico, fracción III del art. 245", corta: "Psicotrópico · art. 245 fr. III" },
  { valor: "psicotropico_245_IV", etiqueta: "Psicotrópico, fracción IV del art. 245", corta: "Psicotrópico · art. 245 fr. IV" },
];

export const etiquetaGrupo = (g: string | null | undefined) => (g ? `SENASICA Grupo ${g}` : null);
export const etiquetaLgs = (c: string | null | undefined) => CLASIFICACIONES_LGS.find((x) => x.valor === c)?.corta ?? null;

export const ESTADOS_CADUCIDAD: Record<string, { etiqueta: string; estilo: string }> = {
  caducado: { etiqueta: "Caducado", estilo: "bg-coral-suave text-coral-oscuro" },
  por_caducar: { etiqueta: "Por caducar", estilo: "bg-ambar-suave text-ambar-oscuro" },
  vigente: { etiqueta: "Vigente", estilo: "bg-menta-suave text-menta-oscuro" },
  sin_caducidad: { etiqueta: "Sin caducidad", estilo: "bg-n-100 text-n-600" },
};

export const TIPOS_MOVIMIENTO_LOTE: Record<string, { etiqueta: string; entrada: boolean; estilo: string }> = {
  entrada_compra: { etiqueta: "Entrada (compra)", entrada: true, estilo: "bg-menta-suave text-menta-oscuro" },
  entrada_inicial: { etiqueta: "Existencia inicial", entrada: true, estilo: "bg-menta-suave text-menta-oscuro" },
  salida_surtido: { etiqueta: "Surtido", entrada: false, estilo: "bg-n-100 text-n-700" },
  salida_merma: { etiqueta: "Merma", entrada: false, estilo: "bg-coral-suave text-coral-oscuro" },
  salida_caducado: { etiqueta: "Caducado", entrada: false, estilo: "bg-coral-suave text-coral-oscuro" },
  ajuste_positivo: { etiqueta: "Ajuste (+)", entrada: true, estilo: "bg-menta-suave text-menta-oscuro" },
  ajuste_negativo: { etiqueta: "Ajuste (−)", entrada: false, estilo: "bg-coral-suave text-coral-oscuro" },
};

export const AVISO_FOLIO_RECETA =
  "Más adelante el sistema exigirá el folio de receta al surtirlo; por ahora el campo es opcional.";

export type PrincipioActivo = {
  id: string;
  nombre: string;
  grupo_senasica: string | null;
  clasificacion_lgs: string | null;
  es_antimicrobiano: boolean;
  por_confirmar: boolean;
  nota: string | null;
};

export function abreviar(clave: string) {
  return clave === "pieza" ? "pz" : clave === "galon" ? "gal" : clave;
}
