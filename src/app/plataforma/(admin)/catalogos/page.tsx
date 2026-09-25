import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { Field } from "@/components/ui/field";
import { guardarEtiqueta, guardarRaza } from "../../acciones";

type Raza = { id: string; nombre: string; alias: string[] | null; es_desconocida: boolean | null };
type Etiqueta = { id: string; clave: string; etiqueta: string };

const CATALOGOS: { tabla: string; titulo: string }[] = [
  { tabla: "tamanos_categoria", titulo: "Tallas" },
  { tabla: "tipos_pelaje", titulo: "Tipos de pelaje" },
  { tabla: "unidades_medida", titulo: "Unidades de medida" },
];

// Lo que comparten TODOS los negocios. Solo la administración de PeluDesk
// lo escribe (lo exige la base): un cambio aquí lo ven todos. El grupo de
// precio de cada raza no está aquí: es de cada negocio.
export default async function Catalogos() {
  const { supabase } = await exigirPlataforma();
  const { data: razas } = await supabase.from("razas").select("id, nombre, alias, es_desconocida").is("deleted_at", null).order("nombre");
  const otros = await Promise.all(
    CATALOGOS.map(async (c) => ({ ...c, filas: ((await supabase.from(c.tabla).select("id, clave, etiqueta").is("deleted_at", null).order("clave")).data ?? []) as Etiqueta[] }))
  );
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Catálogos compartidos</h1>
        <p className="mt-1 text-n-600">Lo usan todos los negocios. Un cambio aquí se ve en todos al momento.</p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-n-900">Razas ({(razas ?? []).length})</h2>
        <FormularioPlataforma accion={guardarRaza} textoBoton="Agregar raza" reiniciar className="rounded-lg border border-n-200 bg-white p-5">
          <Field label="Nombre" name="nombre" required />
          <Field label="Otros nombres (separados por coma)" name="alias" ayuda="Como la escribe la gente: «shitzu, shih-tzu»." />
          <label className="flex items-center gap-2 text-n-800"><input type="checkbox" name="es_desconocida" className="h-5 w-5" />Significa «no sé» (dispara el aviso de precio incierto)</label>
        </FormularioPlataforma>
        <ul className="flex flex-col gap-2">
          {((razas ?? []) as Raza[]).map((r) => (
            <li key={r.id}>
              <details className="rounded-lg border border-n-200 bg-white">
                <summary className="cursor-pointer px-4 py-3 font-semibold text-n-900">
                  {r.nombre}
                  {(r.alias ?? []).length ? <span className="font-normal text-n-500"> · {(r.alias ?? []).join(", ")}</span> : null}
                </summary>
                <FormularioPlataforma accion={guardarRaza} textoBoton="Guardar" className="border-t border-n-200 p-4">
                  <input type="hidden" name="id" value={r.id} />
                  <Field label="Nombre" name="nombre" defaultValue={r.nombre} required />
                  <Field label="Otros nombres (separados por coma)" name="alias" defaultValue={(r.alias ?? []).join(", ")} />
                  <label className="flex items-center gap-2 text-n-800"><input type="checkbox" name="es_desconocida" defaultChecked={Boolean(r.es_desconocida)} className="h-5 w-5" />Significa «no sé»</label>
                </FormularioPlataforma>
              </details>
            </li>
          ))}
        </ul>
      </section>

      {otros.map((c) => (
        <section key={c.tabla} className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-n-900">{c.titulo}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {c.filas.map((f) => (
              <li key={f.id} className="rounded-lg border border-n-200 bg-white p-4">
                <FormularioPlataforma accion={guardarEtiqueta.bind(null, c.tabla)} textoBoton="Guardar" variante="secundario">
                  <input type="hidden" name="id" value={f.id} />
                  <Field label={`Etiqueta (${f.clave})`} name="etiqueta" defaultValue={f.etiqueta} required />
                </FormularioPlataforma>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
