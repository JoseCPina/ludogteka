// Mensaje cuando una mascota ya tiene una reserva que choca con las fechas pedidas (QA externa B17: decía
// «Revisa el calendario» y el calendario no existía). Termina con la ruta del calendario en la fecha que choca
// (o sin fecha si no se sabe): `TextoConEnlaces` la vuelve el enlace «el calendario».
export function mensajeTraslape(fecha?: string | null): string {
  const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `?dia=${fecha}` : "";
  return `Este perro ya tiene una reserva en fechas que se traslapan con estas. Revisa qué hay ese día en /reservas/calendario${dia}.`;
}

// B21: el mensaje dice CON QUÉ reserva choca (mascota, módulo, fechas y
// estado) y lleva al día correcto. `estancia_que_choca` lo trae de la base.
export type EstanciaQueChoca = {
  estancia_id: string;
  reserva_id?: string | null;
  perro: string;
  modulo: string;
  servicio: string;
  entrada: string;
  salida: string;
  estado: string;
  dia: string;
};

const ESTADO_TEXTO: Record<string, string> = {
  reservada: "reservada",
  confirmada: "confirmada",
  en_curso: "en curso",
};

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" }).format(new Date(a, m - 1, d));
}

export function mensajeTraslapeConDetalle(c: EstanciaQueChoca): string {
  const modulo = c.modulo === "hotel" ? "hotel" : "guardería";
  const rango = c.modulo === "hotel" && c.salida !== c.entrada
    ? `del ${fechaCorta(c.entrada)} al ${fechaCorta(c.salida)}`
    : `el ${fechaCorta(c.entrada)}`;
  const estado = ESTADO_TEXTO[c.estado] ?? c.estado;
  // Termina con punto, y las dos rutas se vuelven enlaces (TextoConEnlaces): la reserva que choca y el calendario.
  const abrir = c.reserva_id ? `Ábrela en /reservas/${c.reserva_id} o revisa` : "Revisa";
  return `${c.perro} ya tiene una reserva de ${modulo} ${rango} (${estado}) que se traslapa con estas fechas. ${abrir} qué hay ese día en /reservas/calendario?dia=${c.dia}.`;
}
