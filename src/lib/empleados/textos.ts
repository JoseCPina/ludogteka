// Textos y formatos de la sección de Empleados: un solo lugar para cómo se
// dice cada estado, tipo de ausencia o forma de pago.

export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// "Ausencias", no "permisos": permisos ya es otra cosa en la app.
export const TIPOS_AUSENCIA: Record<string, string> = {
  vacaciones: "Vacaciones",
  incapacidad: "Incapacidad",
  dia_personal: "Día personal",
  falta_justificada: "Falta justificada",
};

export const ESTADOS_AUSENCIA: Record<string, { etiqueta: string; estilo: string }> = {
  solicitada: { etiqueta: "Por aprobar", estilo: "bg-ambar-suave text-ambar-oscuro" },
  aprobada: { etiqueta: "Aprobada", estilo: "bg-menta-suave text-menta-oscuro" },
  rechazada: { etiqueta: "Rechazada", estilo: "bg-n-100 text-n-600" },
  cancelada: { etiqueta: "Cancelada", estilo: "bg-n-100 text-n-600" },
};

// Estado de un día contra su horario (asistencia_periodo / dias_asistencia_interno).
export const ESTADOS_DIA: Record<string, { etiqueta: string; estilo: string }> = {
  a_tiempo: { etiqueta: "A tiempo", estilo: "bg-menta-suave text-menta-oscuro" },
  retardo: { etiqueta: "Retardo", estilo: "bg-ambar-suave text-ambar-oscuro" },
  extra: { etiqueta: "Vino sin tocarle", estilo: "bg-morado-suave text-morado-oscuro" },
  ausencia: { etiqueta: "Ausencia", estilo: "bg-menta-suave text-menta-oscuro" },
  descanso: { etiqueta: "Descanso", estilo: "bg-n-100 text-n-600" },
  programado: { etiqueta: "Programado", estilo: "bg-n-100 text-n-600" },
  pendiente: { etiqueta: "Por llegar", estilo: "bg-n-100 text-n-700" },
  falta: { etiqueta: "Falta", estilo: "bg-coral-suave text-coral-oscuro" },
};

export const ORIGEN_REGISTRO: Record<string, string> = {
  propio: "desde su cuenta",
  recepcion: "capturó recepción",
  admin: "capturó admin",
};

export const PERIODICIDADES: Record<string, string> = {
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
};

export const METODOS_PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  otro: "Otro",
};

// Tolerancia antes de contar retardo: la misma que usa la base
// (dias_asistencia_interno). Solo para textos.
export const MINUTOS_TOLERANCIA = 10;

export function moneda(n: number | string | null | undefined): string {
  return Number(n ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

// 25 → "25 min"; 95 → "1 h 35 min".
export function minutos(n: number | null | undefined): string {
  const m = Number(n ?? 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

// "19:06:00" → "07:06 p.m.", igual que horaLocalDeInstante, para que el
// horario y lo registrado se lean en el mismo formato.
export function hora(t: string | null | undefined): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(2000, 0, 1, h, m));
}

// "HH:MM" para un <input type="time">.
export function horaCampo(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}

// 1 → "1 retardo"; 3 → "3 retardos".
export function plural(n: number, singular: string, plural_?: string): string {
  return `${n} ${n === 1 ? singular : plural_ ?? `${singular}s`}`;
}

// El periodo de nómina por omisión: la quincena en curso.
export function quincenaDe(fecha: string): { desde: string; hasta: string } {
  const [y, m, d] = fecha.split("-").map(Number);
  const mes = String(m).padStart(2, "0");
  if (d <= 15) return { desde: `${y}-${mes}-01`, hasta: `${y}-${mes}-15` };
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${y}-${mes}-16`, hasta: `${y}-${mes}-${String(ultimo).padStart(2, "0")}` };
}

export function textoEsquema(e: {
  sueldo_monto: number | null;
  sueldo_periodicidad: string | null;
  pago_por_dia: number | null;
  con_comision: boolean;
  comision_tipo: string | null;
  comision_valor: number | null;
  recibe_propinas: boolean;
}): string {
  const partes: string[] = [];
  if (e.sueldo_monto) partes.push(`Sueldo ${PERIODICIDADES[e.sueldo_periodicidad ?? ""]?.toLowerCase() ?? ""} de ${moneda(e.sueldo_monto)}`);
  if (e.pago_por_dia) partes.push(`${moneda(e.pago_por_dia)} por día trabajado`);
  if (e.con_comision) {
    partes.push(
      e.comision_tipo
        ? `comisión de ${e.comision_tipo === "porcentaje" ? `${Number(e.comision_valor)}%` : moneda(e.comision_valor)} por servicio (salvo regla propia del servicio)`
        : "comisión según la regla de cada servicio"
    );
  }
  partes.push(e.recibe_propinas ? "recibe propinas" : "sin propinas");
  return partes.join(" + ").replace(/^./, (c) => c.toUpperCase());
}
