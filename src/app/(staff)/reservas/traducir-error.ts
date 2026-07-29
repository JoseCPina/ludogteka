// Helper puro, sin "use server": un archivo "use server" solo puede
// exportar funciones async (son server actions), y esta no lo es. Vivía
// dentro de reserva-actions.ts hasta que checkin-actions.ts también la
// necesitó — exportarla desde ahí tronaba el build entero con "Server
// Actions must be async functions".
//
// El trigger de la base ya devuelve mensajes en español para sus propios
// RAISE EXCEPTION (código P0001) — no hay que traducir eso, solo pasarlo
// tal cual. Lo que sí necesita traducción es el texto crudo de Postgres
// para restricciones que el trigger no controla directamente (el EXCLUDE
// de traslape de perro/empleado).
export function traducirError(error: { code?: string; message: string }): string {
  if (error.code === "23P01") {
    return "Este perro ya tiene una reserva en fechas que se traslapan con estas. Revisa el calendario antes de intentar de nuevo.";
  }
  if (error.code === "P0001") {
    return error.message;
  }
  return "No pudimos guardar esto. Intenta de nuevo.";
}
