import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { buscarMascotas, etiquetaEspecie } from "@/lib/veterinaria/buscar";

export default async function BuscarExpediente({ searchParams }: { searchParams: Promise<{ q?: string; perro?: string }> }) {
  const { q: qCrudo, perro } = await searchParams;
  // QA S27: de vuelta del alta de cliente y mascota, directo al expediente de la mascota nueva.
  if (perro && /^[0-9a-f-]{36}$/.test(perro)) redirect(`/veterinaria/expediente/${perro}`);
  const supabase = await createSupabaseServerClient();
  const filas = await buscarMascotas(supabase, qCrudo ?? "");
  const q = (qCrudo ?? "").trim();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/veterinaria" className="text-sm font-semibold text-morado hover:underline">← Veterinaria</Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Expediente clínico</h1>
        <p className="mt-1 max-w-3xl text-n-600">Consultas, vacunas, hospitalizaciones, estudios y archivos de cada mascota en una sola línea de tiempo. Busca por su nombre, el de su dueño o su teléfono.</p>
      </div>
      <form className="flex max-w-xl items-end gap-3">
        <div className="flex-1">
          <Field label="Buscar mascota o dueño" name="q" defaultValue={qCrudo ?? ""} placeholder="Motita, Ana, 444…" />
        </div>
        <Button type="submit">Buscar</Button>
      </form>
      {/* QA S27: el alta del dueño sigue a la de su mascota y regresa a su expediente. */}
      <Link href={`/clientes/nuevo?volver=${encodeURIComponent("/veterinaria/expediente")}`} className="self-start text-sm font-semibold text-morado hover:underline" data-nuevo-cliente-vet>
        + Nuevo cliente y su mascota
      </Link>
      {filas.length === 0 ? (
        <p className="rounded-lg border border-n-200 bg-white p-4 text-n-700">{q ? "No encontramos a nadie con eso." : "Todavía no hay mascotas registradas."}</p>
      ) : (
        <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
          {filas.map((f) => (
            <li key={f.id}>
              <Link href={`/veterinaria/expediente/${f.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-n-50">
                <span className="font-semibold text-n-900">{f.nombre} <span className="font-normal text-n-500">· {etiquetaEspecie(f.especie)}</span></span>
                <span className="text-sm text-n-600">{f.dueno}{f.telefono ? ` · ${f.telefono}` : ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
