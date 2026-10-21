// Recetas, espejo del SITPV, recetario especial y libro de control (Veterinaria, Fase 4).
// Las reglas (plazos, copias, documento por clasificación) las edita la plataforma en la base:
// aquí solo hay etiquetas y tipos de lo que devuelven las funciones.

export type Requisito = {
  documento: "libre" | "receta_simple" | "receta_cedula" | "espejo_sitpv" | "receta_especial";
  clave: string | null;
  etiqueta: string | null;
  surtidos_max: number | null;
  ventana_meses: number | null;
  retencion_meses: number | null;
  libro_control: boolean;
};

export const DOCUMENTOS: Record<Requisito["documento"], { etiqueta: string; corta: string }> = {
  libre: { etiqueta: "Venta libre", corta: "Libre" },
  receta_simple: { etiqueta: "Receta simple", corta: "Receta simple" },
  receta_cedula: { etiqueta: "Receta con cédula (se surte con límite)", corta: "Receta con cédula" },
  espejo_sitpv: { etiqueta: "Receta cuantificada del SITPV", corta: "SITPV" },
  receta_especial: { etiqueta: "Recetario especial", corta: "Recetario especial" },
};

export type LineaReceta = {
  id: string;
  insumo_id: string | null;
  producto: string;
  principio_activo: string | null;
  presentacion: string | null;
  dosis: string;
  via: string;
  frecuencia: string;
  duracion_dias: number;
  tiempo_retiro: string | null;
  cantidad_calculada: number | null;
  cantidad_surtir: number;
  cantidad_unidad: string | null;
  indicaciones: string | null;
  documento: Requisito["documento"];
  clasificacion: string | null;
  surtidos_max: number | null;
  ventana_meses: number | null;
  surtidos: number;
  surtido_cantidad: number;
};

export type RecetaSnapshot = {
  establecimiento: { nombre: string; ciudad: string | null; aviso_funcionamiento: string | null; mvra: string | null; mvra_cedula: string | null };
  medico: { nombre: string; cedula: string; cpa: string | null };
  mascota: { nombre: string; especie: string | null; raza: string | null; sexo: string | null; esterilizado: boolean | null; fecha_nacimiento: string | null; microchip: string | null; peso_kg: number | null };
  propietario: { nombre: string; telefono: string | null; domicilio: string | null };
  leyenda: string;
  requiere_cedula?: boolean;
};

export type RecetaDetalle = {
  id: string;
  numero: number;
  estado: "emitida" | "anulada";
  fecha: string;
  perro_id: string;
  consulta_id: string | null;
  medico_id: string;
  snapshot: RecetaSnapshot;
  copias: number;
  diagnostico: string | null;
  observaciones: string | null;
  conservar_hasta: string;
  archivada_at: string | null;
  enviada_at: string | null;
  anulada_at: string | null;
  anulada_motivo: string | null;
  integra: boolean;
  lineas: LineaReceta[];
};

export type RecetaResumen = {
  id: string;
  numero: number;
  estado: string;
  fecha: string;
  perro_id: string;
  mascota: string;
  dueno: string;
  medico: string | null;
  conservar_hasta: string;
  archivada_at: string | null;
  productos: string | null;
  requiere_cedula: boolean;
};

export type EspejoResumen = {
  id: string;
  folio: string;
  fecha: string;
  estado: "registrada" | "cancelada";
  producto: string;
  cantidad_total: number;
  unidad: string | null;
  uso_hospitalario: boolean;
  parcialidades: boolean;
  mascota: string | null;
  medico: string | null;
  surtido: number;
  conservar_hasta: string;
  archivada_at: string | null;
};

export type EspejoDetalle = EspejoResumen & {
  cpa: string;
  perro_id: string | null;
  dueno: string | null;
  medico_id: string;
  cedula: string | null;
  insumo_id: string;
  registro_senasica: string;
  principio_activo: string | null;
  laboratorio: string | null;
  lote_id: string | null;
  lote: string | null;
  presentacion: string | null;
  dosis: string | null;
  intervalo: string | null;
  duracion: string | null;
  comprobante_compra: string | null;
  observaciones: string | null;
  es_antimicrobiano: boolean;
  cancelada_at: string | null;
  cancelada_motivo: string | null;
  establecimiento: string;
  leyenda: string;
  aplicaciones: { fecha: string; cantidad: number; paciente: string | null; lote: string | null; hospitalario: boolean }[];
};

export type RecetarioFila = {
  id: string;
  folio: string;
  codigo_barras: string;
  fecha: string;
  estado: "vigente" | "cancelada";
  producto: string;
  dias: number;
  cantidad_diaria: number;
  cantidad_total: number;
  unidad: string | null;
  perro_id: string;
  mascota: string | null;
  insumo_id: string;
  medico: string | null;
  surtido: number;
  indicaciones: string | null;
  cancelada_motivo: string | null;
  conservar_hasta: string;
  archivada_at: string | null;
};

export type EstadoMedicoSitpv = {
  medico_id: string;
  nombre: string;
  cpa: string | null;
  folios_disponibles: number;
  folios_asignados: number;
  meses_pendientes: string[];
};

export type FilaLibro = {
  id: string;
  fecha: string;
  hora: string;
  insumo_id: string;
  producto: string;
  laboratorio: string | null;
  unidad: string | null;
  lote: string;
  caducidad: string | null;
  tipo: string;
  entrada: number | null;
  salida: number | null;
  saldo: number;
  folio: string | null;
  paciente: string | null;
  medico: string | null;
  motivo: string | null;
};

export type Libro = {
  desde: string;
  hasta: string;
  movimientos: FilaLibro[];
  saldos_iniciales: { insumo_id: string; producto: string; unidad: string | null; saldo_inicial: number }[];
};

export type ReporteSitpv = {
  medico: string;
  cedula: string;
  cpa: string | null;
  periodo: string;
  reportado: { at: string; nota: string | null; por: string | null } | null;
  usados: { id: string; folio: string; fecha: string; producto: string; registro_senasica: string; cantidad_total: number; unidad: string | null; parcialidades: boolean; paciente: string | null }[];
  cancelados: { id: string; folio: string; fecha: string; cantidad: number; observacion: string | null }[];
  parcialidades: { folio: string; fecha: string; producto: string; cantidad: number; paciente: string }[];
  pacientes: string[];
};

/** Cantidad a surtir: dosis por toma × tomas al día × días (hacia arriba). La base usa la misma cuenta. */
export function calcularCantidad(dosis: number, frecuenciaHoras: number | null, dias: number): number | null {
  if (!Number.isFinite(dosis) || dosis <= 0 || !Number.isFinite(dias) || dias <= 0) return null;
  const veces = frecuenciaHoras && frecuenciaHoras > 0 ? (24 / frecuenciaHoras) * dias : 1;
  return Math.ceil(dosis * veces - 1e-9);
}

const NUMEROS_ESCRITOS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, media: 0.5, medio: 0.5 };

/** «1 tableta» → 1, «1/2 tableta» → 0.5, «media tableta» → 0.5; null si no empieza con un número. */
export function numeroInicial(texto: string): number | null {
  const t = texto.trim().toLowerCase();
  const fr = t.match(/^(\d+)\s*\/\s*(\d+)/);
  if (fr) return Number(fr[2]) > 0 ? Number(fr[1]) / Number(fr[2]) : null;
  const n = t.match(/^(\d+(?:[.,]\d+)?)/);
  if (n) return Number(n[1].replace(",", "."));
  const w = t.match(/^([a-záéíóú]+)/);
  return w && NUMEROS_ESCRITOS[w[1]] !== undefined ? NUMEROS_ESCRITOS[w[1]] : null;
}

/** «cada 12 horas», «c/8 h», «2 veces al día», «una vez al día» → cada cuántas horas; null si no se entiende. */
export function horasDeFrecuencia(texto: string): number | null {
  const t = texto.trim().toLowerCase();
  if (!t) return null;
  const cada = t.match(/(?:cada|c\/)\s*(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|horas?)\b/);
  if (cada) return Number(cada[1].replace(",", "."));
  const veces = t.match(/(\d+|una|un|dos|tres|cuatro)\s*(?:veces|vez)\s*(?:al|por|cada)?\s*d[ií]a/);
  if (veces) {
    const v = /^\d+$/.test(veces[1]) ? Number(veces[1]) : NUMEROS_ESCRITOS[veces[1]];
    return v > 0 ? 24 / v : null;
  }
  if (/\b(cada d[ií]a|diari[oa]|una vez al d[ií]a)\b/.test(t)) return 24;
  return null;
}

/** Cómo se escribe una frecuencia en todo el formulario: «Cada 12 horas», «2 veces al día». */
export function formatoFrecuencia(texto: string): string {
  const t = texto.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const cada = t.match(/^(?:cada|c\/)\s*(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|horas?)$/i);
  if (cada) return `Cada ${cada[1].replace(",", ".")} horas`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Las indicaciones que salen de los datos del renglón: «Meloxicam 1 mg, 1 tableta cada 24 horas por 3 días». */
/** QA S19 (N97): las indicaciones se arman SOLO con lo capturado (dosis, frecuencia y duración): «1 tableta cada 24 horas por 5 días». */
export function indicacionesGeneradas(d: { dosis: string; frecuencia: string; duracion_dias: string }): string {
  const frec = d.frecuencia.trim();
  const dias = Math.trunc(Number(String(d.duracion_dias).replace(",", ".")));
  return [
    d.dosis.trim(),
    frec ? frec.charAt(0).toLowerCase() + frec.slice(1) : "",
    Number.isFinite(dias) && dias > 0 ? `por ${dias} ${dias === 1 ? "día" : "días"}` : "",
  ].filter(Boolean).join(" ");
}

/**
 * QA S19 (N97): quita del Tratamiento el texto guía de la plantilla («Medicamento · dosis · vía · frecuencia ·
 * duración:»). Si el médico escribió después de los dos puntos, se queda lo suyo; un renglón que solo es la guía
 * o un título vacío («Algo:») no es un medicamento.
 */
export function sinGuiaDePlantilla(renglon: string): string {
  const r = renglon.trim();
  const guia = r.match(/^[^:]{0,100}·[^:]*:\s*/);
  const sinGuia = guia ? r.slice(guia[0].length).trim() : r;
  return /^[^:]{0,60}:$/.test(sinGuia) ? "" : sinGuia;
}

export type MedicamentoDeTratamiento = {
  /** Lo que va antes de la dosis en el renglón («Meloxicam 1 mg»): la base de las indicaciones generadas. */
  base: string;
  producto: string;
  /** La concentración escrita junto al nombre («250 mg», «10 mg/kg», «5 mg/ml»); vacía si no hay. */
  presentacion: string;
  /** La vía si se escribió («VO», «IM», «subcutánea»…), ya en palabras; vacía si no se escribió. */
  via: string;
  dosis: string;
  dosis_cantidad: string;
  frecuencia: string;
  frecuencia_horas: string;
  duracion_dias: string;
  indicaciones: string;
};

/**
 * Del campo «Tratamiento» de una consulta firmada saca un borrador de medicamentos, uno por renglón (o separados
 * por «;»): «Amoxicilina 250 mg, 1 tableta cada 12 horas por 7 días». Es solo un punto de partida: el médico lo
 * revisa y lo corrige. Lo que no se entiende queda en indicaciones, tal cual.
 */
/**
 * QA S21 (N109): «N días» (o «N semanas») es la duración, con o sin «por/durante/x» antes; «cada N días» es una
 * frecuencia y no cuenta. Sin duración escrita, vacío.
 */
export function duracionDeRenglon(renglon: string): string {
  for (const m of renglon.matchAll(/(\d+)\s*(d[ií]as?|d\b|semanas?)/gi)) {
    const antes = renglon.slice(0, m.index).toLowerCase();
    if (/(cada|c\/)\s*$/.test(antes)) continue;
    const n = Number(m[1]);
    if (!n) continue;
    return String(/^s/i.test(m[2]) ? n * 7 : n);
  }
  return "";
}

/**
 * QA S21 (N109): la concentración (mg, mcg, g, UI, ml con «/kg» o «/ml») va a Presentación. La toma («1 tableta»,
 * «1 ml») no cuenta: es la dosis. Sin concentración, vacío.
 */
export function concentracionDeRenglon(renglon: string, toma: [number, number] | null): string {
  const re = /(\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|ui|ml)(?:\s*\/\s*(?:kg|ml|tableta|tab))?)(?![a-záéíóúñ])/gi;
  for (const m of renglon.matchAll(re)) {
    const ini = m.index ?? 0;
    if (toma && ini >= toma[0] && ini < toma[1]) continue;
    const t = m[1].replace(/\s+/g, " ").trim();
    // «1 ml» suelto es una toma; como concentración solo con «/kg» o «/ml».
    if (/ml$/i.test(t) && !/\//.test(t)) continue;
    return t.replace(/\s*\/\s*/g, "/").replace(/\bui\b/i, "UI");
  }
  return "";
}

// Con letras acentuadas \b no sirve: se delimita a mano.
const palabra = (t: string) => new RegExp(`(?<![a-záéíóúñ])(?:${t})(?![a-záéíóúñ])`, "i");
const VIAS: [RegExp, string][] = [
  [palabra("vo|v\\.o\\.|oral|por boca"), "Oral"],
  [palabra("im|i\\.m\\.|intramuscular"), "Intramuscular"],
  [palabra("iv|i\\.v\\.|intravenosa"), "Intravenosa"],
  [palabra("sc|s\\.c\\.|subcut[aá]nea"), "Subcutánea"],
  [palabra("t[oó]pica|t[oó]pico|cut[aá]nea"), "Tópica"],
  [palabra("oft[aá]lmica|oft[aá]lmico"), "Oftálmica"],
  [palabra("[oó]tica|[oó]tico"), "Ótica"],
];

/** QA S21 (N109): la vía escrita en el renglón, en palabras; si no se escribió, vacía (nunca se supone). */
export function viaDeRenglon(renglon: string): string {
  for (const [re, via] of VIAS) if (re.test(renglon)) return via;
  return "";
}

export function medicamentosDeTratamiento(texto: string | null | undefined): MedicamentoDeTratamiento[] {
  if (!texto) return [];
  return texto
    .split(/\r?\n|;/)
    .map(sinGuiaDePlantilla)
    .map((r) => r.replace(/^[\s\-•*\d.)]+(?=[A-Za-zÁÉÍÓÚáéíóúñÑ])/, "").trim())
    .filter((r) => r.length >= 3)
    .slice(0, 8)
    .map((renglon) => {
      const frase = renglon.match(/(cada\s*\d+(?:[.,]\d+)?\s*(?:h|hr|hrs|horas?)|c\/\s*\d+\s*(?:h|hr|hrs|horas?)|\d+\s*(?:veces|vez)\s*(?:al|por|cada)?\s*d[ií]a|(?:una|un|dos|tres|cuatro)\s*(?:veces|vez)\s*(?:al|por|cada)?\s*d[ií]a)/i);
      const dur = duracionDeRenglon(renglon);
      const horas = frase ? horasDeFrecuencia(frase[1]) : null;
      // El nombre es lo que va antes de la primera cantidad, frecuencia o duración.
      const corte = renglon.search(/[,:(]|\s\d|\s(?:cada|c\/|por|durante|x)\s/i);
      const producto = (corte > 0 ? renglon.slice(0, corte) : renglon).trim().slice(0, 80);
      const toma = renglon.match(/(\d+(?:[.,]\d+)?\s*\/?\s*\d*\s*(?:tabletas?|tabs?|comprimidos?|c[aá]psulas?|gotas?|ml|sobres?|piezas?))/i);
      const dosis = toma ? toma[1].replace(/\s+/g, " ").trim() : "";
      const cantidad = dosis ? numeroInicial(dosis) : null;
      const antes = toma && toma.index !== undefined ? renglon.slice(0, toma.index).replace(/[,\s]+$/, "").trim() : "";
      return {
        base: antes || producto,
        producto,
        dosis,
        dosis_cantidad: cantidad ? String(cantidad) : "",
        frecuencia: frase ? formatoFrecuencia(frase[1]) : "",
        frecuencia_horas: horas ? String(horas) : "",
        presentacion: concentracionDeRenglon(renglon, toma && toma.index !== undefined ? [toma.index, toma.index + toma[0].length] : null),
        via: viaDeRenglon(renglon),
        duracion_dias: dur,
        indicaciones: indicacionesGeneradas({ dosis, frecuencia: frase ? formatoFrecuencia(frase[1]) : "", duracion_dias: dur }),
      };
    });
}

export const NOMBRE_TIPO_MOVIMIENTO: Record<string, string> = {
  entrada_compra: "Entrada",
  entrada_inicial: "Existencia inicial",
  salida_surtido: "Surtido",
  salida_merma: "Merma",
  salida_caducado: "Caducado",
  ajuste_positivo: "Ajuste (+)",
  ajuste_negativo: "Ajuste (−)",
};

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export function nombreMes(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  return `${MESES[m - 1]} de ${a}`;
}
