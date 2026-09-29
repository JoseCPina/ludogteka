import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { negocioActual } from "@/lib/negocio/actual";
import { formatearFecha } from "@/lib/formato";
import { Alert } from "@/components/ui/alert";
import { ETIQUETA_ESTADO_TICKET } from "@/lib/soporte/textos";
import { ResponderTicket } from "./responder";

// Un ticket y su hilo con PeluDesk. La RLS decide si se ve: recepción, los
// suyos; el admin, todos los del negocio. Abrirlo apaga el aviso de respuesta.
export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ creado?: string }> }) {
  const { id } = await params;
  const { creado } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const negocio = await negocioActual();
  const [{ data: t }, { data: mensajes }] = await Promise.all([
    supabase.from("soporte_tickets").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("soporte_ticket_mensajes").select("id, autor, texto, origen, created_at").eq("ticket_id", id).order("created_at"),
  ]);
  if (!t) notFound();
  if (t.profile_id === sesion?.user.id) await supabase.rpc("marcar_ticket_visto", { p_ticket_id: id });
  // La captura: la firma el servidor, solo si es de este negocio.
  let captura: string | null = null;
  if (t.captura_path && String(t.captura_path).startsWith(`${negocio.id}/`)) {
    const { data } = await createSupabaseAdminClient(negocio.id).storage.from("soporte-capturas").createSignedUrl(t.captura_path as string, 600);
    captura = data?.signedUrl ?? null;
  }
  const zona = negocio.zona_horaria;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/ayuda" className="text-sm font-semibold text-morado hover:underline">
          ← Ayuda
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">
          Ticket #{t.numero as number} · {t.asunto as string}
        </h1>
        <p className="mt-1 text-sm text-n-600">
          <span className="rounded-full bg-n-100 px-2 py-0.5 font-semibold text-n-700" data-estado-ticket={t.estado as string}>
            {ETIQUETA_ESTADO_TICKET[t.estado as string]}
          </span>{" "}
          · creado el {formatearFecha(t.created_at as string, zona)}
          {t.pantalla ? ` · desde ${t.pantalla as string}` : ""}
        </p>
      </div>
      {creado && (
        <Alert variante="exito" titulo="Listo, ya nos llegó">
          Te contestamos aquí. {sesion?.rol === "admin" ? "Y también te avisamos por WhatsApp." : ""}
        </Alert>
      )}
      <ol className="flex max-w-2xl flex-col gap-3" data-hilo-ticket>
        {(mensajes ?? []).map((m) => (
          <li
            key={m.id as string}
            data-autor={m.autor as string}
            className={`rounded-lg p-3 ${m.autor === "plataforma" ? "border border-morado bg-morado-suave" : "border border-n-200 bg-white"}`}
          >
            <p className="text-xs font-semibold text-n-600">
              {m.autor === "plataforma" ? "PeluDesk" : "Tu negocio"} · {formatearFecha(m.created_at as string, zona)}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-n-900">{m.texto as string}</p>
          </li>
        ))}
      </ol>
      {captura && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={captura} alt="Captura de pantalla que se mandó con el ticket" className="max-w-2xl rounded-lg border border-n-200" />
      )}
      <ResponderTicket ticketId={id} resuelto={t.estado === "resuelto"} />
    </div>
  );
}
