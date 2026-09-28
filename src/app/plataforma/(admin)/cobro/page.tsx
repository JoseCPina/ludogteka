import Link from "next/link";
import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { formatearFecha } from "@/lib/formato";
import { Alert } from "@/components/ui/alert";
import { TASA_IVA, pesosDeCentavos } from "@/lib/cobro/iva";
import { estadoCobro } from "@/lib/cobro/estados";
import { modoStripe, stripeConfigurado } from "@/lib/cobro/stripe";

type Fila = {
  negocio_id: string; slug: string; nombre: string; estado: string; plan: string; plan_nombre: string | null;
  periodicidad: string | null; complementos: string[]; monto_centavos: number | null; mensual_centavos: number | null;
  periodo_fin: string | null; prueba_termina_at: string | null; primer_fallo_at: string | null; cancela_al_terminar: boolean;
  stripe_customer_id: string | null; stripe_subscription_id: string | null; estado_stripe: string | null; modo: string | null;
  ultimo_pago_at: string | null; pagos: number; pagado_centavos: number;
};

const ZONA = "America/Mexico_City";
const fecha = (iso: string | null) => (iso ? formatearFecha(iso, ZONA) : "—");
const ORDEN = ["gracia", "solo_lectura", "al_corriente", "prueba", "prueba_vencida", "cancelado", "sin_cobro", "exento"];
// Lo que cuenta como ingreso recurrente: suscripciones que se están cobrando.
const RECURRENTE = new Set(["al_corriente", "gracia"]);

// El cobro de PeluDesk a sus negocios: estado de cada uno, cuánto paga y el
// ingreso mensual recurrente (el anual cuenta como la doceava parte).
// Ludogteka y el demo están fuera del cobro.
export default async function CobroPlataforma() {
  const { supabase } = await exigirPlataforma();
  const { data, error } = await supabase.rpc("plataforma_cobros");
  const filas = ((data ?? []) as Fila[]).sort((a, b) => ORDEN.indexOf(a.estado) - ORDEN.indexOf(b.estado));
  const mrr = filas.filter((f) => RECURRENTE.has(f.estado) && !f.cancela_al_terminar).reduce((a, f) => a + (f.mensual_centavos ?? 0), 0);
  const enPruebaContratado = filas.filter((f) => f.estado === "prueba" && f.estado_stripe === "trialing").reduce((a, f) => a + (f.mensual_centavos ?? 0), 0);
  const porEstado = new Map<string, number>();
  for (const f of filas) porEstado.set(f.estado, (porEstado.get(f.estado) ?? 0) + 1);
  const cobradoTotal = filas.reduce((a, f) => a + Number(f.pagado_centavos ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Cobro</h1>
        <p className="mt-1 text-n-600">
          Suscripciones con Stripe ({stripeConfigurado() ? `modo ${modoStripe()}` : "no configurado"}). El estado lo manda Stripe: un pago fallido da 7
          días de gracia y al día 8 el negocio queda en solo lectura; si paga, se reactiva solo.
        </p>
      </div>
      {error && <Alert variante="error" titulo="No pudimos cargar el cobro">{error.message}</Alert>}
      <section className="flex flex-wrap gap-3">
        <div className="rounded-lg border border-n-200 bg-white px-4 py-3">
          <p className="text-sm text-n-600">Ingreso mensual recurrente</p>
          <p className="text-2xl font-bold tabular-nums text-n-900">{pesosDeCentavos(Math.round(mrr / (1 + TASA_IVA)))}</p>
          <p className="text-xs text-n-600">+ IVA · {pesosDeCentavos(mrr)} con IVA</p>
        </div>
        <div className="rounded-lg border border-n-200 bg-white px-4 py-3">
          <p className="text-sm text-n-600">Contratado en prueba (aún sin cobrar)</p>
          <p className="text-2xl font-bold tabular-nums text-n-900">{pesosDeCentavos(Math.round(enPruebaContratado / (1 + TASA_IVA)))}</p>
          <p className="text-xs text-n-600">+ IVA al mes</p>
        </div>
        <div className="rounded-lg border border-n-200 bg-white px-4 py-3">
          <p className="text-sm text-n-600">Cobrado a la fecha</p>
          <p className="text-2xl font-bold tabular-nums text-n-900">{pesosDeCentavos(cobradoTotal)}</p>
          <p className="text-xs text-n-600">con IVA</p>
        </div>
        {ORDEN.filter((e) => porEstado.get(e)).map((e) => (
          <div key={e} className="rounded-lg border border-n-200 bg-white px-4 py-3">
            <p className="text-sm text-n-600">{estadoCobro(e).texto}</p>
            <p className="text-2xl font-bold tabular-nums text-n-900">{porEstado.get(e)}</p>
          </div>
        ))}
      </section>
      <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-n-50 text-n-700">
            <tr>
              <th className="px-3 py-2">Negocio</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2 text-right">Cobro (con IVA)</th>
              <th className="px-3 py-2">Próximo cobro / fin</th>
              <th className="px-3 py-2">Último pago</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-n-200">
            {filas.map((f) => {
              const e = estadoCobro(f.estado);
              return (
                <tr key={f.negocio_id}>
                  <td className="px-3 py-2">
                    <Link href={`/plataforma/negocios/${f.negocio_id}`} className="font-semibold text-n-900 hover:underline">{f.nombre}</Link>
                    <span className="block text-xs text-n-600">{f.slug}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.clase}`}>{e.texto}</span>
                    {f.cancela_al_terminar && <span className="block text-xs text-coral-oscuro">Cancela al terminar el periodo</span>}
                    {f.primer_fallo_at && <span className="block text-xs text-n-600">Falló el {fecha(f.primer_fallo_at)}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {f.plan_nombre ?? "—"}
                    {f.periodicidad ? ` · ${f.periodicidad}` : ""}
                    {f.complementos.includes("pagina_web") ? " + web" : ""}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.monto_centavos != null ? pesosDeCentavos(f.monto_centavos) : "—"}</td>
                  <td className="px-3 py-2">{f.estado === "prueba" && !f.periodo_fin ? fecha(f.prueba_termina_at) : fecha(f.periodo_fin)}</td>
                  <td className="px-3 py-2">{fecha(f.ultimo_pago_at)}{f.pagos ? ` (${f.pagos})` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
