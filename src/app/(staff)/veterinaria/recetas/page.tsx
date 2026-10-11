import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vetPuede } from "@/lib/veterinaria/permisos";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatearFechaCalendario } from "@/lib/formato";
import type { RecetaResumen } from "@/lib/veterinaria/recetas";
import { NavRecetas } from "./nav";

// Recetas simples: Grupos II y III y las fracciones III y IV. El Grupo I se registra como espejo del SITPV
// y los estupefacientes en el recetario especial (pestañas de arriba).
export default async function Recetas({ searchParams }: { searchParams: Promise<{ estado?: string; archivadas?: string }> }) {
  const { estado, archivadas } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [puede, { data, error }] = await Promise.all([
    vetPuede(supabase, "emitir_recetas"),
    supabase.rpc("vet_recetas_lista", { p_perro: null, p_estado: estado === "anulada" || estado === "emitida" ? estado : null, p_archivadas: archivadas === "1", p_limite: 200 }),
  ]);
  const filas = (data ?? []) as RecetaResumen[];
  const enlace = (e: string, a: boolean) => `/veterinaria/recetas?${[e ? `estado=${e}` : "", a ? "archivadas=1" : ""].filter(Boolean).join("&")}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/veterinaria" className="text-sm font-semibold text-morado hover:underline">← Veterinaria</Link>
          <h1 className="mt-1 text-2xl font-bold text-n-900">Recetas</h1>
          <p className="mt-1 max-w-3xl text-n-600">Recetas simples con original y copias, a nombre del médico veterinario que las firma con su cédula. No se editan: si algo está mal, se anulan con motivo y se emite otra.</p>
        </div>
        {puede && (
          <Link href="/veterinaria/recetas/nueva"><Button type="button">Nueva receta</Button></Link>
        )}
      </div>
      <NavRecetas activa="recetas" />
      {error ? (
        <Alert variante="error" titulo="No pudimos cargar las recetas">Recarga la página. Si sigue, avísale al equipo técnico.</Alert>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-sm print:hidden">
            {[["", "Todas"], ["emitida", "Emitidas"], ["anulada", "Anuladas"]].map(([v, t]) => (
              <Link key={v} href={enlace(v, archivadas === "1")} className={`rounded-full border px-3 py-1 font-semibold ${(estado ?? "") === v ? "border-morado bg-morado-suave text-morado" : "border-n-200 bg-white text-n-700"}`}>{t}</Link>
            ))}
            <Link href={enlace(estado ?? "", archivadas !== "1")} className="rounded-full border border-n-200 bg-white px-3 py-1 font-semibold text-n-700">
              {archivadas === "1" ? "Ocultar archivadas" : "Ver también archivadas"}
            </Link>
          </div>
          {filas.length === 0 ? (
            <p className="rounded-lg border border-n-200 bg-white p-5 text-n-700">Todavía no hay recetas{puede ? ". Emite la primera con «Nueva receta»." : "."}</p>
          ) : (
            <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
              {filas.map((r) => (
                <li key={r.id}>
                  <Link href={`/veterinaria/recetas/${r.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-n-50">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-n-900">Receta {r.numero} · {r.mascota}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.estado === "anulada" ? "bg-coral-suave text-coral-oscuro" : "bg-menta-suave text-menta-oscuro"}`}>{r.estado === "anulada" ? "Anulada" : "Emitida"}</span>
                      {r.requiere_cedula && <span className="rounded-full bg-ambar-suave px-2 py-0.5 text-xs font-semibold text-ambar-oscuro">Con cédula</span>}
                      {r.archivada_at && <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">Archivada</span>}
                    </span>
                    <span className="text-sm text-n-700">{r.productos}</span>
                    <span className="text-sm text-n-500">{formatearFechaCalendario(r.fecha)} · de {r.dueno} · {r.medico ?? "—"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
