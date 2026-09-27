import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { guardarPlan } from "../../acciones";

type Plan = {
  id: string; clave: string; nombre: string; descripcion: string | null; tipo: string;
  precio_mensual: number; precio_anual: number; modulos: string[]; orden: number; activo: boolean;
};
type Modulo = { clave: string; nombre: string };

function CamposPlan({ p, modulos }: { p?: Plan; modulos: Modulo[] }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" name="nombre" defaultValue={p?.nombre ?? ""} required />
        <Field label="Clave (no se cambia)" name="clave" defaultValue={p?.clave ?? ""} readOnly={Boolean(p)} required />
        <Field label="Precio mensual (sin IVA)" name="precio_mensual" type="number" min={0} step="1" defaultValue={p?.precio_mensual ?? ""} required />
        <Field label="Precio anual (sin IVA)" name="precio_anual" type="number" min={0} step="1" defaultValue={p?.precio_anual ?? ""} ayuda="Vacío: diez meses (dos gratis)." />
        <Field label="Descripción" name="descripcion" defaultValue={p?.descripcion ?? ""} />
        <Field label="Orden" name="orden" type="number" defaultValue={p?.orden ?? 0} />
        <Select label="Tipo" name="tipo" defaultValue={p?.tipo ?? "plan"}>
          <option value="plan">Plan</option>
          <option value="complemento">Complemento</option>
        </Select>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-n-800">Módulos que incluye</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {modulos.map((m) => (
            <label key={m.clave} className="flex items-center gap-2 text-sm text-n-800">
              <input type="checkbox" name="modulos" value={m.clave} defaultChecked={p?.modulos.includes(m.clave)} className="h-4 w-4 accent-morado" />
              {m.nombre}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm text-n-800">
        <input type="checkbox" name="activo" defaultChecked={p?.activo ?? true} className="h-4 w-4 accent-morado" />
        Activo (se ofrece y se puede asignar)
      </label>
    </>
  );
}

// Los planes de PeluDesk: nombre, precio mensual y anual (más IVA) y qué
// módulos incluye. Editarlos cambia al instante lo que tienen los negocios
// en ese plan (subir desbloquea; quitar un módulo lo esconde y lo bloquea,
// sin borrar nada).
export default async function PlanesPlataforma() {
  const { supabase } = await exigirPlataforma();
  const [{ data: planes }, { data: modulos }, { data: negocios }] = await Promise.all([
    supabase.from("planes").select("id, clave, nombre, descripcion, tipo, precio_mensual, precio_anual, modulos, orden, activo").order("orden"),
    supabase.from("modulos").select("clave, nombre").order("orden"),
    supabase.rpc("plataforma_negocios"),
  ]);
  const lista = (planes ?? []) as Plan[];
  const mods = (modulos ?? []) as Modulo[];
  const porPlan = new Map<string, number>();
  for (const n of (negocios ?? []) as { plan_id: string | null; plan: string }[]) {
    if (n.plan_id) porPlan.set(n.plan_id, (porPlan.get(n.plan_id) ?? 0) + 1);
  }
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Planes</h1>
        <p className="mt-1 text-n-600">Precios sin IVA. Lo que cambies aquí aplica al instante a los negocios de ese plan.</p>
      </div>
      {lista.map((p) => (
        <section key={p.id} className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold text-n-900">
              {p.nombre} {p.tipo === "complemento" && <span className="text-sm font-medium text-n-600">(complemento)</span>}
            </h2>
            <span className="text-sm text-n-600">
              {porPlan.get(p.id) ?? 0} {porPlan.get(p.id) === 1 ? "negocio" : "negocios"}
            </span>
          </div>
          <FormularioPlataforma accion={guardarPlan.bind(null, p.id)} textoBoton="Guardar plan" variante="secundario">
            <CamposPlan p={p} modulos={mods} />
          </FormularioPlataforma>
        </section>
      ))}
      <section className="flex flex-col gap-4 rounded-lg border border-dashed border-n-300 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Plan nuevo</h2>
        <FormularioPlataforma accion={guardarPlan.bind(null, null)} textoBoton="Crear plan" reiniciar>
          <CamposPlan modulos={mods} />
        </FormularioPlataforma>
      </section>
    </div>
  );
}
