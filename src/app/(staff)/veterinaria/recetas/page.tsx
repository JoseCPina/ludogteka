import { SiPuedeAbrir } from "@/components/acceso-contexto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vetPuede } from "@/lib/veterinaria/permisos";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatearFechaCalendario } from "@/lib/formato";
import type { RecetaResumen } from "@/lib/veterinaria/recetas";
import { NavRecetas } from "./nav";
import { Enlace } from "@/components/ui/enlace";
import { EnlacePestana } from "@/components/ui/enlace-pestana";

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
          <Enlace href="/veterinaria" className="text-sm">← Veterinaria</Enlace>
          <h1 className="mt-1 text-2xl font-bold text-n-900">Recetas</h1>
          <p className="mt-1 max-w-3xl text-n-600">Recetas simples con original y copias, a nombre del médico veterinario que las firma con su cédula. No se editan: si algo está mal, se anulan con motivo y se emite otra.</p>
        </div>
        {puede && (
          <SiPuedeAbrir href="/veterinaria/recetas/nueva">
            <Enlace href="/veterinaria/recetas/nueva">Nueva receta</Enlace>
          </SiPuedeAbrir>
        )}
      </div>
      <NavRecetas activa="recetas" />
      {error?.code === "42501" ? (
        <Alert variante="advertencia" titulo="No tienes acceso">Las recetas son de un médico veterinario, de admin o de quien tenga «Emitir recetas».</Alert>
      ) : error ? (
        <Alert variante="error" titulo="No pudimos cargar las recetas">Recarga la página. Si sigue, avísale al equipo técnico.</Alert>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-sm print:hidden">
            {[["", "Todas"], ["emitida", "Emitidas"], ["anulada", "Anuladas"]].map(([v, t]) => (
              <EnlacePestana key={v} href={enlace(v, archivadas === "1")} activo={(estado ?? "") === v}>{t}</EnlacePestana>
            ))}
            <EnlacePestana href={enlace(estado ?? "", archivadas !== "1")} activo={archivadas === "1"}>
              {archivadas === "1" ? "Ocultar archivadas" : "Ver también archivadas"}
            </EnlacePestana>
          </div>
          {filas.length === 0 ? (
            <p className="rounded-lg border border-n-200 bg-white p-5 text-n-700">Todavía no hay recetas{puede ? ". Emite la primera con «Nueva receta»." : "."}</p>
          ) : (
            <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
              {filas.map((r) => (
                <li key={r.id}>
                  <Enlace href={`/veterinaria/recetas/${r.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-n-50" forma="bloque">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-n-900">Receta {r.numero} · {r.mascota}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.estado === "anulada" ? "bg-coral-suave text-coral-oscuro" : "bg-menta-suave text-menta-oscuro"}`}>{r.estado === "anulada" ? "Anulada" : "Emitida"}</span>
                      {r.requiere_cedula && <span className="rounded-full bg-ambar-suave px-2 py-0.5 text-xs font-semibold text-ambar-oscuro">Con cédula</span>}
                      {r.archivada_at && <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">Archivada</span>}
                    </span>
                    <span className="text-sm text-n-700">{r.productos}</span>
                    <span className="text-sm text-n-500">{formatearFechaCalendario(r.fecha)} · de {r.dueno} · {r.medico ?? "—"}</span>
                  </Enlace>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
