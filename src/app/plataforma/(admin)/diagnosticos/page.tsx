import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { bajaDiagnostico, guardarDiagnostico } from "./acciones";

type Diagnostico = { id: string; nombre: string; categoria: string; especies: string[]; sinonimos: string[] };
type DeNegocio = { nombre: string; categoria: string; especies: string[]; sinonimos: string[]; negocio: string; desde: string };

const claseCaja = "mt-1.5 min-h-12 w-full rounded-md border-[1.5px] border-borde bg-white px-3.5 text-base text-n-900";

function Campos({ d }: { d?: Diagnostico }) {
  return (
    <>
      {d && <input type="hidden" name="id" value={d.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" name="nombre" defaultValue={d?.nombre ?? ""} required />
        <Field label="Categoría" name="categoria" defaultValue={d?.categoria ?? ""} required placeholder="Dermatología, Gastroenterología…" />
      </div>
      <label className="block text-sm font-medium text-n-800">
        Sinónimos (uno por línea o separados por comas)
        <textarea name="sinonimos" rows={2} defaultValue={(d?.sinonimos ?? []).join(", ")} className={`${claseCaja} py-2`} />
      </label>
      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-n-800"><input type="checkbox" name="especie_perro" defaultChecked={d ? d.especies.includes("perro") : true} className="h-5 w-5" /> Perros</label>
        <label className="flex items-center gap-2 text-n-800"><input type="checkbox" name="especie_gato" defaultChecked={d ? d.especies.includes("gato") : true} className="h-5 w-5" /> Gatos</label>
      </div>
    </>
  );
}

// El catálogo de diagnósticos que usan los expedientes de Veterinaria (propio de PeluDesk, no SNOMED).
// Cada negocio puede ampliarlo con los suyos; aquí se ven para decidir si pasan al catálogo general.
export default async function Diagnosticos({ searchParams }: { searchParams: Promise<{ q?: string; categoria?: string }> }) {
  const { q, categoria } = await searchParams;
  const { supabase } = await exigirPlataforma();
  const [{ data, error }, { data: deNegociosCrudo }] = await Promise.all([
    supabase.from("vet_diagnosticos").select("id, nombre, categoria, especies, sinonimos").is("deleted_at", null).order("categoria").order("nombre"),
    supabase.rpc("plataforma_diagnosticos_de_negocios"),
  ]);
  const todos = (data ?? []) as Diagnostico[];
  const deNegocios = (deNegociosCrudo ?? []) as DeNegocio[];
  const categorias = Array.from(new Set(todos.map((d) => d.categoria))).sort();
  const busqueda = (q ?? "").trim().toLowerCase();
  const filas = todos.filter((d) => {
    if (categoria && d.categoria !== categoria) return false;
    if (busqueda && !`${d.nombre} ${d.sinonimos.join(" ")}`.toLowerCase().includes(busqueda)) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Diagnósticos</h1>
        <p className="mt-1 max-w-3xl text-n-600">
          Catálogo compartido que todos los negocios usan al registrar el diagnóstico de una consulta (presuntivo o definitivo). Es propio de PeluDesk, no es SNOMED. Un cambio aquí lo ven todos al momento; las consultas ya firmadas conservan el nombre que tenían.
        </p>
        <p className="mt-1 text-sm text-n-600">{todos.length} en el catálogo · {deNegocios.length} propuestos por negocios</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Agregar un diagnóstico</h2>
        <FormularioPlataforma accion={guardarDiagnostico} textoBoton="Agregar" reiniciar className="rounded-lg border border-n-200 bg-white p-5">
          <Campos />
        </FormularioPlataforma>
      </section>

      {deNegocios.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-n-900">Agregados por los negocios</h2>
          <p className="text-sm text-n-600">Si uno se repite o es de uso general, agrégalo arriba al catálogo.</p>
          <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white text-sm">
            {deNegocios.map((d, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span className="font-semibold text-n-900">{d.nombre} <span className="font-normal text-n-500">· {d.categoria} · {d.especies.join(" y ")}</span></span>
                <span className="text-n-600">{d.negocio}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-n-900">Catálogo ({filas.length})</h2>
        <form method="get" className="grid gap-3 rounded-lg border border-n-200 bg-white p-4 sm:grid-cols-3">
          <label className="block text-sm font-medium text-n-800 sm:col-span-2">
            Buscar por nombre o sinónimo
            <input name="q" defaultValue={q ?? ""} className={claseCaja} />
          </label>
          <label className="block text-sm font-medium text-n-800">
            Categoría
            <select name="categoria" defaultValue={categoria ?? ""} className={claseCaja}>
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end"><Button type="submit" variante="secundario">Filtrar</Button></div>
        </form>
        {error && <p className="rounded-lg border border-coral bg-coral-suave p-4 text-coral-oscuro">No pudimos cargar el catálogo. Recarga la página.</p>}
        <ul className="flex flex-col gap-2">
          {filas.map((d) => (
            <li key={d.id}>
              <details className="rounded-lg border border-n-200 bg-white">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3">
                  <span className="font-semibold text-n-900">{d.nombre}</span>
                  <span className="rounded-full bg-morado-suave px-2 py-0.5 text-xs font-semibold text-morado">{d.categoria}</span>
                  <span className="text-xs text-n-500">{d.especies.join(" y ")}</span>
                </summary>
                <div className="flex flex-col gap-4 border-t border-n-200 p-4">
                  <FormularioPlataforma accion={guardarDiagnostico} textoBoton="Guardar"><Campos d={d} /></FormularioPlataforma>
                  <FormularioPlataforma accion={bajaDiagnostico} textoBoton="Dar de baja" variante="peligro">
                    <input type="hidden" name="id" value={d.id} />
                    <p className="text-sm text-n-600">Deja de ofrecerse a los negocios. Las consultas que ya lo usan conservan su nombre.</p>
                  </FormularioPlataforma>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
