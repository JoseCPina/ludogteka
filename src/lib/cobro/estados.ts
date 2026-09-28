// Cómo se nombra cada estado de cobro (estado_cobro_en) en pantalla.
export const ESTADOS_COBRO: Record<string, { texto: string; clase: string }> = {
  exento: { texto: "Fuera del cobro", clase: "bg-n-100 text-n-700" },
  prueba: { texto: "En prueba", clase: "bg-morado-suave text-morado" },
  prueba_vencida: { texto: "Prueba vencida (solo lectura)", clase: "bg-ambar-suave text-ambar-oscuro" },
  al_corriente: { texto: "Al corriente", clase: "bg-menta-suave text-menta-oscuro" },
  gracia: { texto: "En gracia (pago fallido)", clase: "bg-ambar-suave text-ambar-oscuro" },
  solo_lectura: { texto: "En solo lectura (sin pago)", clase: "bg-coral-suave text-coral-oscuro" },
  cancelado: { texto: "Cancelado", clase: "bg-coral-suave text-coral-oscuro" },
  sin_cobro: { texto: "Activo sin cobro en línea", clase: "bg-n-100 text-n-700" },
};

export function estadoCobro(clave: string | null | undefined) {
  return ESTADOS_COBRO[clave ?? ""] ?? { texto: clave ?? "—", clase: "bg-n-100 text-n-700" };
}
