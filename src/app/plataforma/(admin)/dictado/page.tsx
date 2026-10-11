import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { topeDictadoNegocio } from "../../acciones";
import { cuentaEnTotales, esDemo } from "@/lib/plataforma/metricas";
import { conInterno } from "@/lib/plataforma/internos";

type Fila = { negocio_id: string; nombre: string; slug: string; plan: string; dictados: number; minutos: number; tope: number; propio: boolean; conserva_audio: boolean };

// Dictado por voz del módulo Veterinaria: minutos de transcripción que consume cada negocio en el mes y su tope.
export default async function DictadoPlataforma({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { supabase } = await exigirPlataforma();
  const { mes: mesParam } = await searchParams;
  const hoy = new Date();
  const mes = /^\d{4}-\d{2}$/.test(mesParam ?? "") ? `${mesParam}-01` : `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`;
  const { data, error } = await supabase.rpc("plataforma_dictado_resumen", { p_mes: mes });
  const filas = (await conInterno(supabase, (data ?? []) as Fila[])).map((f) => ({ ...f, dictados: Number(f.dictados), minutos: Number(f.minutos), tope: Number(f.tope) }));
  const contadas = filas.filter(cuentaEnTotales);
  const total = contadas.reduce((a, f) => a + f.minutos, 0);
  const conUso = contadas.filter((f) => f.minutos > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Dictado por voz</h1>
        <p className="mt-1 text-n-600">
          La transcripción es un servicio de PeluDesk, con un tope de minutos al mes por negocio. Al llegar al tope el dictado se detiene y se avisa;
          escribir la consulta a mano sigue igual. Mes: {mes.slice(0, 7)} · <a className="font-semibold text-morado underline" href="?">este mes</a>
        </p>
      </div>
      {error && <Alert variante="error" titulo="No pudimos cargar el consumo">{error.message}</Alert>}
      <section className="flex flex-wrap gap-3">
        <div className="rounded-lg border border-n-200 bg-white px-4 py-3">
          <p className="text-sm text-n-600">Minutos dictados en el mes</p>
          <p className="text-2xl font-bold tabular-nums text-n-900">{total.toLocaleString("es-MX")}</p>
        </div>
        <div className="rounded-lg border border-n-200 bg-white px-4 py-3">
          <p className="text-sm text-n-600">Negocios que dictaron</p>
          <p className="text-2xl font-bold tabular-nums text-n-900">{conUso.length}</p>
          <p className="text-xs text-n-600">de {contadas.length}</p>
        </div>
      </section>
      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Por negocio</h2>
        <ul className="mt-3 flex flex-col divide-y divide-n-200">
          {filas.map((f) => {
            const pct = f.tope > 0 ? Math.round((f.minutos / f.tope) * 100) : 100;
            return (
              <li key={f.negocio_id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-n-900">
                    {f.nombre} {esDemo(f) && <span className="rounded-full bg-morado-suave px-2 py-0.5 text-xs font-bold uppercase text-morado">Demo</span>} {f.interno && <span className="rounded-full bg-morado-suave px-2 py-0.5 text-xs font-bold uppercase text-morado">Interno</span>} <span className="text-sm font-normal text-n-600">· {f.slug} · {f.plan}{f.conserva_audio ? " · conserva audio 30 días" : ""}</span>
                  </span>
                  <span className={`tabular-nums text-sm ${pct >= 100 ? "font-semibold text-coral-oscuro" : pct >= 80 ? "text-ambar-oscuro" : "text-n-700"}`}>
                    {f.minutos} / {f.tope} min{f.propio ? " (tope propio)" : ""} · {f.dictados} dictados
                  </span>
                </div>
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-morado">Cambiar su tope</summary>
                  <FormularioPlataforma accion={topeDictadoNegocio.bind(null, f.negocio_id)} textoBoton="Guardar tope" variante="secundario" className="mt-2">
                    <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                      <Field label="Minutos al mes" name="tope" type="number" min="0" defaultValue={f.propio ? String(f.tope) : ""} ayuda="Vacío = el de su plan" />
                      <Field label="Motivo" name="motivo" required placeholder="ej. clínica con mucha consulta este mes" />
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
