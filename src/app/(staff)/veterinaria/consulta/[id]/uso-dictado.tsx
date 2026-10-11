import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatearFecha, horaLocalDeInstante } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { EscucharDictado } from "./escuchar-dictado";

type Fila = { id: string; cuando: string; estado: string; minutos: number | null; segundos: number | null; quien: string; audio: boolean; audio_vence_at: string | null };

/** El registro de uso del dictado de ESTA consulta (quién, cuándo, cuántos minutos). No guarda contenido. */
export async function UsoDictado({ consultaId }: { consultaId: string }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("vet_dictado_uso_consulta", { p_consulta: consultaId });
  const filas = ((data ?? []) as Fila[]).filter((f) => f.estado === "listo");
  if (filas.length === 0) return null;
  const zona = await zonaActual();
  const total = filas.reduce((s, f) => s + (f.minutos ?? 0), 0);
  return (
    <section aria-label="Uso del dictado" className="rounded-lg border border-n-200 bg-white p-4">
      <h2 className="text-base font-bold text-n-900">Dictado en esta consulta</h2>
      <p className="text-sm text-n-600">{filas.length} {filas.length === 1 ? "dictado" : "dictados"} · {total} min en total. Aquí solo queda el registro de uso: el texto dictado se pasó al expediente.</p>
      <ul className="mt-2 flex flex-col gap-1 text-sm text-n-800">
        {filas.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-2">
            <span>
              {formatearFecha(f.cuando, zona)} {horaLocalDeInstante(f.cuando, zona)} · {f.quien} · {f.minutos} min
            </span>
            {f.audio && f.audio_vence_at && (
              <>
                <span className="rounded-full bg-ambar-suave px-2 py-0.5 text-xs font-semibold text-ambar-oscuro">Audio guardado hasta {formatearFecha(f.audio_vence_at, zona)}</span>
                <EscucharDictado dictadoId={f.id} />
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
