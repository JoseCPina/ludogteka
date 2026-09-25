// El error de la base, dicho para quien apretó el botón. Las funciones de
// Empleados ya lanzan su mensaje en español (P0001); lo demás se traduce.
export function mensajeDeError(error: { code?: string; message: string } | null): string | null {
  if (!error) return null;
  if (error.code === "P0001") return error.message;
  if (error.code === "42501") return "No tienes permiso para hacer esto.";
  if (error.code === "23505") return "Eso ya existe: revisa que no esté capturado dos veces (por ejemplo, una cuenta ligada a otro empleado).";
  if (error.code === "23514") return "Revisa los datos: alguno no es válido (fechas al revés, montos en cero o una forma de pago sin datos).";
  console.error("[empleados]", error);
  return "No pudimos guardar esto. Intenta de nuevo.";
}
