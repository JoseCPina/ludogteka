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
