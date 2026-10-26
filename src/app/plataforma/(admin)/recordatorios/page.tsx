import Link from "next/link";
import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { leerTodo } from "@/lib/supabase/paginar";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { RevisarTarifa } from "./revisar-tarifa";

type Fila = {
  negocio_id: string;
  negocio: string;
  mensajes: number;
  cobrables: number;
  excedentes: number;
  costo_mxn: number;
  cobrado_mxn: number;
  margen_mxn: number;
  sin_reportar: number;
};
type Precio = { vigente_desde: string; moneda_meta: string; costo_meta: number; tipo_cambio: number; costo_mxn: number; precio_mxn: number; gratis_mes: number; fuente: string };

const pesos = (n: number, d = 2) => `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

// Recordatorios automáticos por WhatsApp: por negocio y mes, cuántos salieron, lo que nos cobró Meta (los entregados
// que Meta cobra), lo que se cobró de excedente y el margen; y la tabla de precios (la hoja de tarifas de Meta).
export default async function RecordatoriosPlataforma({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { supabase } = await exigirPlataforma();
  const { mes: mesParam } = await searchParams;
  const hoy = new Date().toISOString().slice(0, 7);
  const mes = /^\d{4}-\d{2}$/.test(mesParam ?? "") ? mesParam! : hoy;
  const [anio, m] = mes.split("-").map(Number);
  const anterior = new Date(Date.UTC(anio, m - 2, 1)).toISOString().slice(0, 7);
  const siguiente = new Date(Date.UTC(anio, m, 1)).toISOString().slice(0, 7);
  const [{ data, error }, { data: precios }] = await Promise.all([
    leerTodo<Record<string, unknown>>(() => supabase.rpc("plataforma_recordatorios_uso", { p_mes: `${mes}-01` }).order("negocio_id")),
    // El costo de Meta no se publica (solo precio y gratis): la plataforma lo lee con la llave de servicio, ya comprobada su sesión.
    createSupabaseAdminClient().from("wa_precios").select("vigente_desde, moneda_meta, costo_meta, tipo_cambio, costo_mxn, precio_mxn, gratis_mes, fuente").is("deleted_at", null).order("vigente_desde", { ascending: false }).limit(12),
  ]);
  const filas = (data ?? []) as unknown as Fila[];
  const total = filas.reduce(
    (a, f) => ({ mensajes: a.mensajes + Number(f.mensajes), cobrables: a.cobrables + Number(f.cobrables), excedentes: a.excedentes + Number(f.excedentes), costo: a.costo + Number(f.costo_mxn), cobrado: a.cobrado + Number(f.cobrado_mxn) }),
    { mensajes: 0, cobrables: 0, excedentes: 0, costo: 0, cobrado: 0 }
  );
  const lista = (precios ?? []) as Precio[];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-n-900">Recordatorios de WhatsApp</h1>
        <p className="mt-1 text-n-700">
          Lo que salió por negocio en el mes, lo que nos cobra Meta (solo los entregados que Meta cobra), lo cobrado de excedente (sin IVA) y el margen. El
          excedente se reporta a Stripe como uso medido de la suscripción.
        </p>
      </header>
      <nav className="flex items-center gap-3 text-sm font-semibold">
        <Link className="text-morado underline" href={`/plataforma/recordatorios?mes=${anterior}`}>← {anterior}</Link>
        <span className="text-n-900">{mes}</span>
        <Link className="text-morado underline" href={`/plataforma/recordatorios?mes=${siguiente}`}>{siguiente} →</Link>
      </nav>
      {error && <p className="text-coral-oscuro">No se pudo leer el uso: {error.message}</p>}
      <div className="overflow-x-auto rounded-xl border border-n-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-n-50 text-left text-n-600">
            <tr>
              <th className="p-2">Negocio</th>
              <th className="p-2 text-right">Mensajes</th>
              <th className="p-2 text-right">Entregados cobrables</th>
              <th className="p-2 text-right">Excedentes</th>
              <th className="p-2 text-right">Costo Meta</th>
              <th className="p-2 text-right">Cobrado</th>
              <th className="p-2 text-right">Margen</th>
              <th className="p-2 text-right">Sin reportar a Stripe</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td className="p-3 text-n-600" colSpan={8}>Ningún recordatorio entregado en {mes}.</td>
              </tr>
            )}
            {filas.map((f) => (
              <tr key={f.negocio_id} className="border-t border-n-100" data-uso-negocio={f.negocio_id}>
                <td className="p-2"><Link className="text-morado underline" href={`/plataforma/negocios/${f.negocio_id}`}>{f.negocio}</Link></td>
                <td className="p-2 text-right">{f.mensajes}</td>
                <td className="p-2 text-right">{f.cobrables}</td>
                <td className="p-2 text-right">{f.excedentes}</td>
                <td className="p-2 text-right">{pesos(f.costo_mxn, 4)}</td>
                <td className="p-2 text-right">{pesos(f.cobrado_mxn)}</td>
                <td className="p-2 text-right">{pesos(f.margen_mxn, 4)}</td>
                <td className="p-2 text-right">{f.sin_reportar}</td>
              </tr>
            ))}
            {filas.length > 0 && (
              <tr className="border-t border-n-200 font-semibold">
                <td className="p-2">Total</td>
                <td className="p-2 text-right">{total.mensajes}</td>
                <td className="p-2 text-right">{total.cobrables}</td>
                <td className="p-2 text-right">{total.excedentes}</td>
                <td className="p-2 text-right">{pesos(total.costo, 4)}</td>
                <td className="p-2 text-right">{pesos(total.cobrado)}</td>
                <td className="p-2 text-right">{pesos(total.cobrado - total.costo, 4)}</td>
                <td className="p-2" />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <section className="flex flex-col gap-3 rounded-xl border border-n-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-n-900">Precio por mensaje</h2>
        <p className="text-sm text-n-700">
          De la hoja de tarifas de Meta (México, utilidad) en la moneda de nuestra cuenta; al negocio, el doble redondeado a centavos, más IVA. La tarea de
          recordatorios la revisa una vez al día y guarda un precio nuevo solo si cambió.
        </p>
        <ul className="divide-y divide-n-100 text-sm">
          {lista.map((p) => (
            <li key={p.vigente_desde} className="py-2" data-precio-vigente={p.vigente_desde}>
              <span className="font-semibold text-n-900">Desde {p.vigente_desde}:</span> Meta {Number(p.costo_meta)} {p.moneda_meta}
              {p.moneda_meta !== "MXN" ? ` × ${Number(p.tipo_cambio)} = ${pesos(p.costo_mxn, 4)}` : ""} · al negocio {pesos(p.precio_mxn)} + IVA · {p.gratis_mes} gratis al mes
              <span className="block text-xs text-n-500">{p.fuente}</span>
            </li>
          ))}
        </ul>
        <RevisarTarifa />
      </section>
    </div>
  );
}
