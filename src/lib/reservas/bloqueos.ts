// Qué bloqueo trae un rechazo de la base, leído del mensaje del trigger. Solo los dos con excepción se ofrecen
// para reintentar; celo, gestación y agresividad no tienen excepción y se quedan como rechazo.
//
// B-excepción (QA externa, 15 de octubre de 2026): el mensaje de vacunas pasó a decir «Falta Bordetella vigente de
// Nina.» (migración 20261024000000) y ya no contenía la palabra «sanitario» que esta función buscaba, así que el
// control de la excepción dejó de salir. Se reconoce por lo que el mensaje SIEMPRE dice: que una excepción con
// motivo lo desbloquea, y por qué falta (requisito sanitario o vacuna vigente).
export function tipoDeBloqueo(motivo: string | null): "sanitario" | "comportamiento" | null {
  const m = (motivo ?? "").toLowerCase();
  if (m.includes("evaluación previa de comportamiento") || m.includes("evaluacion previa de comportamiento")) {
    return "comportamiento";
  }
  if (m.includes("sanitario")) return "sanitario";
  if (m.includes("excepción con motivo") && /\b(falta|faltan)\b.*\bvigentes?\b/.test(m)) return "sanitario";
  return null;
}
