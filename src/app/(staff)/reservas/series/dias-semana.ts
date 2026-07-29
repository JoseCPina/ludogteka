// 1 = lunes … 7 = domingo, mismo criterio que extract(isodow from fecha)
// usado en toda la base (ver generar_estancias_serie).
export const DIAS_SEMANA = [
  { valor: 1, corta: "Lun", larga: "Lunes" },
  { valor: 2, corta: "Mar", larga: "Martes" },
  { valor: 3, corta: "Mié", larga: "Miércoles" },
  { valor: 4, corta: "Jue", larga: "Jueves" },
  { valor: 5, corta: "Vie", larga: "Viernes" },
  { valor: 6, corta: "Sáb", larga: "Sábado" },
  { valor: 7, corta: "Dom", larga: "Domingo" },
] as const;

export function formatearDiasSemana(dias: number[]): string {
  return DIAS_SEMANA.filter((d) => dias.includes(d.valor))
    .map((d) => d.corta)
    .join(", ");
}
