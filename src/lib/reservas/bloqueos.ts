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

/**
 * El texto de un bloqueo que ve cada quien. La base redacta el mensaje para todos («Un admin, o quien tenga el permiso
 * «Excepciones al reservar», puede autorizar una excepción con motivo»); a quien NO tiene ese permiso eso le ofrece algo
 * que no puede hacer (QA externa, 17 de octubre de 2026). Sin el permiso, el texto dice qué falta, que no se puede reservar
 * y a quién pedírselo; con el permiso se deja tal cual (ahí está la casilla de la excepción).
 */
export function textoDelBloqueo(motivo: string, puedeExcepcion: boolean): string {
  if (puedeExcepcion || !tipoDeBloqueo(motivo)) return motivo;
  const sinOferta = motivo
    .replace(/,\s*o un admin puede autorizar[^.]*\./i, ".")
    .replace(/\s*Un admin,\s*o quien tenga el permiso\s*«[^»]+»,\s*puede autorizar[^.]*\./i, "")
    .replace(/\s*Un admin puede autorizar[^.]*\./i, "")
    .trim();
  return `${sinOferta} No se puede reservar hasta que se resuelva. Si hace falta una excepción, pídesela a un admin o a quien tenga el permiso «Excepciones al reservar».`;
}
