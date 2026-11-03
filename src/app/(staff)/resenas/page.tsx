import { redirect } from "next/navigation";
import { accesoDeSesion, puedeAbrir } from "@/lib/auth/acceso";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioActual, zonaActual } from "@/lib/negocio/actual";
import { fechaLocalDeInstante, formatearFechaCalendario } from "@/lib/formato";
import { Alert } from "@/components/ui/alert";
import { EnlacePestana } from "@/components/ui/enlace-pestana";
import { ResenaFila, type FilaResena } from "./resena-fila";

const FILTROS = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "sin_respuesta", etiqueta: "Sin respuesta" },
  { valor: "escondidas", etiqueta: "Escondidas" },
] as const;
type Filtro = (typeof FILTROS)[number]["valor"];

/**
 * Reseñas (ux/resenas-y-avisos-f3, 3 de noviembre de 2026): lo que opinan los dueños desde su app después de una visita
 * terminada. El negocio las lee, las contesta (la respuesta sale junto a la reseña en su página y en la app, y al dueño
 * le llega un aviso) y esconde las que no deben salir; las estrellas y el texto del dueño no se cambian (lo cuida la
 * base). Admin, o recepción con «Responder y esconder reseñas»; con el módulo Portal. Referencia: bloque de reseñas de
 * shadcn/studio (lista con estrellas) y Mobbin «reviews-reply» (Airbnb host: responder bajo cada reseña).
 */
export default async function ResenasPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const sesion = await obtenerSesionConRol();
  if (!puedeAbrir(accesoDeSesion(sesion), "/resenas")) redirect("/");
  const sp = await searchParams;
  const ver: Filtro = FILTROS.some((f) => f.valor === sp.ver) ? (sp.ver as Filtro) : "todas";
  const [zona, supabase, negocio] = await Promise.all([zonaActual(), createSupabaseServerClient(), negocioActual()]);

  let q = supabase
    .from("resenas")
    .select("id, estrellas, texto, respuesta, respondida_at, publicada, created_at, origen_tipo, clientes(nombre), perros(nombre)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(200);
  if (ver === "sin_respuesta") q = q.is("respuesta", null);
  if (ver === "escondidas") q = q.eq("publicada", false);
  // Los totales salen de la base (conteos y el promedio de resenas_de_negocio, el mismo de la página pública).
  const [{ data, error }, total, sinResp, { data: publico }] = await Promise.all([
    q,
    supabase.from("resenas").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("resenas").select("id", { count: "exact", head: true }).is("deleted_at", null).is("respuesta", null),
    supabase.rpc("resenas_de_negocio", { p_negocio: negocio.id }),
  ]);
  const promedio = (publico as { promedio?: number | null } | null)?.promedio ?? null;
  const sinRespuesta = sinResp.count ?? 0;

  const filas: FilaResena[] = ((data ?? []) as unknown as {
    id: string; estrellas: number; texto: string | null; respuesta: string | null; respondida_at: string | null; publicada: boolean;
    created_at: string; origen_tipo: string; clientes: { nombre: string } | null; perros: { nombre: string } | null;
  }[]).map((r) => ({
    id: r.id,
    estrellas: r.estrellas,
    texto: r.texto,
    respuesta: r.respuesta,
    respondida_at: r.respondida_at,
    publicada: r.publicada,
    cuando: formatearFechaCalendario(fechaLocalDeInstante(r.created_at, zona)),
    quien: r.clientes?.nombre ?? "Cliente",
    perro: r.perros?.nombre ?? null,
    origen: r.origen_tipo === "estetica" ? "Estética" : "Estancia",
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Reseñas</h1>
        <p className="mt-1 text-n-600">
          Lo que opinan los dueños desde su app después de cada visita. Contéstalas (la respuesta se ve en la página del
          negocio y al dueño le llega un aviso) y esconde las que no deban salir. Las estrellas y el texto del dueño no se cambian.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-resumen-resenas>
        <div className="rounded-lg border border-border bg-card p-4 shadow-tarjeta">
          <p className="text-sm text-n-600">Promedio (las que se ven)</p>
          <p className="text-2xl font-bold text-n-900">{promedio == null ? "—" : `${Number(promedio).toFixed(1)} ★`}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-tarjeta">
          <p className="text-sm text-n-600">Reseñas</p>
          <p className="text-2xl font-bold text-n-900">{total.count ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-tarjeta">
          <p className="text-sm text-n-600">Sin respuesta</p>
          <p className="text-2xl font-bold text-n-900" data-sin-respuesta={sinRespuesta}>{sinRespuesta}</p>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Filtrar reseñas">
        {FILTROS.map((f) => (
          <EnlacePestana key={f.valor} href={f.valor === "todas" ? "/resenas" : `/resenas?ver=${f.valor}`} activo={ver === f.valor}>
            {f.etiqueta}
          </EnlacePestana>
        ))}
      </nav>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar las reseñas">Recarga la página. Si sigue, avísale al equipo técnico.</Alert>
      ) : filas.length === 0 ? (
        <div className="rounded-lg border-[1.5px] border-dashed border-n-300 bg-card p-8 text-center text-n-600">
          {ver === "todas" ? "Todavía no hay reseñas. Los dueños opinan desde su app cuando termina una visita." : "No hay reseñas en este filtro."}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border bg-card shadow-tarjeta" data-lista-resenas>
          {filas.map((r) => (
            <ResenaFila key={r.id} r={r} puedeEditar />
          ))}
        </ul>
      )}
    </div>
  );
}
