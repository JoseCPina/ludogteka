// Mensaje cuando una mascota ya tiene una reserva que choca con las fechas pedidas (QA externa B17: decía
// «Revisa el calendario» y el calendario no existía). Termina con la ruta del calendario en la fecha que choca
// (o sin fecha si no se sabe): `TextoConEnlaces` la vuelve el enlace «el calendario».
export function mensajeTraslape(fecha?: string | null): string {
  const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `?dia=${fecha}` : "";
  return `Este perro ya tiene una reserva en fechas que se traslapan con estas. Revisa qué hay ese día en /reservas/calendario${dia}`;
}
