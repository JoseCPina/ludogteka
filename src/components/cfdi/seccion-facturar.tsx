import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioIdActual, zonaActual } from "@/lib/negocio/actual";
import { formatearFecha } from "@/lib/formato";
import { Alert } from "@/components/ui/alert";
import { contextoFacturar, datosFiscalesDe, facturasDeCobros } from "./contexto";
import { FacturarBoton } from "./facturar-boton";
import { dinero, PRUEBAS_AVISO } from "./textos";

// En la pantalla de cobro de una cuenta: sus cobros y, por cada uno, «Facturar».
// No sale para quien no tiene el permiso «Facturar» (la base lo exige de todos modos).
export async function SeccionFacturar({
  clienteId,
  publicoGeneral,
  cobros,
}: {
  clienteId: string;
  publicoGeneral: boolean;
  cobros: { id: string; monto: number; creadoEn: string; anulado: boolean }[];
}) {
  const sb = await createSupabaseServerClient();
  const negocioId = await negocioIdActual();
  const ctx = await contextoFacturar(sb, negocioId);
  if (!ctx.puede) return null;
  const vigentes = cobros.filter((c) => !c.anulado && c.monto > 0);
  if (!vigentes.length) return null;
  if (!ctx.activa) {
    return (
      <Alert variante="info" titulo="Facturación sin activar">
        Para facturar estos cobros, un admin captura los datos fiscales del negocio en{" "}
        <Link href="/admin/facturacion" className="font-semibold underline">
          Administración → Facturación
        </Link>
        .
      </Alert>
    );
  }
  const [zona, facturados, datos] = await Promise.all([
    zonaActual(),
    facturasDeCobros(sb, negocioId, vigentes.map((c) => c.id)),
    publicoGeneral ? Promise.resolve(null) : datosFiscalesDe(sb, negocioId, clienteId),
  ]);
  const necesitaReceptor = publicoGeneral || !datos;
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
      <h2 className="text-lg font-bold text-n-900">Facturación</h2>
      {ctx.modo === "pruebas" && <p className="text-xs font-semibold text-ambar-oscuro">{PRUEBAS_AVISO}</p>}
      {necesitaReceptor && (
        <p className="text-sm text-n-700">
          {publicoGeneral
            ? "Esta venta es a «Público en general»: para facturarla a nombre de alguien, captura sus datos fiscales al presionar Facturar."
            : "Este cliente todavía no tiene datos fiscales guardados: puedes capturarlos al facturar, o guardarlos en su ficha para la próxima."}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {vigentes.map((c) => (
          <li key={c.id} className="flex flex-col gap-2 border-t border-n-200 pt-3 first:border-0 first:pt-0">
            <span className="text-sm text-n-800">
              Cobro del {formatearFecha(c.creadoEn, zona)} · <span className="font-semibold">{dinero(c.monto)}</span>
            </span>
            <FacturarBoton cobroIds={[c.id]} necesitaReceptor={necesitaReceptor} catalogos={ctx.catalogos} yaFacturado={facturados[c.id] ?? null} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// En el recibo de un cobro junto: UNA factura para todas las cuentas del pago.
export async function SeccionFacturarGrupo({ grupoId, clienteId, cobroIds }: { grupoId: string; clienteId: string; cobroIds: string[] }) {
  const sb = await createSupabaseServerClient();
  const negocioId = await negocioIdActual();
  const ctx = await contextoFacturar(sb, negocioId);
  if (!ctx.puede || !ctx.activa || !cobroIds.length) return null;
  const [facturados, datos, { data: cli }] = await Promise.all([
    facturasDeCobros(sb, negocioId, cobroIds),
    datosFiscalesDe(sb, negocioId, clienteId),
    sb.from("clientes").select("publico_general").eq("id", clienteId).maybeSingle(),
  ]);
  const publico = Boolean(cli?.publico_general);
  const ya = facturados[cobroIds[0]] ?? null;
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-4 print:hidden">
      <h2 className="text-lg font-bold text-n-900">Facturación</h2>
      {ctx.modo === "pruebas" && <p className="text-xs font-semibold text-ambar-oscuro">{PRUEBAS_AVISO}</p>}
      <p className="text-sm text-n-700">Una sola factura por todo el cobro junto.</p>
      <FacturarBoton cobroIds={cobroIds} grupoId={grupoId} necesitaReceptor={publico || !datos} catalogos={ctx.catalogos} etiqueta="Facturar el cobro junto" yaFacturado={ya} />
    </section>
  );
}
