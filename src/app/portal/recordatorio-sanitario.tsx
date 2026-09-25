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
  aplica = true,
}: {
  items: EstadoRequisitoItem[];
  perroId: string;
  // Solo el dueño principal manda comprobantes; un acceso compartido solo lee.
  puedeProponer: boolean;
  propuestas?: PropuestaCliente[];
  tipos?: TipoRequisitoCliente[];
  // false = el perro solo viene a estética: los requisitos son de
  // guardería y hotel, así que no se le reclaman; solo se le avisa y se
  // le deja adelantarlos si quiere.
  aplica?: boolean;
}) {
  const pendientes = items.filter((i) => i.estado !== "vigente");

  if (!aplica) {
    return (
      <NotaEstetica
        pendientes={pendientes}
        perroId={perroId}
        puedeProponer={puedeProponer}
        propuestas={propuestas}
        tipos={tipos}
      />
    );
  }

  if (pendientes.length === 0) {
    return <p className="text-sm text-menta-oscuro">Vacunas y desparasitación al día.</p>;
  }

  // La propuesta más reciente de cada tipo es la que cuenta: una pendiente
  // se está revisando; una rechazada explica por qué y deja mandar otra.
  const ultimaPorTipo = new Map<string, PropuestaCliente>();
  for (const p of [...propuestas].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (!ultimaPorTipo.has(p.tipo_requisito_id)) ultimaPorTipo.set(p.tipo_requisito_id, p);
  }
  const categoriaDe = (tipoId: string) => tipos.find((t) => t.id === tipoId)?.categoria ?? "vacuna";

  return (
    <div className="rounded-md bg-morado-suave p-3 text-sm text-morado-oscuro">
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
                <p className="mt-1 rounded-md bg-ambar-suave px-2 py-1 font-semibold text-ambar-oscuro">
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

// La versión para un perro que solo viene a estética: nada en rojo, nada
// que "falte". Una nota discreta y, si quiere, adelantar las vacunas
// desde aquí mismo con el mismo mecanismo de comprobantes.
function NotaEstetica({
  pendientes,
  perroId,
  puedeProponer,
  propuestas,
  tipos,
}: {
  pendientes: EstadoRequisitoItem[];
  perroId: string;
  puedeProponer: boolean;
  propuestas: PropuestaCliente[];
  tipos: TipoRequisitoCliente[];
}) {
  const ultimaPorTipo = new Map<string, PropuestaCliente>();
  for (const p of [...propuestas].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (!ultimaPorTipo.has(p.tipo_requisito_id)) ultimaPorTipo.set(p.tipo_requisito_id, p);
  }
  const categoriaDe = (tipoId: string) => tipos.find((t) => t.id === tipoId)?.categoria ?? "vacuna";
  const enRevision = pendientes.filter((i) => ultimaPorTipo.get(i.tipo_requisito_id)?.estado === "pendiente");

  return (
    <div className="rounded-md border border-n-200 bg-n-50 p-3 text-sm text-n-600">
      <p>
        Por ahora viene solo a estética, así que no le pedimos vacunas ni desparasitación: puedes dejar esto en
        blanco. Si algún día quieres traerlo a guardería u hotel, ese día sí se las vamos a pedir
        {pendientes.length > 0 ? " (" + pendientes.map((i) => i.etiqueta.toLowerCase()).join(", ") + ")" : ""}.
      </p>
      {enRevision.length > 0 && (
        <p className="mt-2 font-semibold text-n-700">
          Ya nos mandaste {enRevision.length === 1 ? "el comprobante de " : "comprobantes de "}
          {enRevision.map((i) => i.etiqueta.toLowerCase()).join(", ")}; recepción lo está revisando.
        </p>
      )}
      {puedeProponer && pendientes.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer font-semibold text-morado hover:underline">
            Adelantarlo ahora: subir sus comprobantes
          </summary>
          <ul className="mt-2 flex flex-col gap-3 pl-1">
            {pendientes.map((item) => {
              const propuesta = ultimaPorTipo.get(item.tipo_requisito_id);
              if (propuesta?.estado === "pendiente") return null;
              return (
                <li key={item.tipo_requisito_id}>
                  <span className="font-semibold text-n-800">{item.etiqueta}</span>
                  {propuesta?.estado === "rechazado" && (
                    <span className="block text-ambar-oscuro">
                      Recepción no pudo confirmar el que mandaste: {propuesta.motivo_rechazo}.
                    </span>
                  )}
                  <ProponerComprobante
                    perroId={perroId}
                    tipoRequisitoId={item.tipo_requisito_id}
                    etiqueta={item.etiqueta}
                    categoria={categoriaDe(item.tipo_requisito_id)}
                    textoBoton={propuesta?.estado === "rechazado" ? "Mandar otro comprobante" : "Subir comprobante"}
                  />
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
