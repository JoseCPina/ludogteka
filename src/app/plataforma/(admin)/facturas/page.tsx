import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { pesosDeCentavos } from "@/lib/cobro/iva";
import { formatearFecha } from "@/lib/formato";
import { leerTodo } from "@/lib/supabase/paginar";
import { marcarFacturaPeludesk } from "../../acciones";

type Fila = {
  id: string;
  negocio_nombre: string;
  modo: string;
  stripe_invoice_id: string;
  numero_stripe: string | null;
  monto_centavos: number;
  concepto: string | null;
  pagado_at: string | null;
  created_at: string;
  rfc: string;
  razon_social: string;
  regimen_fiscal: string;
  codigo_postal: string;
  uso_cfdi: string;
  correo: string;
  estado: "por_emitir" | "emitida" | "descartada";
  emitida_at: string | null;
  folio_fiscal: string | null;
  nota: string | null;
};

const ZONA = "America/Mexico_City";

// «Facturas por emitir»: cada pago de la suscripción de un negocio que capturó sus datos de facturación deja aquí
// la tarea de emitir su CFDI (Menteo, S.A.S.), con los datos y el monto, mientras la emisión no es automática.
export default async function FacturasPorEmitir() {
  const { supabase } = await exigirPlataforma();
  const { data, error } = await leerTodo<Fila>(() =>
    supabase.from("facturas_peludesk_por_emitir").select("*").is("deleted_at", null).order("created_at", { ascending: true }).order("id")
  );
  const filas = (data ?? []) as Fila[];
  const pendientes = filas.filter((f) => f.estado === "por_emitir");
  const hechas = filas.filter((f) => f.estado !== "por_emitir").reverse().slice(0, 50);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Facturas por emitir</h1>
        <p className="mt-1 text-n-600">
          Cada pago de la suscripción de un negocio con datos de facturación capturados. Emite el CFDI a nombre de Menteo, S.A.S., mándalo al correo del
          negocio y márcalo aquí. Al negocio se le dice que la factura le llega por correo en los días siguientes al pago. Los montos son con IVA.
        </p>
      </div>
      {error && (
        <Alert variante="error" titulo="No pudimos cargar las facturas">
          {error.message}
        </Alert>
      )}
      <section className="rounded-lg border border-n-200 bg-white px-4 py-3">
        <p className="text-sm text-n-600">Por emitir</p>
        <p className="text-2xl font-bold tabular-nums text-n-900" data-facturas-pendientes>{pendientes.length}</p>
      </section>
      {pendientes.length === 0 && <p className="text-n-600">No hay facturas por emitir.</p>}
      {pendientes.map((f) => (
        <article key={f.id} data-factura-por-emitir={f.stripe_invoice_id} className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold text-n-900">{f.negocio_nombre}</h2>
            <p className="font-semibold tabular-nums text-n-900">
              {pesosDeCentavos(f.monto_centavos)} <span className="text-sm font-medium text-n-600">con IVA (subtotal {pesosDeCentavos(Math.round(f.monto_centavos / 1.16))})</span>
            </p>
          </div>
          <p className="text-sm text-n-700">
            Pagado el {formatearFecha(f.pagado_at ?? f.created_at, ZONA)} · {f.concepto ?? "Suscripción a PeluDesk"} · Stripe {f.numero_stripe ?? f.stripe_invoice_id}
            {f.modo === "test" && <strong className="ml-1 text-ambar-oscuro">(modo prueba: no se factura)</strong>}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <CampoCopiable etiqueta="RFC" valor={f.rfc} monoespaciado />
            <CampoCopiable etiqueta="Razón social" valor={f.razon_social} />
            <CampoCopiable etiqueta="Régimen fiscal" valor={f.regimen_fiscal} />
            <CampoCopiable etiqueta="Código postal" valor={f.codigo_postal} />
            <CampoCopiable etiqueta="Uso del CFDI" valor={f.uso_cfdi} />
            <CampoCopiable etiqueta="Correo" valor={f.correo} />
          </div>
          <div className="grid gap-4 border-t border-n-100 pt-3 sm:grid-cols-2">
            <FormularioPlataforma accion={marcarFacturaPeludesk.bind(null, f.id, "emitida")} textoBoton="Marcar como emitida">
              <Field label="Folio fiscal (UUID), opcional" name="folio" />
            </FormularioPlataforma>
            <FormularioPlataforma accion={marcarFacturaPeludesk.bind(null, f.id, "descartada")} textoBoton="No se emite" variante="secundario">
              <Field label="Por qué no se emite" name="nota" />
            </FormularioPlataforma>
          </div>
        </article>
      ))}
      {hechas.length > 0 && (
        <section className="rounded-lg border border-n-200 bg-white p-5">
          <h2 className="font-bold text-n-900">Últimas resueltas</h2>
          <ul className="mt-2 flex flex-col divide-y divide-n-100 text-sm">
            {hechas.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {f.negocio_nombre} · {pesosDeCentavos(f.monto_centavos)} · {f.estado === "emitida" ? `emitida ${f.emitida_at ? formatearFecha(f.emitida_at, ZONA) : ""}${f.folio_fiscal ? ` · ${f.folio_fiscal}` : ""}` : `no se emite: ${f.nota ?? ""}`}
                </span>
                <FormularioPlataforma accion={marcarFacturaPeludesk.bind(null, f.id, "por_emitir")} textoBoton="Regresar a por emitir" variante="secundario" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
