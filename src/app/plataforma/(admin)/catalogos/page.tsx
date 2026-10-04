import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { Field } from "@/components/ui/field";
import { guardarEtiqueta, guardarRaza, resolverPropuestaRaza } from "../../acciones";

type Raza = { id: string; nombre: string; alias: string[] | null; es_desconocida: boolean | null; tamano_tipico_id: string | null; pelaje_tipico_id: string | null };
type Propuesta = {
  id: string; negocio_nombre: string; nombre: string; variantes: string[]; tamano: string | null; pelaje: string | null; estado: string; motivo: string | null;
  perros: number; creada_at: string; resuelta_at: string | null; raza_nombre: string | null; parecidas: { raza_id: string; nombre: string; puntaje: number }[];
};
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
  const { data: razas } = await supabase.from("razas").select("id, nombre, alias, es_desconocida, tamano_tipico_id, pelaje_tipico_id").is("deleted_at", null).order("nombre");
  const { data: propuestasCrudo } = await supabase.rpc("plataforma_razas_propuestas");
  const propuestas = (propuestasCrudo ?? []) as Propuesta[];
  const pendientes = propuestas.filter((p) => p.estado === "pendiente");
  const { data: tallas } = await supabase.from("tamanos_categoria").select("id, etiqueta").is("deleted_at", null).order("orden");
  const { data: pelos } = await supabase.from("tipos_pelaje").select("id, etiqueta").is("deleted_at", null).order("orden");
  const selectTalla = (n: string, v?: string | null) => (
    <label className="block text-sm font-medium text-n-800">
      {n === "tamano_tipico_id" ? "Talla típica" : "Tipo de pelo"}
      <select name={n} defaultValue={v ?? ""} className="mt-1.5 min-h-12 w-full rounded-md border-[1.5px] border-borde bg-white px-3.5 text-base text-n-900">
        <option value="">No sé</option>
        {((n === "tamano_tipico_id" ? tallas : pelos) ?? []).map((t) => (<option key={t.id as string} value={t.id as string}>{t.etiqueta as string}</option>))}
      </select>
    </label>
  );
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
        <h2 className="text-lg font-bold text-n-900">Propuestas de razas nuevas ({pendientes.length} pendientes)</h2>
        <p className="text-n-600">
          Los negocios proponen razas que no encuentran. Al aprobar, entra al catálogo de todos y los perros que la propusieron se ligan solos; ningún negocio recibe grupo de precio: cada uno decide el suyo.
        </p>
        {propuestas.length === 0 && <p className="rounded-lg border border-n-200 bg-white p-4 text-n-700">No hay propuestas.</p>}
        <ul className="flex flex-col gap-3">
          {propuestas.map((p) => (
            <li key={p.id} className="rounded-lg border border-n-200 bg-white p-4">
              <p className="font-bold text-n-900">
                {p.nombre} <span className="font-normal text-n-600">· {p.negocio_nombre} · {p.perros} perro(s) · {new Date(p.creada_at).toLocaleDateString("es-MX")}</span>
              </p>
              <p className="text-sm text-n-600">
                {p.variantes.length ? `Variantes: ${p.variantes.join(", ")}. ` : ""}
                {p.tamano ? `Talla: ${p.tamano}. ` : ""}
                {p.pelaje ? `Pelo: ${p.pelaje}.` : ""}
              </p>
              {p.estado !== "pendiente" ? (
                <p className="mt-2 text-sm font-semibold text-n-700">
                  {p.estado === "rechazada" ? `Rechazada: ${p.motivo}` : p.estado === "variante" ? `Aprobada como variante de ${p.raza_nombre}` : `Aprobada como ${p.raza_nombre}`}
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-3">
                  {p.parecidas.length > 0 && <p className="text-sm text-n-700">Se parece a: {p.parecidas.map((x) => `${x.nombre} (${Math.round(x.puntaje * 100)} %)`).join(", ")}</p>}
                  <FormularioPlataforma accion={resolverPropuestaRaza} textoBoton="Aprobar como raza nueva" variante="exito" className="rounded-lg border border-n-200 p-4">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="accion" value="aprobar" />
                    <Field label="Nombre final en el catálogo" name="nombre" defaultValue={p.nombre} />
                  </FormularioPlataforma>
                  <FormularioPlataforma accion={resolverPropuestaRaza} textoBoton="Aprobar como variante de…" variante="secundario" className="rounded-lg border border-n-200 p-4">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="accion" value="variante" />
                    <label className="block text-sm font-medium text-n-800">
                      Raza existente
                      <select name="raza_destino" required defaultValue={p.parecidas[0]?.raza_id ?? ""} className="mt-1.5 min-h-12 w-full rounded-md border-[1.5px] border-borde bg-white px-3.5 text-base text-n-900">
                        <option value="">Elige una raza</option>
                        {((razas ?? []) as Raza[]).map((r) => (<option key={r.id} value={r.id}>{r.nombre}</option>))}
                      </select>
                    </label>
                  </FormularioPlataforma>
                  <FormularioPlataforma accion={resolverPropuestaRaza} textoBoton="Rechazar" variante="peligro" className="rounded-lg border border-n-200 p-4">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="accion" value="rechazar" />
                    <Field label="Motivo (lo ve el negocio)" name="motivo" required />
                  </FormularioPlataforma>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-n-900">Razas ({(razas ?? []).length})</h2>
        <FormularioPlataforma accion={guardarRaza} textoBoton="Agregar raza" reiniciar className="rounded-lg border border-n-200 bg-white p-5">
          <Field label="Nombre" name="nombre" required />
          <Field label="Otros nombres (separados por coma)" name="alias" ayuda="Como la escribe la gente: «shitzu, shih-tzu»." />
          {selectTalla("tamano_tipico_id")}
          {selectTalla("pelaje_tipico_id")}
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
                  {selectTalla("tamano_tipico_id", r.tamano_tipico_id)}
                  {selectTalla("pelaje_tipico_id", r.pelaje_tipico_id)}
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
