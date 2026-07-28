import { formatearFechaCalendario } from "@/lib/formato";
import type { EstadoRequisitoItem } from "@/app/(staff)/perros/resumen-sanitario";

// Mismo dato que ve recepción, redactado para el dueño: un recordatorio
// útil ("resuélvelo con tu veterinario antes de tu próxima visita"), no un
// regaño ni la razón de un bloqueo.
function mensaje(item: EstadoRequisitoItem): string {
  const etiqueta = item.etiqueta;
  if (item.estado === "sin_registro") {
    return `Todavía no tenemos registro de ${etiqueta.toLowerCase()} — coméntalo con tu veterinario y tráenos el comprobante cuando puedas.`;
  }
  if (item.estado === "vencida") {
    return `${etiqueta} venció el ${formatearFechaCalendario(item.fecha_vencimiento!)} — vale la pena ponerla al día con tu veterinario antes de tu próxima visita.`;
  }
  return `${etiqueta} vence pronto, el ${formatearFechaCalendario(item.fecha_vencimiento!)} — buen momento para agendar con tu veterinario.`;
}

export function RecordatorioSanitario({ items }: { items: EstadoRequisitoItem[] }) {
  const pendientes = items.filter((i) => i.estado !== "vigente");

  if (pendientes.length === 0) {
    return <p className="text-sm text-verde-oscuro">Vacunas y desparasitación al día.</p>;
  }

  return (
    <div className="rounded-md bg-azul-suave p-3 text-sm text-azul-oscuro">
      <p className="font-semibold">Para tu próxima visita:</p>
      <ul className="mt-1 list-disc pl-5">
        {pendientes.map((item) => (
          <li key={item.tipo_requisito_id}>{mensaje(item)}</li>
        ))}
      </ul>
    </div>
  );
}
