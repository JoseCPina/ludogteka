import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Desplegable, FormularioAccion } from "@/components/formulario-accion";
import { formatearFechaCalendario, hoyNegocio } from "@/lib/formato";
import { moneda } from "@/lib/empleados/textos";
import { CADA_MESES, CUBRE } from "@/lib/gastos/textos";
import { cambiarRecurrente, crearRecurrente } from "../gastos-actions";
import { zonaActual } from "@/lib/negocio/actual";

type Recurrente = {
  id: string;
  concepto: string;
  monto_estimado: number | null;
  cada_meses: number;
  dia: number;
  cubre: string;
  proxima_fecha: string;
  activo: boolean;
  categorias_gasto: { nombre: string } | null;
  proveedores: { nombre: string } | null;
};

// Plantillas de lo que se repite (renta el día 1, internet mensual, luz
// cada dos meses). Cada una genera el gasto esperado de su periodo 15 días
// antes de que venza; se marca pagado con su monto real en Gastos.
export default async function RecurrentesPage() {
  const zona = await zonaActual();
  const supabase = await createSupabaseServerClient();
  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio(zona);
  const [{ data: recurrentes }, { data: categorias }, { data: proveedores }] = await Promise.all([
    supabase
      .from("gastos_recurrentes")
      .select("id, concepto, monto_estimado, cada_meses, dia, cubre, proxima_fecha, activo, categorias_gasto(nombre), proveedores(nombre)")
      .is("deleted_at", null)
      .order("activo", { ascending: false })
      .order("proxima_fecha"),
    supabase.from("categorias_gasto").select("id, nombre").is("deleted_at", null).order("orden"),
    supabase.from("proveedores").select("id, nombre").is("deleted_at", null).order("nombre"),
  ]);
  const lista = (recurrentes ?? []) as unknown as Recurrente[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/gastos" className="text-sm font-semibold text-azul hover:underline">
          ← Gastos
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Gastos recurrentes</h1>
        <p className="mt-1 max-w-3xl text-n-600">
          Lo que se paga seguido. Quince días antes de cada vencimiento aparece en «Por pagar» con el monto estimado, y en «Necesita
          atención» del tablero cuando falta una semana o ya venció. Se marca pagado con lo que de verdad se pagó.
        </p>
      </div>

      {lista.length === 0 ? (
        <p className="rounded-lg border-[1.5px] border-dashed border-n-300 bg-white p-8 text-center text-n-600">Todavía no hay gastos recurrentes.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((r) => (
            <li key={r.id} className={`flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-3 ${r.activo ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-n-900">
                    {r.concepto} <span className="text-sm font-normal text-n-500">· {r.categorias_gasto?.nombre}</span>
                  </p>
                  <p className="text-sm text-n-600">
                    {CADA_MESES[r.cada_meses] ?? `Cada ${r.cada_meses} meses`}, el día {r.dia}
                    {r.proveedores?.nombre && ` · ${r.proveedores.nombre}`}
                    {r.monto_estimado ? ` · estimado ${moneda(r.monto_estimado)}` : ""}
                  </p>
                  <p className="text-xs text-n-500">
                    {r.cubre === "meses_anteriores" ? "Cubre los meses anteriores al vencimiento" : "Cubre desde el mes en que vence"}
                    {r.activo ? ` · siguiente: ${formatearFechaCalendario(r.proxima_fecha)}` : " · pausado"}
                  </p>
                </div>
              </div>
              <Desplegable texto="Cambiar">
                <FormularioAccion accion={cambiarRecurrente.bind(null, r.id)} textoBoton="Guardar">
                  <Field label="Monto estimado" name="monto_estimado" type="number" step="0.01" min="0" defaultValue={r.monto_estimado ?? ""} />
                  <label className="flex items-center gap-2 text-n-800">
                    <input type="checkbox" name="activo" defaultChecked={r.activo} className="h-5 w-5" />
                    Activo (si lo quitas, deja de generar pagos esperados; lo ya generado se queda)
                  </label>
                </FormularioAccion>
              </Desplegable>
            </li>
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-3 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Nuevo gasto recurrente</h2>
        <FormularioAccion accion={crearRecurrente} textoBoton="Guardar" reiniciar>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Concepto" name="concepto" required placeholder="Renta del local, internet, luz (CFE)…" />
            <Select label="Categoría" name="categoria_id" required defaultValue="">
              <option value="" disabled>
                Elige
              </option>
              {(categorias ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
            <Select label="Cada cuándo" name="cada_meses" defaultValue="1">
              {Object.entries(CADA_MESES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Field label="Siguiente vencimiento" name="primer_vencimiento" type="date" defaultValue={hoy} required ayuda="El día del mes se repite en los siguientes." />
            <Field label="Monto estimado (opcional)" name="monto_estimado" type="number" step="0.01" min="0" />
            <Select label="Proveedor (opcional)" name="proveedor_id" defaultValue="">
              <option value="">Sin proveedor</option>
              {(proveedores ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </div>
          <Select label="Qué periodo cubre cada pago" name="cubre" defaultValue="mes_del_pago">
            {Object.entries(CUBRE).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Textarea label="Notas (opcional)" name="notas" rows={2} />
        </FormularioAccion>
      </section>
    </div>
  );
}
