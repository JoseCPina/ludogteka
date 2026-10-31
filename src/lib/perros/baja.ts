// La baja de una mascota (31 de octubre de 2026): motivos y textos que comparten la ficha del personal, la ficha del
// dueño, el portal y el tablero. Sin imports: lo usan servidor y navegador. La regla vive en la base
// (perro_dar_de_baja, perro_reactivar, portal_solicitar_baja_mascota) y en docs/baja-de-mascotas.md.
export type MotivoBaja = "error" | "ya_no_viene" | "fallecio" | "cambio_dueno";

export const MOTIVOS_BAJA: { clave: MotivoBaja; nombre: string }[] = [
  { clave: "error", nombre: "Se capturó por error" },
  { clave: "ya_no_viene", nombre: "Ya no viene" },
  { clave: "fallecio", nombre: "Falleció" },
  { clave: "cambio_dueno", nombre: "Cambió de dueño" },
];

export const esMotivoBaja = (v: unknown): v is MotivoBaja => typeof v === "string" && MOTIVOS_BAJA.some((m) => m.clave === v);
export const nombreMotivoBaja = (v: string | null | undefined): string => MOTIVOS_BAJA.find((m) => m.clave === v)?.nombre ?? "Sin motivo registrado";

/** Lo que devuelve perro_baja_resumen: lo vivo (bloquea), el historial (decide), series, pases y la solicitud del dueño. */
export type ResumenBaja = {
  activa: boolean;
  baja_at: string | null;
  baja_motivo: MotivoBaja | null;
  baja_nota: string | null;
  baja_por: string | null;
  fallecido: boolean;
  vivos: { tipo: string; n: number; ruta: string }[];
  historial: { tipo: string; n: number }[];
  tiene_historial: boolean;
  series_activas: number;
  pases_con_saldo: { id: string; disponibles: number; total: number; vence: string | null; servicio: string }[];
  solicitud_pendiente: { id: string; motivo: MotivoBaja; nota: string | null; pedida_at: string } | null;
};

/** «1 cita de estética y 2 reservas o estancias de guardería u hotel sin terminar». */
export function textoVivos(vivos: ResumenBaja["vivos"]): string {
  return vivos.map((x) => `${x.n} ${x.tipo}${x.n === 1 ? "" : "s"}`).join(" y ");
}
