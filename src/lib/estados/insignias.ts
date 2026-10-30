// La insignia de estado de una cita de estética, una estancia o una reserva: el MISMO texto y color en la agenda, el
// calendario, la serie y el detalle (QA R59, N146: el detalle de una cita finalizada no decía su estado; cada pantalla
// tenía su copia de estas dos tablas y el detalle ninguna). Las citas de Veterinaria usan ESTADOS_CITA de
// src/lib/veterinaria/expediente.ts (su primer estado es «programada»).
export const ETIQUETA_ESTADO: Record<string, string> = {
  reservada: "Reservada",
  confirmada: "Confirmada",
  en_curso: "En curso",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
  no_llego: "No llegó",
};

export const ESTILO_ESTADO: Record<string, string> = {
  reservada: "bg-n-100 text-n-700",
  confirmada: "bg-morado-suave text-morado",
  en_curso: "bg-menta-suave text-menta-oscuro",
  finalizada: "bg-n-100 text-n-600",
  cancelada: "bg-coral-suave text-coral-oscuro",
  no_llego: "bg-coral-suave text-coral-oscuro",
  _: "bg-n-100 text-n-700",
};

export const etiquetaEstado = (estado: string) => ETIQUETA_ESTADO[estado] ?? estado;
export const estiloEstado = (estado: string) => ESTILO_ESTADO[estado] ?? ESTILO_ESTADO._;
