import type { Metadata } from "next";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual } from "@/lib/negocio/actual";
import { formatearFechaCalendario } from "@/lib/formato";
import { hashDeToken, tokenPlausible } from "@/lib/reporte/enlaces";
import { LigaNoDisponible, MarcoLiga } from "@/components/publico/marco-liga";
import { BotonImprimirPagina } from "@/components/boton-imprimir";
import type { RecetaSnapshot } from "@/lib/veterinaria/recetas";

// Receta del dueño (/rx/<token>): sin sesión. Muestra la receta emitida por el médico, tal cual, y si
// fue anulada lo dice. Nada del expediente, de los lotes ni de otros clientes.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const negocio = await negocioActual();
  return { title: `Receta · ${negocio.nombre}`, robots: { index: false, follow: false }, openGraph: { title: `Receta · ${negocio.nombre}`, images: [] } };
}

type Publico = {
  numero: number;
  estado: "emitida" | "anulada";
  fecha: string;
  snapshot: RecetaSnapshot;
  diagnostico: string | null;
  observaciones: string | null;
  anulada_motivo: string | null;
  integra: boolean;
  lineas: { producto: string; principio_activo: string | null; presentacion: string | null; dosis: string; via: string; frecuencia: string; duracion_dias: number; tiempo_retiro: string | null; cantidad_surtir: number; cantidad_unidad: string | null; indicaciones: string | null }[];
};

export default async function RecetaPublica({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const negocio = await negocioActual();
  let d: Publico | null = null;
  if (tokenPlausible(token)) {
    const admin = createSupabaseAdminClient(negocio.id);
    const { data } = await admin.rpc("receta_publica", { p_token_hash: hashDeToken(token) });
    d = (data as Publico | null) ?? null;
  }
  if (!d) {
    return (
      <MarcoLiga>
        <LigaNoDisponible negocio={negocio.nombre} vencida={false} />
      </MarcoLiga>
    );
  }
  const s = d.snapshot;
  const valida = d.estado === "emitida" && d.integra;
  return (
    <MarcoLiga>
      <article className="flex flex-col gap-4 rounded-xl border border-n-200 bg-white p-5">
        <header>
          <p className="text-xs font-bold uppercase tracking-wide text-morado">Receta de {s.establecimiento.nombre}</p>
          <h1 className="mt-1 text-2xl font-bold text-n-900">Receta n.º {d.numero}</h1>
          <p className="text-n-700">Para {s.mascota.nombre}, de {s.propietario.nombre} · {formatearFechaCalendario(d.fecha)}</p>
        </header>
        {!valida && (
          <p className="rounded-md bg-coral-suave px-3 py-2 font-semibold text-coral-oscuro">
            {d.estado === "anulada" ? `Esta receta fue anulada${d.anulada_motivo ? `: ${d.anulada_motivo}` : ""}. Ya no tiene validez.` : "Esta receta no coincide con lo que emitió la clínica. No la uses y pregunta en la clínica."}
          </p>
        )}
        <section className="flex flex-col gap-3">
          {d.lineas.map((l, i) => (
            <div key={i} className="rounded-md border border-n-200 p-3 text-sm">
              <p className="font-bold text-n-900">{l.producto}{l.presentacion ? ` — ${l.presentacion}` : ""}</p>
              {l.principio_activo && <p className="text-n-600">Principio activo: {l.principio_activo}</p>}
              <p className="mt-1 text-n-800"><strong>Dosis:</strong> {l.dosis} · <strong>Vía:</strong> {l.via} · <strong>Frecuencia:</strong> {l.frecuencia} · <strong>Duración:</strong> {l.duracion_dias} {l.duracion_dias === 1 ? "día" : "días"}</p>
              <p className="text-n-800"><strong>Cantidad:</strong> {l.cantidad_surtir}{l.cantidad_unidad ? ` ${l.cantidad_unidad}` : ""}{l.tiempo_retiro ? <> · <strong>Tiempo de retiro:</strong> {l.tiempo_retiro}</> : null}</p>
              {l.indicaciones && <p className="text-n-700">{l.indicaciones}</p>}
            </div>
          ))}
        </section>
        {d.observaciones && <p className="whitespace-pre-line text-sm text-n-800"><strong>Observaciones:</strong> {d.observaciones}</p>}
        <p className="text-sm text-n-800">Médico veterinario: <strong>{s.medico.nombre}</strong> · cédula profesional {s.medico.cedula}</p>
        <p className="text-xs font-semibold text-n-700">{s.leyenda}</p>
        <p className="text-xs text-n-500">Esta es tu copia para consulta. Para surtir un producto que lo pida, presenta la receta impresa que te dio la clínica.</p>
        <div className="print:hidden"><BotonImprimirPagina texto="Imprimir o guardar PDF" /></div>
      </article>
    </MarcoLiga>
  );
}
