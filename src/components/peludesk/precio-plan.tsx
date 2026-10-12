import { pesos, SIN_COSTO_INICIAL, type PlanUnico } from "@/lib/peludesk/plan";

/**
 * El precio del plan único: «$649» grande, «+ IVA» chico al lado y, debajo,
 * «Sin costo inicial · Todos los módulos». Nunca una cifra escrita aquí: viene de planUnico().
 */
export function PrecioPlan({
  plan,
  tamano = "grande",
  oscuro = false,
  desglose = false,
  className = "",
}: {
  plan: PlanUnico;
  tamano?: "grande" | "mediano";
  oscuro?: boolean;
  desglose?: boolean;
  className?: string;
}) {
  const principal = oscuro ? "text-white" : "text-n-900";
  const suave = oscuro ? "text-crema/80" : "text-n-600";
  return (
    <div className={className}>
      <p className={`flex flex-wrap items-baseline gap-x-2 ${principal}`}>
        <span className={`font-bold tabular-nums tracking-[-0.03em] ${tamano === "grande" ? "text-5xl md:text-6xl" : "text-3xl"}`}>{pesos(plan.mensual)}</span>
        <span className={`text-sm font-semibold ${suave}`}>+ IVA</span>
        <span className={`text-sm font-medium ${suave}`}>al mes</span>
      </p>
      <p className={`mt-1 text-sm font-semibold ${oscuro ? "text-menta" : "text-menta-oscuro"}`}>{SIN_COSTO_INICIAL}</p>
      {desglose && (
        <p className={`mt-1 text-sm tabular-nums ${suave}`}>
          {pesos(plan.mensual)} + IVA {pesos(plan.iva)} = {pesos(plan.total)} al mes
        </p>
      )}
    </div>
  );
}
