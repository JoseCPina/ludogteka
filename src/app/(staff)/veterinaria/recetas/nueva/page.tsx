import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vetPuede } from "@/lib/veterinaria/permisos";
import { miMedico } from "@/lib/veterinaria/lotes";
import { buscarMascotas, etiquetaEspecie } from "@/lib/veterinaria/buscar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { formatearFechaCalendario } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { fechaLocalDeInstante } from "@/lib/formato";
import { EditorReceta, type ProductoReceta } from "./editor-receta";

export default async function NuevaReceta({ searchParams }: { searchParams: Promise<{ q?: string; perro?: string; consulta?: string }> }) {
  const { q, perro, consulta } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [puedeBase, medico] = await Promise.all([vetPuede(supabase, "emitir_recetas"), miMedico(supabase)]);
  const puede = puedeBase && Boolean(medico);
  if (!puede) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <Link href="/veterinaria/recetas" className="text-sm font-semibold text-morado hover:underline">← Recetas</Link>
        <Alert variante="advertencia" titulo="Emitir recetas es de un médico veterinario">Una receta la firma un médico veterinario designado con su cédula. Un admin o una recepcionista con el permiso «Emitir recetas» pueden ver y mandar las recetas, pero no emitirlas: pídele a un admin que te designe médico en Veterinaria → Médicos.</Alert>
      </div>
    );
  }

  if (!perro) {
    const filas = await buscarMascotas(supabase, q ?? "");
    return (
      <div className="flex flex-col gap-5">
        <div>
          <Link href="/veterinaria/recetas" className="text-sm font-semibold text-morado hover:underline">← Recetas</Link>
          <h1 className="mt-1 text-2xl font-bold text-n-900">Nueva receta</h1>
          <p className="mt-1 text-n-600">Primero elige a la mascota: busca por su nombre, el de su dueño o su teléfono.</p>
        </div>
        <form method="get" className="flex max-w-xl items-end gap-3">
          <div className="flex-1"><Field label="Buscar mascota o dueño" name="q" defaultValue={q ?? ""} placeholder="Motita, Ana, 444…" /></div>
          <Button type="submit">Buscar</Button>
        </form>
        {filas.length === 0 ? (
          <p className="rounded-lg border border-n-200 bg-white p-4 text-n-700">No encontramos a nadie con eso.</p>
        ) : (
          <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
            {filas.map((f) => (
              <li key={f.id}>
                <Link href={`/veterinaria/recetas/nueva?perro=${f.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-n-50">
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

  const zona = await zonaActual();
  const [{ data: mascota }, { data: productosCrudo }, { data: consultasCrudo }] = await Promise.all([
    supabase.from("perros").select("id, nombre, especie, clientes(nombre)").eq("id", perro).is("deleted_at", null).maybeSingle(),
    supabase.rpc("vet_productos_receta"),
    supabase.rpc("vet_consultas_de_mascota", { p_perro: perro }),
  ]);
  const dueno = mascota ? ((Array.isArray(mascota.clientes) ? mascota.clientes[0] : mascota.clientes) as { nombre: string } | null) : null;
  const productos = (productosCrudo ?? []) as ProductoReceta[];
  const consultas = ((consultasCrudo ?? []) as { id: string; estado: string; tipo_clave: string; atendida_at: string; motivo: string | null }[]).filter((c) => c.estado === "firmada" || c.estado === "borrador");
  const consultaElegida = consultas.find((c) => c.id === consulta) ?? null;
  // El «Tratamiento» de la consulta (firmada, o abierta tal como va: QA S49), para prellenar el medicamento (se lee con la misma regla de permisos del expediente).
  let tratamiento: string | null = null;
  if (consultaElegida) {
    const { data: detalle } = await supabase.rpc("vet_consulta_detalle", { p_id: consultaElegida.id });
    tratamiento = ((detalle as { consulta?: { tratamiento?: string | null } } | null)?.consulta?.tratamiento ?? null) || null;
  }

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <Link href="/veterinaria/recetas/nueva" className="text-sm font-semibold text-morado hover:underline">← Elegir otra mascota</Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Nueva receta</h1>
        {mascota && <p className="mt-1 text-n-700">{mascota.nombre} · {etiquetaEspecie(mascota.especie as string | null)} · de {dueno?.nombre ?? "—"}</p>}
      </div>
      {!mascota ? (
        <Alert variante="error" titulo="No encontramos a esa mascota">Búscala de nuevo.</Alert>
      ) : (
        <>
          {consultas.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-4 text-sm">
              <p className="font-semibold text-n-900">¿Desde una consulta?</p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/veterinaria/recetas/nueva?perro=${perro}`} className={`rounded-full border px-3 py-1 font-semibold ${!consultaElegida ? "border-morado bg-morado-suave text-morado" : "border-n-200 text-n-700"}`}>Desde la ficha</Link>
                {consultas.slice(0, 6).map((c) => (
                  <Link key={c.id} href={`/veterinaria/recetas/nueva?perro=${perro}&consulta=${c.id}`} className={`rounded-full border px-3 py-1 font-semibold ${consultaElegida?.id === c.id ? "border-morado bg-morado-suave text-morado" : "border-n-200 text-n-700"}`}>
                    {formatearFechaCalendario(fechaLocalDeInstante(c.atendida_at, zona))}{c.motivo ? ` · ${c.motivo.slice(0, 24)}` : ""}{c.estado === "borrador" ? " · abierta" : ""}
                  </Link>
                ))}
              </div>
            </div>
          )}
          <EditorReceta key={consultaElegida?.id ?? "ficha"} perroId={perro} consultaId={consultaElegida?.id ?? null} productos={productos} tratamiento={tratamiento} />
        </>
      )}
    </div>
  );
}
