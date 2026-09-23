import { formatearFechaCalendario } from "@/lib/formato";
import type { EstadoRequisitoItem } from "@/app/(staff)/perros/resumen-sanitario";
import { ProponerComprobante } from "./proponer-comprobante";

// Lo que el dueño propuso desde el portal para cada requisito: le sirve
// para saber si ya lo revisaron y, si lo rechazaron, por qué.
export type PropuestaCliente = {
  id: string;
  tipo_requisito_id: string;
  fecha_aplicacion: string;
  estado: "pendiente" | "confirmado" | "rechazado";
  motivo_rechazo: string | null;
  created_at: string;
  revisado_at: string | null;
};

export type TipoRequisitoCliente = { id: string; categoria: "vacuna" | "desparasitacion" };

// Mismo dato que ve recepción, redactado para el dueño: un recordatorio
// útil ("resuélvelo con tu veterinario antes de tu próxima visita"), no un
// regaño ni la razón de un bloqueo. Y desde aquí mismo puede adelantar
// el trámite: sube la foto del comprobante y recepción la confirma.
function mensaje(item: EstadoRequisitoItem): string {
  const etiqueta = item.etiqueta;
  if (item.estado === "sin_registro") {
    return `Todavía no tenemos registro de ${etiqueta.toLowerCase()}. Si ya la tiene, súbenos la foto del comprobante aquí mismo; si no, coméntalo con tu veterinario.`;
  }
  if (item.estado === "vencida") {
    return `${etiqueta} venció el ${formatearFechaCalendario(item.fecha_vencimiento!)}. Si ya la renovaron, súbenos el comprobante; si no, vale la pena ponerla al día antes de tu próxima visita.`;
  }
  return `${etiqueta} vence pronto, el ${formatearFechaCalendario(item.fecha_vencimiento!)}. Buen momento para agendar con tu veterinario, y cuando la apliquen nos subes el comprobante aquí.`;
}

export function RecordatorioSanitario({
  items,
  perroId,
  puedeProponer,
  propuestas = [],
  tipos = [],
}: {
  items: EstadoRequisitoItem[];
  perroId: string;
  // Solo el dueño principal manda comprobantes; un acceso compartido solo lee.
  puedeProponer: boolean;
  propuestas?: PropuestaCliente[];
  tipos?: TipoRequisitoCliente[];
}) {
  const pendientes = items.filter((i) => i.estado !== "vigente");

  if (pendientes.length === 0) {
    return <p className="text-sm text-verde-oscuro">Vacunas y desparasitación al día.</p>;
  }

  // La propuesta más reciente de cada tipo es la que cuenta: una pendiente
  // se está revisando; una rechazada explica por qué y deja mandar otra.
  const ultimaPorTipo = new Map<string, PropuestaCliente>();
  for (const p of [...propuestas].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (!ultimaPorTipo.has(p.tipo_requisito_id)) ultimaPorTipo.set(p.tipo_requisito_id, p);
  }
  const categoriaDe = (tipoId: string) => tipos.find((t) => t.id === tipoId)?.categoria ?? "vacuna";

  return (
    <div className="rounded-md bg-azul-suave p-3 text-sm text-azul-oscuro">
      <p className="font-semibold">Para tu próxima visita:</p>
      <ul className="mt-1 flex flex-col gap-3 pl-5">
        {pendientes.map((item) => {
          const propuesta = ultimaPorTipo.get(item.tipo_requisito_id);
          const enRevision = propuesta?.estado === "pendiente";
          const rechazada = propuesta?.estado === "rechazado";
          return (
            <li key={item.tipo_requisito_id} className="list-disc">
              <p>{mensaje(item)}</p>
              {enRevision && (
                <p className="mt-1 rounded-md bg-white/70 px-2 py-1 font-semibold">
                  Nos mandaste el comprobante el {formatearFechaCalendario(propuesta.created_at.slice(0, 10))} (aplicación
                  del {formatearFechaCalendario(propuesta.fecha_aplicacion)}). Recepción lo está revisando; en cuanto lo
                  confirme contra el documento, queda registrado.
                </p>
              )}
              {rechazada && (
                <p className="mt-1 rounded-md bg-amarillo-suave px-2 py-1 font-semibold text-amarillo-oscuro">
                  Recepción no pudo confirmar el comprobante que mandaste: {propuesta.motivo_rechazo}. Puedes mandar otro.
                </p>
              )}
              {puedeProponer && !enRevision && (
                <ProponerComprobante
                  perroId={perroId}
                  tipoRequisitoId={item.tipo_requisito_id}
                  etiqueta={item.etiqueta}
                  categoria={categoriaDe(item.tipo_requisito_id)}
                  textoBoton={rechazada ? "Mandar otro comprobante" : "Subir el comprobante"}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
