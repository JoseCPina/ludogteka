import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ETIQUETA_ESTADO_TICKET } from "@/lib/soporte/textos";
import { ControlesTicket } from "./controles";

type Detalle = {
  ticket: {
    id: string; numero: number; asunto: string; estado: string; rol: string; pantalla: string | null; navegador: string | null;
    captura_path: string | null; articulo_propuesto: string | null; sin_documentar: boolean; created_at: string; negocio_id: string;
  };
  negocio: { id: string; nombre: string; slug: string };
  persona: string;
  mensajes: { autor: string; texto: string; origen: string; created_at: string }[];
  conversacion: { quien: string; texto: string; articulos: string[]; sin_respuesta: boolean }[];
};

const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso));

export default async function TicketPlataforma({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await exigirPlataforma();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await supabase.rpc("plataforma_ticket", { p_ticket_id: id });
  const d = data as Detalle | null;
  if (!d) notFound();
  // La captura la firma el servidor, ya comprobada la sesión de plataforma.
  let captura: string | null = null;
  if (d.ticket.captura_path?.startsWith(`${d.ticket.negocio_id}/`)) {
    const { data: firmada } = await createSupabaseAdminClient(d.ticket.negocio_id).storage.from("soporte-capturas").createSignedUrl(d.ticket.captura_path, 600);
    captura = firmada?.signedUrl ?? null;
  }
  const t = d.ticket;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/plataforma/soporte" className="text-sm font-semibold text-morado hover:underline">← Soporte</Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">
          {d.negocio.nombre} · #{t.numero} · {t.asunto}
        </h1>
        <p className="mt-1 text-sm text-n-600">
          {ETIQUETA_ESTADO_TICKET[t.estado]} · {d.persona} ({t.rol === "admin" ? "admin" : "recepción"}) · {fecha(t.created_at)}
          {t.sin_documentar ? " · el asistente no lo encontró en la documentación" : ""}
        </p>
        <p className="mt-1 text-xs text-n-500">
          Pantalla: {t.pantalla ?? "—"} · Navegador: {t.navegador ?? "—"}
        </p>
      </div>
      <ol className="flex max-w-2xl flex-col gap-3">
        {d.mensajes.map((m, i) => (
          <li key={i} className={`rounded-lg p-3 ${m.autor === "plataforma" ? "border border-morado bg-morado-suave" : "border border-n-200 bg-white"}`}>
            <p className="text-xs font-semibold text-n-600">
              {m.autor === "plataforma" ? `PeluDesk (${m.origen})` : d.persona} · {fecha(m.created_at)}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-n-900">{m.texto}</p>
          </li>
        ))}
      </ol>
      {captura && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={captura} alt="Captura del ticket" className="max-w-2xl rounded-lg border border-n-200" />
      )}
      {d.conversacion.length > 0 && (
        <details className="max-w-2xl rounded-lg border border-n-200 bg-white p-3">
          <summary className="cursor-pointer font-semibold text-n-900">Lo que platicó con el asistente ({d.conversacion.length} mensajes)</summary>
          <ol className="mt-2 flex flex-col gap-2 text-sm">
            {d.conversacion.map((m, i) => (
              <li key={i}>
                <strong>{m.quien === "persona" ? d.persona : "Asistente"}:</strong> {m.texto}
                {m.articulos.length ? ` [${m.articulos.join(", ")}]` : ""}
                {m.sin_respuesta ? " (sin documentación)" : ""}
              </li>
            ))}
          </ol>
        </details>
      )}
      <ControlesTicket ticketId={t.id} estado={t.estado} propuesta={t.articulo_propuesto} />
    </div>
  );
}
