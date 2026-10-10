// Lo que comparten las pantallas del carnet, los certificados y la hospitalización
// de Veterinaria: tipos de lo que devuelven las funciones de la base, etiquetas
// legibles y los mensajes de WhatsApp.

export type RegistroVacuna = {
  id: string;
  biologico: string;
  laboratorio: string | null;
  lote: string | null;
  dosis: string | null;
  fecha_aplicacion: string;
  proxima_dosis: string | null;
  vigente_hasta: string;
  estado: "vigente" | "por_vencer" | "vencida" | "anulada";
  medico: string | null;
  cedula: string | null;
  notas: string | null;
  anulada_motivo: string | null;
  anulada_at: string | null;
  cubre_requisito: boolean;
};

export type RegistroDesparasitacion = {
  id: string;
  tipo: "interna" | "externa" | "ambas";
  producto: string;
  lote: string | null;
  dosis: string | null;
  fecha_aplicacion: string;
  proxima_dosis: string | null;
  vigente_hasta: string;
  estado: "vigente" | "por_vencer" | "vencida" | "anulada";
  medico: string | null;
  notas: string | null;
  anulada_motivo: string | null;
  anulada_at: string | null;
};

export type CarnetCompleto = {
  vacunas: RegistroVacuna[];
  desparasitaciones: RegistroDesparasitacion[];
  recordatorios_apagados: boolean;
};

export const ESTADOS_CARNET: Record<string, { etiqueta: string; estilo: string }> = {
  vigente: { etiqueta: "Vigente", estilo: "bg-menta-suave text-menta-oscuro" },
  por_vencer: { etiqueta: "Por vencer", estilo: "bg-ambar-suave text-ambar-oscuro" },
  vencida: { etiqueta: "Vencida", estilo: "bg-coral-suave text-coral-oscuro" },
  anulada: { etiqueta: "Anulada", estilo: "bg-n-100 text-n-600" },
};

export const TIPOS_DESPARASITACION: Record<string, string> = { interna: "Interna", externa: "Externa", ambas: "Interna y externa" };

export const MOTIVOS_CERTIFICADO: { valor: string; etiqueta: string }[] = [
  { valor: "general", etiqueta: "Estado de salud en general" },
  { valor: "viaje", etiqueta: "Viaje" },
  { valor: "hospedaje", etiqueta: "Hospedaje o guardería" },
  { valor: "exposicion", etiqueta: "Exposición o concurso" },
  { valor: "otro", etiqueta: "Otro" },
];
export const ETIQUETA_MOTIVO_CERTIFICADO = Object.fromEntries(MOTIVOS_CERTIFICADO.map((m) => [m.valor, m.etiqueta]));

export const TIPOS_CONSENTIMIENTO: { valor: string; etiqueta: string }[] = [
  { valor: "hospitalizacion", etiqueta: "Hospitalización" },
  { valor: "cirugia", etiqueta: "Cirugía" },
  { valor: "anestesia", etiqueta: "Anestesia" },
  { valor: "eutanasia", etiqueta: "Eutanasia" },
];
export const ETIQUETA_CONSENTIMIENTO = Object.fromEntries(TIPOS_CONSENTIMIENTO.map((t) => [t.valor, t.etiqueta]));

/** Las variables que entiende un consentimiento, para la pantalla de plantillas. */
export const CAMPOS_CONSENTIMIENTO: { clave: string; etiqueta: string; ejemplo: string }[] = [
  { clave: "cliente_nombre", etiqueta: "Nombre del propietario", ejemplo: "Ana García López" },
  { clave: "mascota_nombre", etiqueta: "Nombre de la mascota", ejemplo: "Motita" },
  { clave: "especie", etiqueta: "Especie", ejemplo: "Perro" },
  { clave: "raza", etiqueta: "Raza", ejemplo: "Schnauzer" },
  { clave: "motivo", etiqueta: "Motivo de la hospitalización", ejemplo: "Gastroenteritis" },
  { clave: "procedimiento", etiqueta: "Procedimiento", ejemplo: "Esterilización" },
  { clave: "medico_nombre", etiqueta: "Nombre del médico veterinario", ejemplo: "Dra. Laura Pérez" },
  { clave: "medico_cedula", etiqueta: "Cédula profesional", ejemplo: "12345678" },
  { clave: "establecimiento", etiqueta: "Nombre del establecimiento", ejemplo: "Clínica Patitas" },
  { clave: "fecha", etiqueta: "Fecha", ejemplo: "15/10/2026" },
];

/** Llena las {{variables}} de un consentimiento. Una variable que no existe se deja a la vista. */
export function llenarConsentimiento(texto: string, campos: Record<string, string>): string {
  return texto.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (entero, clave: string) => campos[clave.toLowerCase()] ?? entero);
}

/** Variables que el texto usa y el sistema no sabe llenar. */
export function variablesDesconocidas(texto: string): string[] {
  const conocidas = new Set(CAMPOS_CONSENTIMIENTO.map((c) => c.clave));
  const vistas = new Set<string>();
  for (const m of texto.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) if (!conocidas.has(m[1].toLowerCase())) vistas.add(m[1]);
  return [...vistas];
}

export const TURNOS_MONITOREO: Record<string, string> = { matutino: "Matutino", vespertino: "Vespertino", nocturno: "Nocturno" };

/** El mensaje del recordatorio de próxima dosis (wa.me y plantilla comparten texto). */
export function mensajeRecordatorio(o: { dueno: string | null; mascota: string; negocio: string; detalle: string; cuando: string; tipo: string }): string {
  const saludo = o.dueno ? `Hola ${o.dueno}` : "Hola";
  const que = o.tipo === "vacuna" ? `la vacuna ${o.detalle}` : `la desparasitación (${o.detalle})`;
  return `${saludo}, de parte de ${o.negocio}: a ${o.mascota} le toca ${que} ${o.cuando}. ¿Quieres que agendemos su cita?`;
}

/** «hoy», «mañana», «en 5 días», «hace 3 días» a partir de la diferencia en días. */
export function cuandoEs(dias: number): string {
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  if (dias > 1) return `en ${dias} días`;
  if (dias === -1) return "desde ayer";
  return `desde hace ${-dias} días`;
}

export type ResultadoEnlace = { error: string | null; url?: string };
