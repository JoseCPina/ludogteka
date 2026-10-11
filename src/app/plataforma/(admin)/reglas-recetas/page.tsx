import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { Field } from "@/components/ui/field";
import { DOCUMENTOS } from "@/lib/veterinaria/recetas";
import { guardarClasificacion, guardarRegla } from "./acciones";

type Regla = { clave: string; valor: number | string; titulo: string; descripcion: string | null; fuente: string | null };
type Clasificacion = {
  clave: string; etiqueta: string; documento: keyof typeof DOCUMENTOS; surtidos_max: number | null; ventana_meses: number | null;
  retencion_meses: number | null; libro_control: boolean; nota: string | null; fuente: string | null;
};

const claseCaja = "mt-1.5 min-h-12 w-full rounded-md border-[1.5px] border-borde bg-white px-3.5 text-base text-n-900";

// Lo regulatorio de las recetas y los controlados de Veterinaria NO está fijo en el código: se edita aquí
// y cada cambio queda en los eventos de la plataforma. Los valores sembrados salen de lo que dictó el
// dueño de PeluDesk y no se han contrastado contra el texto del DOF.
export default async function ReglasRecetas() {
  const { supabase } = await exigirPlataforma();
  const [{ data: reglasCrudo }, { data: clasCrudo }] = await Promise.all([
    supabase.from("vet_reglas").select("clave, valor, titulo, descripcion, fuente").order("orden"),
    supabase.from("vet_reglas_clasificacion").select("clave, etiqueta, documento, surtidos_max, ventana_meses, retencion_meses, libro_control, nota, fuente").order("orden"),
  ]);
  const reglas = (reglasCrudo ?? []) as Regla[];
  const clasificaciones = (clasCrudo ?? []) as Clasificacion[];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Reglas de recetas y controlados</h1>
        <p className="mt-1 max-w-3xl text-n-600">
          Plazos, copias, umbrales y qué documento pide cada clasificación de un producto. Lo usan todos los negocios con Veterinaria; un cambio vale desde la siguiente receta o salida (lo ya emitido conserva la regla con la que se emitió).
          Los valores sembrados salen de lo que se dictó y <strong>no se han contrastado contra el texto del DOF</strong>: revísalos antes de prender Veterinaria en producción.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Valores generales</h2>
        <ul className="flex flex-col gap-3">
          {reglas.map((r) => (
            <li key={r.clave} className="rounded-lg border border-n-200 bg-white p-4">
              <FormularioPlataforma accion={guardarRegla} textoBoton="Guardar">
                <input type="hidden" name="clave" value={r.clave} />
                <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
                  <div>
                    <p className="font-semibold text-n-900">{r.titulo}</p>
                    {r.descripcion && <p className="text-sm text-n-600">{r.descripcion}</p>}
                    {r.fuente && <p className="text-xs text-n-500">Fuente: {r.fuente}</p>}
                  </div>
                  <Field label="Valor" name="valor" defaultValue={String(r.valor)} type={typeof r.valor === "number" ? "number" : "text"} required />
                </div>
              </FormularioPlataforma>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Qué documento pide cada clasificación</h2>
        <p className="max-w-3xl text-sm text-n-600">Si un producto tiene varias clasificaciones, gana la más estricta: recetario especial, luego receta cuantificada del SITPV, luego receta con cédula, luego receta simple, luego libre.</p>
        <ul className="flex flex-col gap-3">
          {clasificaciones.map((c) => (
            <li key={c.clave} className="rounded-lg border border-n-200 bg-white p-4">
              <FormularioPlataforma accion={guardarClasificacion} textoBoton="Guardar">
                <input type="hidden" name="clave" value={c.clave} />
                <div>
                  <p className="font-semibold text-n-900">{c.etiqueta}</p>
                  {c.fuente && <p className="text-xs text-n-500">Fuente: {c.fuente}</p>}
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <label className="block text-sm font-medium text-n-800 sm:col-span-2">
                    Documento
                    <select name="documento" defaultValue={c.documento} className={claseCaja}>
                      {Object.entries(DOCUMENTOS).map(([k, v]) => (
                        <option key={k} value={k}>{v.etiqueta}</option>
                      ))}
                    </select>
                  </label>
                  <Field label="Surtidos máximos" name="surtidos_max" type="number" min={1} defaultValue={c.surtidos_max ?? ""} ayuda="Vacío: sin límite." />
                  <Field label="En cuántos meses" name="ventana_meses" type="number" min={1} defaultValue={c.ventana_meses ?? ""} ayuda="Vacío: sin plazo." />
                  <Field label="Conservar (meses)" name="retencion_meses" type="number" min={1} defaultValue={c.retencion_meses ?? ""} ayuda="Vacío: la regla general." />
                  <label className="flex items-center gap-2 self-end pb-3 text-n-800 sm:col-span-2">
                    <input type="checkbox" name="libro_control" defaultChecked={c.libro_control} className="h-5 w-5" /> Va al libro de control
                  </label>
                </div>
                <Field label="Nota" name="nota" defaultValue={c.nota ?? ""} />
              </FormularioPlataforma>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
