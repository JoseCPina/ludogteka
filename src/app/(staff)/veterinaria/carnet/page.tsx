import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { buscarMascotas, etiquetaEspecie } from "@/lib/veterinaria/buscar";
import { Enlace } from "@/components/ui/enlace";

export default async function BuscarCarnet({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: qCrudo } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const filas = await buscarMascotas(supabase, qCrudo ?? "");
  const q = (qCrudo ?? "").trim();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Enlace href="/veterinaria" className="text-sm">← Veterinaria</Enlace>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Carnets</h1>
        <p className="mt-1 max-w-3xl text-n-600">Vacunas y desparasitaciones de cada mascota. Busca por su nombre, el de su dueño o su teléfono.</p>
      </div>
      <form method="get" className="flex max-w-xl items-end gap-3">
        <div className="flex-1">
          <Field label="Buscar mascota o dueño" name="q" defaultValue={qCrudo ?? ""} placeholder="Motita, Ana, 444…" />
        </div>
        <Button type="submit">Buscar</Button>
      </form>
      {filas.length === 0 ? (
        <p className="rounded-lg border border-n-200 bg-white p-4 text-n-700">{q ? "No encontramos a nadie con eso." : "Todavía no hay mascotas registradas."}</p>
      ) : (
        <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
          {filas.map((f) => (
            <li key={f.id}>
              <Enlace href={`/veterinaria/carnet/${f.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-n-50" forma="bloque">
                <span className="font-semibold text-n-900">{f.nombre} <span className="font-normal text-n-500">· {etiquetaEspecie(f.especie)}</span></span>
                <span className="text-sm text-n-600">{f.dueno}{f.telefono ? ` · ${f.telefono}` : ""}</span>
              </Enlace>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
