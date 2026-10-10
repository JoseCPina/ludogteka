import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { Alert } from "@/components/ui/alert";
import { Antiguedad } from "@/components/ui/antiguedad";
import { ETIQUETA_CONSENTIMIENTO } from "@/lib/veterinaria/carnet";
import { diasDesde } from "@/lib/antiguedad";
import { hoyNegocio } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { EditorPlantilla } from "./plantillas";

type Plantilla = { id: string; tipo: string; version: number; titulo: string; cuerpo: string };

export default async function Consentimientos() {
  const supabase = await createSupabaseServerClient();
  const zona = await zonaActual();
  const hoy = hoyNegocio(zona);
  const sesion = await obtenerSesionConRol();
  const puedeEditar = tienePermiso(sesion, "plantillas_contrato");
  const [{ data: plantillasCrudo, error }, { data: pendientes }] = await Promise.all([
    supabase.rpc("consentimientos_plantillas_lista"),
    supabase.from("consentimientos").select("id, tipo, created_at, procedimiento, perros(nombre)").eq("estado", "pendiente_firma").is("deleted_at", null).order("created_at"),
  ]);
  const plantillas = (plantillasCrudo ?? []) as Plantilla[];
  const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/veterinaria" className="text-sm font-semibold text-morado hover:underline">← Veterinaria</Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Consentimientos informados</h1>
        <p className="mt-1 max-w-3xl text-n-600">Los textos de hospitalización, cirugía, anestesia y eutanasia, y los que están esperando firma. Se crean desde la hospitalización o la ficha de la mascota.</p>
      </div>
      {error && <Alert variante="error" titulo="No pudimos cargar las plantillas">{error.message}</Alert>}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Esperando firma ({(pendientes ?? []).length})</h2>
        {(pendientes ?? []).length === 0 ? (
          <p className="rounded-lg border border-n-200 bg-white p-4 text-n-700">No hay consentimientos pendientes.</p>
        ) : (
          <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
            {(pendientes ?? []).map((p) => (
              <li key={p.id as string}>
                <Link href={`/veterinaria/consentimientos/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-n-50">
                  <span className="font-semibold text-n-900">{ETIQUETA_CONSENTIMIENTO[p.tipo as string]} · {un(p.perros as { nombre: string } | { nombre: string }[] | null)?.nombre}{p.procedimiento ? ` — ${p.procedimiento}` : ""}</span>
                  <Antiguedad dias={diasDesde(p.created_at as string, hoy, zona)} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Plantillas del negocio</h2>
        <Alert variante="info" titulo="Son textos base">
          Revísalos con tu asesor legal antes de usarlos. Cada vez que guardas se crea una versión nueva; los consentimientos ya creados conservan el texto con el que se crearon.
        </Alert>
        {plantillas.map((p) => (
          <article key={p.id} className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-bold text-n-900">{ETIQUETA_CONSENTIMIENTO[p.tipo]}</h3>
              <span className="text-sm text-n-500">Versión {p.version}</span>
            </div>
            <p className="text-sm font-semibold text-n-800">{p.titulo}</p>
            <p className="line-clamp-4 whitespace-pre-line text-sm text-n-700">{p.cuerpo}</p>
            {puedeEditar ? <EditorPlantilla tipo={p.tipo} titulo={p.titulo} cuerpo={p.cuerpo} /> : <p className="text-sm text-n-500">Editar las plantillas es de admin o de quien tenga «Plantillas de contrato».</p>}
          </article>
        ))}
      </section>
    </div>
  );
}
