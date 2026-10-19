// Control de concurrencia optimista (QA N43, 18 de octubre de 2026). Sin imports de valores: lo usan el
// navegador, el servidor y las pruebas.
//
// La pantalla guarda la versión (updated_at) de cada registro que edita EN EL MOMENTO EN QUE LO LEYÓ y la manda
// al guardar; la base (disparador `concurrencia_antes`) no guarda si el registro cambió desde entonces y responde
// con quién, cuándo y qué cambió. Guardar encima es una segunda llamada con `forzar`, y queda en la bitácora.

export const ENCABEZADO_VERSION = "x-peludesk-version";
export const ENCABEZADO_FORZAR = "x-peludesk-forzar";

export type VersionLeida = { t: string; i: string; v: string | null | undefined };

export type ControlVersion = { versiones?: VersionLeida[]; forzar?: boolean };

export type Conflicto = {
  tabla: string;
  id: string;
  quien: string | null;
  cuando: string | null;
  cambios: Record<string, [unknown, unknown]>;
  versionActual: string | null;
  /** Lo que la acción agrega (p. ej. «total $900» de la cuenta). */
  extra?: string[];
};

/** Lo que cada edición que puede chocar devuelve. */
export type ConConflicto = { conflicto?: Conflicto | null };

export function version(t: string, i: string | null | undefined, v: string | null | undefined): VersionLeida[] {
  return i && v ? [{ t, i, v }] : [];
}

export function valorEncabezado(control?: ControlVersion | null): string | null {
  const vs = (control?.versiones ?? []).filter((x) => x && x.t && x.i && x.v);
  return vs.length ? JSON.stringify(vs) : null;
}

const ETIQUETA_CAMPO: Record<string, string> = {
  fecha_entrada: "entrada",
  fecha_salida: "salida",
  estado: "estado",
  servicio_id: "servicio",
  precio_unitario: "precio",
  precio: "precio",
  precio_base: "precio",
  recargo: "recargo",
  inicio: "fecha y hora",
  fin: "hora de término",
  inicia: "fecha y hora",
  termina: "hora de término",
  empleado_id: "estilista",
  medico_id: "médico",
  nombre: "nombre",
  nombre_completo: "nombre",
  telefono: "teléfono",
  correo: "correo",
  direccion: "dirección",
  notas: "notas",
  raza: "raza",
  raza_id: "raza",
  tamano_id: "tamaño",
  pelaje_id: "pelaje",
  fecha_nacimiento: "fecha de nacimiento",
  sexo: "sexo",
  peso: "peso",
  monto: "monto",
  importe: "monto",
  cancelado_at: "cancelado",
  deleted_at: "eliminado",
  anulado_at: "anulado",
  anulada_at: "anulada",
  revocado_at: "permiso",
  horas: "horas",
  evaluacion_comportamiento: "evaluación de comportamiento",
  evaluado_at: "evaluación de comportamiento",
  datos: "contenido",
  textos: "textos",
  hora_apertura: "apertura",
  hora_cierre: "cierre",
  cupo_diurno: "cupo de día",
  cupo_nocturno: "cupo de noche",
};

const ETIQUETA_ESTADO: Record<string, string> = {
  reservada: "reservada",
  confirmada: "confirmada",
  en_curso: "en curso",
  finalizada: "finalizada",
  cancelada: "cancelada",
  no_llego: "no llegó",
  borrador: "borrador",
  firmada: "firmada",
  programada: "programada",
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DINERO = /^(precio|monto|importe|recargo|total|subtotal|saldo)/;

function fechaCorta(iso: string, zona?: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [, m, d] = iso.split("-");
    return `${Number(d)} ${MESES[Number(m) - 1]}`;
  }
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("es-MX", { timeZone: zona, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
      .format(f)
      .replace(".", "");
  } catch {
    return iso;
  }
}

function dineroTexto(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** Un cambio en palabras: «salida 21 oct», «precio $300», «estado cancelada». null si no se puede decir bien. */
export function describirCambio(campo: string, ahora: unknown, zona?: string): string | null {
  // Lo interno (quién autorizó, quién creó, de qué negocio) no le dice nada a quien ve el aviso.
  if (/_por(_id)?$/.test(campo) || ["created_by", "negocio_id", "id"].includes(campo)) return null;
  const etiqueta = ETIQUETA_CAMPO[campo] ?? campo.replace(/_id$/, "").replace(/_/g, " ");
  if (ahora === null || ahora === undefined || ahora === "") {
    if (/_at$/.test(campo)) return null;
    return `${etiqueta} sin valor`;
  }
  if (/_at$/.test(campo)) return etiqueta;
  if (typeof ahora === "boolean") return `${etiqueta}: ${ahora ? "sí" : "no"}`;
  if (typeof ahora === "number" || (typeof ahora === "string" && /^-?\d+(\.\d+)?$/.test(ahora))) {
    const n = Number(ahora);
    return DINERO.test(campo) ? `${etiqueta} ${dineroTexto(n)}` : `${etiqueta} ${n}`;
  }
  if (typeof ahora === "string") {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(ahora)) return `cambió ${etiqueta}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(ahora)) return `${etiqueta} ${fechaCorta(ahora, zona)}`;
    if (campo === "estado") return `estado ${ETIQUETA_ESTADO[ahora] ?? ahora}`;
    return ahora.length <= 40 ? `${etiqueta} «${ahora}»` : `cambió ${etiqueta}`;
  }
  return `cambió ${etiqueta}`;
}

export function haceCuanto(iso: string | null, ahora = Date.now()): string {
  if (!iso) return "hace un momento";
  const s = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 1000));
  if (s < 60) return s <= 5 ? "hace un momento" : `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "hace 1 día" : `hace ${d} días`;
}

/**
 * El aviso completo: «Ana cambió esta reserva hace 2 min: salida 21 oct, total $900. ¿Recargar con sus cambios o
 * guardar los tuyos encima?». `registro` es «esta reserva», «esta cita», «este cliente»…
 */
export function textoConflicto(c: Conflicto, registro: string, zona?: string, ahora = Date.now()): string {
  const quien = c.quien?.trim() || "Alguien más";
  const partes = Object.entries(c.cambios ?? {})
    .map(([campo, par]) => describirCambio(campo, Array.isArray(par) ? par[1] : par, zona))
    .filter((x): x is string => !!x);
  const unicos = [...new Set(partes)].slice(0, 4);
  const todo = [...unicos, ...(c.extra ?? [])];
  const que = todo.length ? `: ${todo.join(", ")}` : "";
  return `${quien} cambió ${registro} ${haceCuanto(c.cuando ?? c.versionActual, ahora)}${que}. ¿Recargar con sus cambios o guardar los tuyos encima?`;
}

/** Del error de la base (PT409 / HTTP 409), el conflicto. null si no es un conflicto de versión. */
export function conflictoDeError(error: { code?: string; details?: string | null; hint?: string | null } | null | undefined): Conflicto | null {
  if (!error || (error.code !== "PT409" && error.hint !== "conflicto_version")) return null;
  let d: Record<string, unknown> = {};
  try {
    d = JSON.parse(error.details ?? "{}");
  } catch {
    d = {};
  }
  return {
    tabla: String(d.tabla ?? ""),
    id: String(d.id ?? ""),
    quien: (d.quien as string | null) ?? null,
    cuando: (d.cuando as string | null) ?? (d.version_actual as string | null) ?? null,
    cambios: (d.cambios as Conflicto["cambios"]) ?? {},
    versionActual: (d.version_actual as string | null) ?? null,
  };
}
