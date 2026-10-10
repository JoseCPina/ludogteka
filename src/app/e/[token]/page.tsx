import type { Metadata } from "next";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual } from "@/lib/negocio/actual";
import { formatearFechaCalendario } from "@/lib/formato";
import { hashDeToken, tokenPlausible } from "@/lib/reporte/enlaces";
import { LigaNoDisponible, MarcoLiga } from "@/components/publico/marco-liga";
import { TIPOS_LINEA, dinero, totalLinea, type LineaEstimado } from "@/lib/veterinaria/expediente";
import { ResponderEstimado } from "./responder";

// Estimado (/e/<token>): sin sesión. El dueño lo revisa y lo acepta con nombre y firma. Nada de
// datos clínicos del expediente: solo el título, las líneas con sus precios y la vigencia.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const negocio = await negocioActual();
  return { title: `Estimado · ${negocio.nombre}`, robots: { index: false, follow: false }, openGraph: { title: `Estimado · ${negocio.nombre}`, images: [] } };
}

type Publico = {
  negocio: string;
  mascota: string;
  dueno: string;
  medico: { nombre: string; cedula: string } | null;
  tipo: string;
  titulo: string;
  notas: string | null;
  version: number;
  estado: string;
  vigente_hasta: string;
  vencido: boolean;
  integro: boolean;
  total_min: number;
  total_max: number;
  aceptado_at: string | null;
  aceptado_nombre: string | null;
  rechazado_at: string | null;
  lineas: Pick<LineaEstimado, "tipo" | "descripcion" | "cantidad" | "unidad" | "precio_min" | "precio_max">[];
};

export default async function EstimadoPublico({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const negocio = await negocioActual();
  let d: Publico | null = null;
  if (tokenPlausible(token)) {
    const admin = createSupabaseAdminClient(negocio.id);
    const { data } = await admin.rpc("estimado_publico", { p_token_hash: hashDeToken(token) });
    d = (data as Publico | null) ?? null;
  }
  if (!d) {
    return (
      <MarcoLiga>
        <LigaNoDisponible negocio={negocio.nombre} vencida={false} />
      </MarcoLiga>
    );
  }
  const abierto = d.estado === "enviado" && !d.vencido && d.integro;
  return (
    <MarcoLiga>
      <article className="flex flex-col gap-4 rounded-xl border border-n-200 bg-white p-5">
        <header>
          <p className="text-xs font-bold uppercase tracking-wide text-morado">Estimado de {d.negocio}</p>
          <h1 className="mt-1 text-2xl font-bold text-n-900">{d.titulo}</h1>
          <p className="text-n-700">Para {d.mascota}, de {d.dueno}</p>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-n-500"><th className="py-1">Concepto</th><th className="text-right">Desde</th><th className="text-right">Hasta</th></tr>
          </thead>
          <tbody>
            {d.lineas.map((l, i) => {
              const t = totalLinea(l);
              return (
                <tr key={i} className="border-t border-n-100 align-top">
                  <td className="py-2">
                    <span className="text-xs font-semibold text-n-500">{TIPOS_LINEA[l.tipo]}</span>
                    <br />
                    {Number(l.cantidad) !== 1 ? `${l.cantidad}${l.unidad ? ` ${l.unidad}` : ""} × ` : ""}{l.descripcion}
                  </td>
                  <td className="text-right">{dinero(t.min)}</td>
                  <td className="text-right">{dinero(t.max)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-n-300 font-bold text-n-900"><td className="py-2">Total estimado</td><td className="text-right">{dinero(d.total_min)}</td><td className="text-right">{dinero(d.total_max)}</td></tr>
          </tfoot>
        </table>
        {d.notas && <p className="whitespace-pre-wrap text-n-800">{d.notas}</p>}
        <p className="text-sm text-n-600">Versión {d.version} · vigente hasta el {formatearFechaCalendario(d.vigente_hasta)}{d.medico ? ` · ${d.medico.nombre}, cédula profesional ${d.medico.cedula}` : ""}. Es un cálculo: el costo final depende de lo que ocurra en la atención y no pasa del máximo sin avisarte.</p>
      </article>

      {d.estado === "aceptado" && (
        <section role="status" className="rounded-xl border border-menta bg-menta-suave p-5">
          <h2 className="text-lg font-bold text-n-900">Estimado aceptado</h2>
          <p className="text-n-800">Lo aceptó {d.aceptado_nombre}. Lo que corresponda se paga directamente en {d.negocio}.</p>
        </section>
      )}
      {d.estado === "rechazado" && (
        <section role="status" className="rounded-xl border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Dijiste que no lo aceptas</h2>
          <p className="text-n-700">Si cambias de opinión, pídele a {d.negocio} que te mande una versión nueva.</p>
        </section>
      )}
      {d.estado === "enviado" && d.vencido && (
        <section role="status" className="rounded-xl border border-ambar bg-ambar-suave p-5">
          <h2 className="text-lg font-bold text-n-900">Este estimado ya venció</h2>
          <p className="text-n-800">Pídele a {d.negocio} que te mande uno actualizado.</p>
        </section>
      )}
      {d.estado === "enviado" && !d.vencido && !d.integro && (
        <section role="alert" className="rounded-xl border border-coral bg-coral-suave p-5">
          <h2 className="text-lg font-bold text-n-900">No pudimos verificar este estimado</h2>
          <p className="text-n-800">Pídele a {d.negocio} que te mande uno nuevo.</p>
        </section>
      )}
      {abierto && <ResponderEstimado token={token} dueno={d.dueno} />}
    </MarcoLiga>
  );
}
