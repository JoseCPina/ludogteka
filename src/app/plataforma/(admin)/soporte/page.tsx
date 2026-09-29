import Link from "next/link";
import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { Alert } from "@/components/ui/alert";
import { ETIQUETA_ESTADO_TICKET } from "@/lib/soporte/textos";

type Fila = {
  id: string; negocio: string; slug: string; numero: number; asunto: string; estado: string; rol: string; persona: string;
  ultimo_de: string; ultimo_mensaje_at: string; sin_documentar: boolean;
};

const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso));

// Los tickets de todos los negocios: primero los que esperan respuesta de
// PeluDesk, del más viejo al más nuevo. También llegan a la bandeja de Telegram.
export default async function SoportePlataforma({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { supabase } = await exigirPlataforma();
  const { estado } = await searchParams;
  const filtro = estado && ["abierto", "en_proceso", "resuelto"].includes(estado) ? estado : null;
  const { data, error } = await supabase.rpc("plataforma_tickets", { p_estado: filtro });
  const filas = (data ?? []) as Fila[];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Soporte</h1>
        <p className="mt-1 text-n-600">Tickets de los negocios. Contesta aquí o respondiendo al aviso en Telegram.</p>
      </div>
      <nav className="flex flex-wrap gap-2 text-sm font-semibold">
        {[null, "abierto", "en_proceso", "resuelto"].map((e) => (
          <Link
            key={e ?? "todos"}
            href={e ? `/plataforma/soporte?estado=${e}` : "/plataforma/soporte"}
            className={`rounded-full px-3 py-1 ${filtro === e ? "bg-morado text-white" : "bg-n-100 text-n-700"}`}
          >
            {e ? ETIQUETA_ESTADO_TICKET[e] : "Todos"}
          </Link>
        ))}
      </nav>
      {error && <Alert variante="error" titulo="No se pudieron cargar">{error.message}</Alert>}
      {!error && filas.length === 0 && <p className="text-n-600">No hay tickets.</p>}
      <ul className="flex flex-col gap-2">
        {filas.map((t) => (
          <li key={t.id}>
            <Link href={`/plataforma/soporte/${t.id}`} className="flex flex-col gap-1 rounded-lg border border-n-200 bg-white px-4 py-3 hover:border-morado">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-n-900">
                  {t.negocio} · #{t.numero} · {t.asunto}
                </span>
                <span className="flex gap-2 text-xs">
                  {t.estado !== "resuelto" && t.ultimo_de === "negocio" && (
                    <span className="rounded-full bg-coral-suave px-2 py-0.5 font-semibold text-coral-oscuro">Espera respuesta</span>
                  )}
                  {t.sin_documentar && <span className="rounded-full bg-ambar-suave px-2 py-0.5 font-semibold text-ambar-oscuro">Sin documentar</span>}
                  <span className="rounded-full bg-n-100 px-2 py-0.5 font-semibold text-n-700">{ETIQUETA_ESTADO_TICKET[t.estado]}</span>
                </span>
              </span>
              <span className="text-sm text-n-600">
                {t.persona} ({t.rol === "admin" ? "admin" : "recepción"}) · último mensaje {fecha(t.ultimo_mensaje_at)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
