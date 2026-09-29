import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { articulosDelNegocio } from "@/lib/ayuda";
import { IndiceAyuda } from "@/components/ayuda/indice-ayuda";
import { Button } from "@/components/ui/button";
import { formatearFecha } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { ETIQUETA_ESTADO_TICKET } from "@/lib/soporte/textos";
import { Asistente } from "./asistente";


// Ayuda: los artículos de los módulos de ESTE negocio, el asistente y los
// tickets (recepción ve los suyos; el admin, todos los del negocio).
export default async function AyudaPage({ searchParams }: { searchParams: Promise<{ desde?: string }> }) {
  const { desde } = await searchParams;
  const sesion = await obtenerSesionConRol();
  const zona = await zonaActual();
  const supabase = await createSupabaseServerClient();
  const [{ data: tickets }, landing] = await Promise.all([
    supabase
      .from("soporte_tickets")
      .select("id, numero, asunto, estado, ultimo_de, ultimo_mensaje_at, visto_creador_at, profile_id")
      .is("deleted_at", null)
      .order("ultimo_mensaje_at", { ascending: false })
      .limit(30),
    cargarNegocioLanding(),
  ]);
  const articulos = articulosDelNegocio(sesion?.modulos ?? []);
  const pantalla = desde && desde.startsWith("/") ? desde.slice(0, 200) : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">Ayuda</h1>
          <p className="mt-1 text-n-600">Busca cómo hacer algo, pregúntale al asistente o escríbenos.</p>
        </div>
        <Link href={`/ayuda/tickets/nuevo${pantalla ? `?desde=${encodeURIComponent(pantalla)}` : ""}`}>
          <Button type="button" variante="secundario">Crear ticket</Button>
        </Link>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
        <h2 className="text-lg font-bold text-n-900">Asistente</h2>
        <Asistente pantalla={pantalla} disponible={landing.plan !== "demo"} />
      </section>

      {(tickets ?? []).length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold text-n-900">{sesion?.rol === "admin" ? "Tickets del negocio" : "Tus tickets"}</h2>
          <ul className="flex flex-col gap-2">
            {(tickets ?? []).map((t) => {
              const nueva = t.ultimo_de === "plataforma" && t.profile_id === sesion?.user.id && (!t.visto_creador_at || t.visto_creador_at < t.ultimo_mensaje_at);
              return (
                <li key={t.id as string}>
                  <Link href={`/ayuda/tickets/${t.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-n-200 bg-white px-4 py-3 hover:border-morado">
                    <span className="font-semibold text-n-900">
                      #{t.numero as number} · {t.asunto as string}
                    </span>
                    <span className="flex items-center gap-2 text-xs">
                      {nueva && <span className="rounded-full bg-coral-suave px-2 py-0.5 font-semibold text-coral-oscuro">Respuesta nueva</span>}
                      <span className="rounded-full bg-n-100 px-2 py-0.5 font-semibold text-n-700">{ETIQUETA_ESTADO_TICKET[t.estado as string]}</span>
                      <span className="text-n-500">{formatearFecha(t.ultimo_mensaje_at as string, zona)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Artículos</h2>
        <IndiceAyuda articulos={articulos} />
      </section>
    </div>
  );
}
