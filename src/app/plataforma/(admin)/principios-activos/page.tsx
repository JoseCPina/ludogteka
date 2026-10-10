import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { CLASIFICACIONES_LGS, GRUPOS_SENASICA, etiquetaGrupo, etiquetaLgs } from "@/app/(staff)/veterinaria/comun";
import { bajaPrincipioActivo, guardarPrincipioActivo } from "./acciones";

type Principio = {
  id: string;
  nombre: string;
  grupo_senasica: string | null;
  clasificacion_lgs: string | null;
  es_antimicrobiano: boolean;
  por_confirmar: boolean;
  nota: string | null;
  fuente: string | null;
};

const selectClase = "mt-1.5 min-h-12 w-full rounded-md border-[1.5px] border-borde bg-white px-3.5 text-base text-n-900";

function Campos({ p }: { p?: Principio }) {
  return (
    <>
      {p && <input type="hidden" name="id" value={p.id} />}
      <Field label="Nombre" name="nombre" defaultValue={p?.nombre ?? ""} required />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-n-800">
          Grupo SENASICA
          <select name="grupo_senasica" defaultValue={p?.grupo_senasica ?? ""} className={selectClase}>
            <option value="">Ninguno</option>
            {GRUPOS_SENASICA.map((g) => (
              <option key={g.valor} value={g.valor}>
                {g.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-n-800">
          Clasificación de la Ley General de Salud
          <select name="clasificacion_lgs" defaultValue={p?.clasificacion_lgs ?? ""} className={selectClase}>
            <option value="">Ninguna</option>
            {CLASIFICACIONES_LGS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-n-800">
        <input type="checkbox" name="es_antimicrobiano" defaultChecked={p?.es_antimicrobiano ?? false} className="h-5 w-5" />
        Es un antimicrobiano
      </label>
      <label className="flex items-center gap-2 text-n-800">
        <input type="checkbox" name="por_confirmar" defaultChecked={p?.por_confirmar ?? false} className="h-5 w-5" />
        Clasificación por confirmar
      </label>
      <Field label="Nota (opcional)" name="nota" defaultValue={p?.nota ?? ""} />
    </>
  );
}

// El catálogo que los negocios usan al dar de alta un producto clínico: al
// elegir un principio activo se prellenan sus clasificaciones (cada producto
// guarda las suyas). Solo la administración de PeluDesk lo edita.
export default async function PrincipiosActivos({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; grupo?: string; lgs?: string; confirmar?: string }>;
}) {
  const { q, grupo, lgs, confirmar } = await searchParams;
  const { supabase } = await exigirPlataforma();
  const { data, error } = await supabase
    .from("principios_activos")
    .select("id, nombre, grupo_senasica, clasificacion_lgs, es_antimicrobiano, por_confirmar, nota, fuente")
    .is("deleted_at", null)
    .order("nombre");
  const todos = (data ?? []) as Principio[];
  const busqueda = (q ?? "").trim().toLowerCase();
  const filas = todos.filter((p) => {
    if (busqueda && !p.nombre.toLowerCase().includes(busqueda)) return false;
    if (grupo === "ninguno" && p.grupo_senasica) return false;
    if (grupo && ["I", "II", "III"].includes(grupo) && p.grupo_senasica !== grupo) return false;
    if (lgs === "ninguna" && p.clasificacion_lgs) return false;
    if (lgs && lgs !== "ninguna" && p.clasificacion_lgs !== lgs) return false;
    if (confirmar === "1" && !p.por_confirmar) return false;
    return true;
  });
  const porConfirmar = todos.filter((p) => p.por_confirmar).length;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Principios activos</h1>
        <p className="mt-1 max-w-3xl text-n-600">
          Catálogo compartido que todos los negocios usan al dar de alta un producto clínico: al elegir un principio activo se prellenan su grupo SENASICA y su clasificación de la Ley General de Salud, y cada negocio puede cambiarlas en su producto. Un cambio aquí lo ven todos al momento; los productos que ya existen conservan lo que tienen guardado.
        </p>
        <p className="mt-1 text-sm text-n-600">
          {todos.length} en el catálogo · {porConfirmar} por confirmar
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Agregar un principio activo</h2>
        <FormularioPlataforma accion={guardarPrincipioActivo} textoBoton="Agregar" reiniciar className="rounded-lg border border-n-200 bg-white p-5">
          <Campos />
        </FormularioPlataforma>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-n-900">Catálogo ({filas.length})</h2>
        <form method="get" className="grid gap-3 rounded-lg border border-n-200 bg-white p-4 sm:grid-cols-4">
          <label className="block text-sm font-medium text-n-800 sm:col-span-4">
            Buscar por nombre
            <input name="q" defaultValue={q ?? ""} className={selectClase} />
          </label>
          <label className="block text-sm font-medium text-n-800">
            Grupo SENASICA
            <select name="grupo" defaultValue={grupo ?? ""} className={selectClase}>
              <option value="">Todos</option>
              {GRUPOS_SENASICA.map((g) => (
                <option key={g.valor} value={g.valor}>
                  {g.etiqueta}
                </option>
              ))}
              <option value="ninguno">Sin grupo</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-n-800">
            Ley General de Salud
            <select name="lgs" defaultValue={lgs ?? ""} className={selectClase}>
              <option value="">Todas</option>
              {CLASIFICACIONES_LGS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.corta}
                </option>
              ))}
              <option value="ninguna">Sin clasificación</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-n-800">
            Confirmación
            <select name="confirmar" defaultValue={confirmar ?? ""} className={selectClase}>
              <option value="">Todos</option>
              <option value="1">Solo por confirmar</option>
            </select>
          </label>
          <div className="flex items-end">
            <Button type="submit" variante="secundario">
              Filtrar
            </Button>
          </div>
        </form>

        {error && <p className="rounded-lg border border-coral bg-coral-suave p-4 text-coral-oscuro">No pudimos cargar el catálogo. Recarga la página.</p>}
        {!error && filas.length === 0 && <p className="rounded-lg border border-n-200 bg-white p-4 text-n-700">Ningún principio activo cumple el filtro.</p>}
        <ul className="flex flex-col gap-2">
          {filas.map((p) => (
            <li key={p.id}>
              <details className="rounded-lg border border-n-200 bg-white">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3">
                  <span className="font-semibold text-n-900">{p.nombre}</span>
                  {etiquetaGrupo(p.grupo_senasica) && <span className="rounded-full bg-morado-suave px-2 py-0.5 text-xs font-semibold text-morado">{etiquetaGrupo(p.grupo_senasica)}</span>}
                  {etiquetaLgs(p.clasificacion_lgs) && <span className="rounded-full bg-morado-suave px-2 py-0.5 text-xs font-semibold text-morado">{etiquetaLgs(p.clasificacion_lgs)}</span>}
                  {p.es_antimicrobiano && <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-800">Antimicrobiano</span>}
                  {p.por_confirmar && <span className="rounded-full bg-ambar-suave px-2 py-0.5 text-xs font-semibold text-ambar-oscuro">Por confirmar</span>}
                </summary>
                <div className="flex flex-col gap-4 border-t border-n-200 p-4">
                  {p.fuente && <p className="text-xs text-n-500">Fuente: {p.fuente}</p>}
                  <FormularioPlataforma accion={guardarPrincipioActivo} textoBoton="Guardar">
                    <Campos p={p} />
                  </FormularioPlataforma>
                  <FormularioPlataforma accion={bajaPrincipioActivo} textoBoton="Dar de baja" variante="peligro">
                    <input type="hidden" name="id" value={p.id} />
                    <p className="text-sm text-n-600">Deja de ofrecerse a los negocios. Los productos que ya lo usan conservan sus clasificaciones.</p>
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
