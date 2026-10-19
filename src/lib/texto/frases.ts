// Unir frases sin duplicar la puntuación (QA N38/N40, 18 de octubre de 2026): «a las 11:00 a.m..» y
// «…(cobro de prueba).. No cuenta en la caja». Un texto que ya termina en punto, signo o puntos suspensivos
// —una hora «a.m.», un motivo que la persona escribió con punto— no lleva otro. Sin imports: la usan cliente,
// servidor y las pruebas. Todo mensaje que pega un texto libre, un motivo o una hora seguido de punto pasa por aquí.

const CIERRE = /[.!?…:;]["»”')\]]*$/;

/** La frase con UN cierre: si ya termina en . ! ? … (también «a.m.» o «(prueba).»), tal cual; si no, con punto. */
export function cerrarFrase(texto: string | null | undefined): string {
  const t = (texto ?? "").replace(/\s+$/, "").replace(/\.{2,}$/, ".");
  if (!t) return "";
  return CIERRE.test(t) ? t : `${t}.`;
}

/** Une frases con un espacio, cada una con un solo cierre. Los vacíos se saltan. */
export function unirFrases(...partes: (string | null | undefined | false)[]): string {
  return partes
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p, i, todas) => (i < todas.length - 1 || !/[?!]$/.test(p.trim()) ? cerrarFrase(p.trim()) : p.trim()))
    .join(" ");
}
