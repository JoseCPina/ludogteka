import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { topeTimbres } from "../../acciones";

type Fila = { negocio_id: string; nombre: string; slug: string; activa: boolean; modo: string; llave: boolean; tope: number; aviso_pct: number; usados: number };

// Facturación de cada negocio: si la tiene activa, de qué modo, si ya tiene
// llave del PAC, cuántos timbres lleva este mes y su tope.
export default async function FacturacionPlataforma() {
  const { supabase } = await exigirPlataforma();
  const { data, error } = await supabase.rpc("plataforma_cfdi_uso");
  const filas = ((data ?? []) as Fila[]).map((f) => ({ ...f, usados: Number(f.usados), tope: Number(f.tope), aviso_pct: Number(f.aviso_pct) }));
  // El demo (Patitas & Co.) no cuenta en el total.
  const esDemo = (f: Fila) => f.slug === "patitasyco";
  const contadas = filas.filter((f) => !esDemo(f));
  const total = contadas.reduce((a, f) => a + f.usados, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Facturación (CFDI)</h1>
        <p className="mt-1 text-n-600">
          Timbres usados este mes por negocio y su tope. Al acercarse al tope (el porcentaje de aviso) el negocio ve un aviso; al llegar, no puede emitir más facturas hasta el mes que entra. Las llaves del servicio de timbrado son de cada negocio y nadie las lee desde aquí.
        </p>
      </div>
      {error && (
        <Alert variante="error" titulo="No pudimos cargar el uso">
          {error.message}
        </Alert>
      )}
      <section className="rounded-lg border border-n-200 bg-white px-4 py-3">
        <p className="text-sm text-n-600">Timbres del mes, todos los negocios</p>
        <p className="text-2xl font-bold tabular-nums text-n-900">{total.toLocaleString("es-MX")}</p>
      </section>
      <section className="rounded-lg border border-n-200 bg-white p-5">
        <ul className="flex flex-col divide-y divide-n-200">
          {filas.map((f) => {
            const pct = f.tope > 0 ? Math.round((f.usados / f.tope) * 100) : 100;
            return (
              <li key={f.negocio_id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-n-900">
                    {f.nombre} {esDemo(f) && <span className="rounded-full bg-morado-suave px-2 py-0.5 text-xs font-bold uppercase text-morado">Demo</span>}{" "}
                    <span className="text-sm font-normal text-n-600">
                      · {f.slug} · {f.activa ? `activa (${f.modo === "produccion" ? "producción" : "pruebas"})` : "sin activar"} · {f.llave ? "con llave" : "sin llave"}
                    </span>
                  </span>
                  <span className={`text-sm tabular-nums ${pct >= 100 ? "font-semibold text-coral-oscuro" : pct >= f.aviso_pct ? "text-ambar-oscuro" : "text-n-700"}`}>
                    {f.usados} / {f.tope}
                  </span>
                </div>
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-morado">Cambiar su tope</summary>
                  <FormularioPlataforma accion={topeTimbres.bind(null, f.negocio_id)} textoBoton="Guardar tope" variante="secundario" className="mt-2">
                    <div className="grid gap-3 sm:grid-cols-[10rem_10rem_1fr]">
                      <Field label="Timbres al mes" name="tope" type="number" min="0" defaultValue={String(f.tope)} required />
                      <Field label="Avisar al (%)" name="aviso" type="number" min="1" max="100" defaultValue={String(f.aviso_pct)} required />
                      <Field label="Motivo" name="motivo" required placeholder="ej. pasó al plan con 300 timbres" />
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
