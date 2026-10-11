// Lo que comparten las pantallas del expediente clínico de Veterinaria (Fase 3): agenda,
// consulta SOAP, línea de tiempo y estimados. Tipos de lo que devuelven las funciones de la
// base, etiquetas legibles y las secciones de la consulta. Helper puro (sin "use server").

export const TIPOS_CITA: Record<string, string> = {
  consulta: "Consulta",
  vacuna: "Vacuna",
  cirugia: "Cirugía",
  seguimiento: "Seguimiento",
  urgencia: "Urgencia",
  teleconsulta: "Teleconsulta",
};

export const ESTADOS_CITA: Record<string, { etiqueta: string; estilo: string }> = {
  programada: { etiqueta: "Programada", estilo: "bg-n-100 text-n-700" },
  confirmada: { etiqueta: "Confirmada", estilo: "bg-morado-suave text-morado" },
  en_curso: { etiqueta: "En curso", estilo: "bg-menta-suave text-menta-oscuro" },
  finalizada: { etiqueta: "Finalizada", estilo: "bg-n-100 text-n-600" },
  cancelada: { etiqueta: "Cancelada", estilo: "bg-coral-suave text-coral-oscuro" },
  no_llego: { etiqueta: "No llegó", estilo: "bg-coral-suave text-coral-oscuro" },
};

export type CitaVet = {
  id: string;
  perro_id: string;
  mascota: string;
  especie: string | null;
  cliente_id: string;
  dueno: string;
  telefono: string | null;
  tipo_clave: string;
  tipo: string;
  medico_id: string;
  medico: string;
  inicia_at: string;
  termina_at: string;
  estado: string;
  motivo: string | null;
  consulta_id: string | null;
  urgencia: boolean;
  cancelada_motivo: string | null;
};

export type TipoCitaConfig = { id: string; clave: string; nombre: string; duracion_min: number; activo: boolean };
export type MedicoVet = { id: string; nombre: string; cedula: string; cpa: string | null; soy_yo: boolean };

export type Diagnostico = {
  ref_id: string | null;
  origen: "catalogo" | "negocio" | "libre";
  nombre: string;
  tipo: "presuntivo" | "definitivo";
  nota: string;
};

export type DiagnosticoBuscado = { id: string; origen: "catalogo" | "negocio"; nombre: string; categoria: string; sinonimos: string[]; especies: string[] };

// Las secciones de texto de la consulta, en el orden SOAP.
export const SECCIONES_CONSULTA: { clave: "motivo" | "anamnesis" | "examen_fisico" | "hallazgos" | "plan" | "tratamiento"; etiqueta: string; grupo: string; filas: number }[] = [
  { clave: "motivo", etiqueta: "Motivo de la consulta", grupo: "S · Subjetivo", filas: 2 },
  { clave: "anamnesis", etiqueta: "Anamnesis", grupo: "S · Subjetivo", filas: 6 },
  { clave: "examen_fisico", etiqueta: "Examen físico", grupo: "O · Objetivo", filas: 7 },
  { clave: "hallazgos", etiqueta: "Hallazgos", grupo: "O · Objetivo", filas: 4 },
  { clave: "plan", etiqueta: "Plan", grupo: "P · Plan", filas: 4 },
  { clave: "tratamiento", etiqueta: "Tratamiento", grupo: "P · Plan", filas: 4 },
];

export type ConsultaVet = {
  id: string;
  perro_id: string;
  cliente_id: string;
  cita_id: string | null;
  tipo_clave: string;
  /** «telemedicina» si fue una teleconsulta. */
  modalidad?: "presencial" | "telemedicina";
  medico_id: string;
  estado: "borrador" | "firmada" | "anulada";
  atendida_at: string;
  motivo: string | null;
  anamnesis: string | null;
  examen_fisico: string | null;
  hallazgos: string | null;
  peso_kg: number | null;
  temperatura_c: number | null;
  frecuencia_cardiaca: number | null;
  frecuencia_respiratoria: number | null;
  condicion_corporal: number | null;
  mucosas: string | null;
  tllc_seg: number | null;
  hidratacion: string | null;
  diagnosticos: Diagnostico[];
  plan: string | null;
  tratamiento: string | null;
  notas_internas: string | null;
  borrador_guardado_at: string | null;
  firmada_at: string | null;
  firma_nombre: string | null;
  firma_cedula: string | null;
  firma_cpa: string | null;
  firma_hash: string | null;
  anulada_at: string | null;
  anulada_motivo: string | null;
};

export type ParametroLab = { nombre: string; valor: string; unidad: string | null; rango: string | null; bandera: "normal" | "alto" | "bajo" | null };
export type ResultadoLab = { id: string; estudio: string; fecha_estudio: string; laboratorio: string | null; parametros: ParametroLab[]; notas: string | null; anulada_at: string | null; anulada_motivo: string | null; consulta_id: string | null };
export type AdjuntoVet = { id: string; nombre: string; descripcion: string | null; mime: string; bytes: number; creado: string; anulada_at: string | null; anulada_motivo: string | null };
export type AdendaVet = { id: string; texto: string; firma_nombre: string; firma_cedula: string; firma_cpa: string | null; firmada_at: string };

export type DetalleConsulta = {
  consulta: ConsultaVet;
  mascota: { id: string; nombre: string; especie: string | null; raza: string | null; fecha_nacimiento: string | null; sexo: string | null; esterilizado: boolean | null };
  dueno: { id: string; nombre: string; telefono: string | null };
  medico: { id: string; nombre: string; cedula: string; cpa: string | null };
  adendas: AdendaVet[];
  resultados: ResultadoLab[];
  adjuntos: AdjuntoVet[];
};

export type EventoLinea = {
  tipo: "consulta" | "vacuna" | "desparasitacion" | "hospitalizacion" | "certificado" | "adjunto" | "laboratorio" | "peso";
  cuando: string;
  ref_id: string;
  estado: string;
  titulo: string;
  detalle: string;
  extra: string;
  medico?: string | null;
  consulta_id?: string | null;
};

export const TIPOS_EVENTO: Record<string, { etiqueta: string; estilo: string }> = {
  consulta: { etiqueta: "Consulta", estilo: "bg-morado-suave text-morado" },
  vacuna: { etiqueta: "Vacuna", estilo: "bg-menta-suave text-menta-oscuro" },
  desparasitacion: { etiqueta: "Desparasitación", estilo: "bg-menta-suave text-menta-oscuro" },
  hospitalizacion: { etiqueta: "Hospitalización", estilo: "bg-coral-suave text-coral-oscuro" },
  certificado: { etiqueta: "Certificado", estilo: "bg-n-100 text-n-700" },
  adjunto: { etiqueta: "Archivo", estilo: "bg-ambar-suave text-ambar-oscuro" },
  laboratorio: { etiqueta: "Laboratorio", estilo: "bg-ambar-suave text-ambar-oscuro" },
  peso: { etiqueta: "Peso", estilo: "bg-n-100 text-n-700" },
};

export type LineaEstimado = {
  id?: string;
  orden?: number;
  tipo: "servicio" | "procedimiento" | "insumo";
  descripcion: string;
  cantidad: number;
  unidad: string | null;
  precio_min: number;
  precio_max: number;
  insumo_id: string | null;
  cargo_id?: string | null;
};

export const TIPOS_LINEA: Record<string, string> = { servicio: "Servicio", procedimiento: "Procedimiento", insumo: "Insumo" };

export const ESTADOS_ESTIMADO: Record<string, { etiqueta: string; estilo: string }> = {
  borrador: { etiqueta: "Borrador", estilo: "bg-n-100 text-n-700" },
  enviado: { etiqueta: "Enviado", estilo: "bg-morado-suave text-morado" },
  aceptado: { etiqueta: "Aceptado", estilo: "bg-menta-suave text-menta-oscuro" },
  rechazado: { etiqueta: "Rechazado", estilo: "bg-coral-suave text-coral-oscuro" },
  reemplazado: { etiqueta: "Reemplazado", estilo: "bg-n-100 text-n-600" },
  cancelado: { etiqueta: "Cancelado", estilo: "bg-n-100 text-n-600" },
};

export type EstimadoResumen = {
  id: string;
  titulo: string;
  tipo: "consulta" | "cirugia";
  version: number;
  estado: string;
  total_min: number;
  total_max: number;
  vigente_hasta: string;
  vencido: boolean;
  creado: string;
  consulta_id?: string | null;
  enviado_at?: string | null;
  mascota?: string;
  perro_id?: string;
  dueno?: string;
};

export type DetalleEstimado = {
  estimado: {
    id: string; perro_id: string; cliente_id: string; consulta_id: string | null; cita_id: string | null; grupo_id: string; version: number;
    tipo: "consulta" | "cirugia"; titulo: string; notas: string | null; medico_id: string | null; estado: string; vigente_hasta: string;
    total_min: number; total_max: number; enviado_at: string | null; aceptado_at: string | null; aceptado_via: string | null; aceptado_nombre: string | null;
    aceptado_ip: string | null; reserva_id: string | null; rechazado_at: string | null; rechazo_motivo: string | null; cancelado_motivo: string | null;
  };
  tiene_firma: boolean;
  firma_png: string | null;
  enviado_con_liga: boolean;
  vencido: boolean;
  integro: boolean;
  lineas: LineaEstimado[];
  mascota: { id: string; nombre: string; especie: string | null };
  dueno: { id: string; nombre: string; telefono: string | null };
  medico: { id: string; nombre: string; cedula: string } | null;
  versiones: { id: string; version: number; estado: string; total_min: number; total_max: number }[];
  cuenta: { reserva_id: string } | null;
};

export const dinero = (n: number | string) =>
  Number(n).toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

export const totalLinea = (l: Pick<LineaEstimado, "cantidad" | "precio_min" | "precio_max">) => ({
  min: Math.round(Number(l.cantidad) * Number(l.precio_min) * 100) / 100,
  max: Math.round(Number(l.cantidad) * Number(l.precio_max) * 100) / 100,
});

export function etiquetaBandera(b: string | null) {
  return b === "alto" ? "Alto" : b === "bajo" ? "Bajo" : b === "normal" ? "Normal" : "";
}

/** wa.me al dueño (10 dígitos guardados, México) con el texto ya escrito. */
export function wa(telefono: string | null | undefined, mensaje: string): string | null {
  const t = String(telefono ?? "").replace(/\D/g, "");
  if (t.length < 10) return null;
  return `https://wa.me/52${t.slice(-10)}?text=${encodeURIComponent(mensaje)}`;
}
