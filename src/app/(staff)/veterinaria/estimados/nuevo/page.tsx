import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { buscarMascotas, etiquetaEspecie } from "@/lib/veterinaria/buscar";
import { hoyNegocio } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import type { MedicoVet } from "@/lib/veterinaria/expediente";
import { opcionesDeEstimado } from "../../expediente/actions";
import { EditorEstimado } from "../editor-estimado";
import { Enlace } from "@/components/ui/enlace";

export default async function NuevoEstimado({ searchParams }: { searchParams: Promise<{ perro?: string; consulta?: string; q?: string }> }) {
  const { perro, consulta, q: qCrudo } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: puede } = await supabase.rpc("vet_puede", { p_permiso: "crear_estimados" });
  if (puede !== true) {
    return <Alert variante="advertencia" titulo="No tienes acceso">Crear estimados es de un médico veterinario, de admin o de quien tenga «Crear estimados».</Alert>;
  }
  if (!perro) {
    const filas = await buscarMascotas(supabase, qCrudo ?? "");
    return (
      <div className="flex flex-col gap-5">
        <div>
          <Enlace href="/veterinaria/estimados" className="text-sm">← Estimados</Enlace>
          <h1 className="mt-1 text-2xl font-bold text-n-900">Nuevo estimado</h1>
          <p className="mt-1 text-n-600">Elige a la mascota.</p>
        </div>
        <form method="get" className="flex max-w-xl items-end gap-3">
          <div className="flex-1"><Field label="Buscar mascota o dueño" name="q" defaultValue={qCrudo ?? ""} /></div>
          <Button type="submit">Buscar</Button>
        </form>
        <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
          {filas.map((f) => (
            <li key={f.id}>
              <Enlace href={`/veterinaria/estimados/nuevo?perro=${f.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-n-50" forma="bloque">
                <span className="font-semibold text-n-900">{f.nombre} <span className="font-normal text-n-500">· {etiquetaEspecie(f.especie)}</span></span>
                <span className="text-sm text-n-600">{f.dueno}</span>
              </Enlace>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const zona = await zonaActual();
  const [{ data: mascota }, { data: medicosCrudo }, { data: miMedico }, insumos] = await Promise.all([
    supabase.from("perros").select("id, nombre, especie, clientes(nombre)").eq("id", perro).maybeSingle(),
    supabase.rpc("vet_medicos_lista"),
    supabase.rpc("vet_mi_medico"),
    opcionesDeEstimado(),
  ]);
  if (!mascota) return <Alert variante="error" titulo="No encontramos a esa mascota">Búscala de nuevo.</Alert>;
  const dueno = (Array.isArray(mascota.clientes) ? mascota.clientes[0] : mascota.clientes) as { nombre: string } | null;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Enlace href={`/veterinaria/expediente/${perro}`} className="text-sm">← Expediente de {mascota.nombre}</Enlace>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Nuevo estimado</h1>
        <p className="text-n-700">{mascota.nombre} · de {dueno?.nombre ?? "—"}</p>
      </div>
      <EditorEstimado id={null} perroId={perro} consultaId={consulta && /^[0-9a-f-]{36}$/.test(consulta) ? consulta : null} medicos={(medicosCrudo ?? []) as MedicoVet[]} medicoPropio={(miMedico as string | null) ?? null} insumos={insumos} hoy={hoyNegocio(zona)} />
    </div>
  );
}
