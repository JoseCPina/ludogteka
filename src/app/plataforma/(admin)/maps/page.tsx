import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { topeMapsNegocio, topeMapsPlan } from "../../acciones";

type Fila = { negocio_id: string; nombre: string; slug: string; plan: string; usadas: number; geocodificar: number; rutas: number; tope: number; propio: boolean };

// Google Maps de PeluDesk: la llave es una sola, para todos los negocios.
// Aquí se ve cuánto consume cada uno este mes y el total, y se ajusta el
// tope (por plan, o uno propio para un negocio).
export default async function MapsPlataforma({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { supabase } = await exigirPlataforma();
  const { mes: mesParam } = await searchParams;
  const hoy = new Date();
  const mes = /^\d{4}-\d{2}$/.test(mesParam ?? "") ? `${mesParam}-01` : `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`;
  const [{ data, error }, { data: planes }] = await Promise.all([
    supabase.rpc("plataforma_maps_consumo", { p_mes: mes }),
    supabase.from("planes").select("id, nombre, tipo, maps_consultas_mes").eq("tipo", "plan").is("deleted_at", null).order("orden"),
  ]);
  const filas = ((data ?? []) as Fila[]).map((f) => ({ ...f, usadas: Number(f.usadas), geocodificar: Number(f.geocodificar), rutas: Number(f.rutas) }));
  const total = filas.reduce((a, f) => a + f.usadas, 0);
  const geo = filas.reduce((a, f) => a + f.geocodificar, 0);
  const rutas = filas.reduce((a, f) => a + f.rutas, 0);
  const conConsumo = filas.filter((f) => f.usadas > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Google Maps</h1>
        <p className="mt-1 text-n-600">
          Una llave (la de PeluDesk) para todos los negocios. Cada negocio tiene un tope de consultas al mes; al llegar, su recepción
          captura los kilómetros a mano. Mes: {mes.slice(0, 7)} · <a className="font-semibold text-morado underline" href="?">este mes</a>
        </p>
      </div>
      {error && <Alert variante="error" titulo="No pudimos cargar el consumo">{error.message}</Alert>}

      <section className="flex flex-wrap gap-3">
        <div className="rounded-lg border border-n-200 bg-white px-4 py-3">
          <p className="text-sm text-n-600">Consultas en el mes, todos los negocios</p>
          <p className="text-2xl font-bold tabular-nums text-n-900">{total.toLocaleString("es-MX")}</p>
          <p className="text-xs text-n-600">{geo.toLocaleString("es-MX")} de geocodificación · {rutas.toLocaleString("es-MX")} de rutas</p>
        </div>
        <div className="rounded-lg border border-n-200 bg-white px-4 py-3">
          <p className="text-sm text-n-600">Negocios que consultaron</p>
          <p className="text-2xl font-bold tabular-nums text-n-900">{conConsumo.length}</p>
          <p className="text-xs text-n-600">de {filas.length}</p>
        </div>
      </section>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Tope por plan</h2>
        <ul className="mt-3 flex flex-col divide-y divide-n-200 [&>li]:py-3">
          {(planes ?? []).map((p) => (
            <li key={p.id as string}>
              <FormularioPlataforma accion={topeMapsPlan.bind(null, p.id as string)} textoBoton={`Guardar tope de ${p.nombre as string}`} variante="secundario">
                <div className="grid gap-3 sm:grid-cols-[12rem_10rem] sm:items-end">
                  <span className="font-semibold text-n-900 sm:pb-3">{p.nombre as string}</span>
                  <Field label="Consultas al mes" name="tope" type="number" min="0" defaultValue={String(p.maps_consultas_mes ?? 300)} required />
                </div>
              </FormularioPlataforma>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-n-600">Un negocio en prueba usa el tope del plan Completo.</p>
      </section>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Por negocio</h2>
        <ul className="mt-3 flex flex-col divide-y divide-n-200">
          {filas.map((f) => {
            const pct = f.tope > 0 ? Math.round((f.usadas / f.tope) * 100) : 100;
            return (
              <li key={f.negocio_id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-n-900">
                    {f.nombre} <span className="text-sm font-normal text-n-600">· {f.slug} · {f.plan}</span>
                  </span>
                  <span className={`tabular-nums text-sm ${pct >= 100 ? "font-semibold text-coral-oscuro" : pct >= 80 ? "text-ambar-oscuro" : "text-n-700"}`}>
                    {f.usadas} / {f.tope}
                    {f.propio ? " (tope propio)" : ""} · {f.geocodificar} geo · {f.rutas} rutas
                  </span>
                </div>
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-morado">Cambiar su tope</summary>
                  <FormularioPlataforma accion={topeMapsNegocio.bind(null, f.negocio_id)} textoBoton="Guardar tope" variante="secundario" className="mt-2">
                    <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                      <Field label="Consultas al mes" name="tope" type="number" min="0" defaultValue={f.propio ? String(f.tope) : ""} ayuda="Vacío = el de su plan" />
                      <Field label="Motivo" name="motivo" required placeholder="ej. muchas altas con recolección este mes" />
                    </div>
                  </FormularioPlataforma>
                </details>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
