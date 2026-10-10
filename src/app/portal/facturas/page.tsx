import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { zonaActual } from "@/lib/negocio/actual";
import { formatearFecha } from "@/lib/formato";
import { Chip } from "@/components/ui/chip";
import { dinero, ESTADOS_FACTURA } from "@/components/cfdi/textos";

export const metadata = { title: "Mis facturas" };

type Fila = { id: string; folio: string; uuid_fiscal: string | null; fecha_timbrado: string | null; total: number; estado: string; tiene_pdf: boolean; tiene_xml: boolean };

// Las facturas del dueño (solo las suyas: la función de la base filtra por su
// expediente). PDF y XML se bajan por /portal/facturas/<id>/<pdf|xml>.
export default async function MisFacturasPage() {
  const sb = await createSupabaseServerClient();
  const zona = await zonaActual();
  const { data } = await sb.rpc("mis_facturas");
  const facturas = (data ?? []) as Fila[];
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <Link href="/portal" className="text-sm font-semibold text-morado hover:underline">
          ← Mi cuenta
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Mis facturas</h1>
      </div>
      {facturas.length === 0 ? (
        <p className="rounded-lg border border-n-200 bg-n-50 p-4 text-sm text-n-700">Todavía no tienes facturas. Si necesitas una, pídela en recepción con tus datos fiscales.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {facturas.map((f) => {
            const st = ESTADOS_FACTURA[f.estado] ?? { texto: f.estado, tono: "neutro" as const };
            return (
              <li key={f.id} className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-n-900">Factura {f.folio || "sin folio"}</p>
                  <Chip tono={st.tono}>{st.texto}</Chip>
                </div>
                <p className="text-sm text-n-700">
                  {f.fecha_timbrado ? formatearFecha(f.fecha_timbrado, zona) : ""} · {dinero(f.total)}
                </p>
                {f.uuid_fiscal && <p className="break-all text-xs text-n-500">UUID {f.uuid_fiscal}</p>}
                {(f.tiene_pdf || f.tiene_xml) && (
                  <div className="flex flex-wrap gap-3 text-sm font-semibold">
                    <a className="text-morado hover:underline" href={`/portal/facturas/${f.id}/pdf`}>
                      Descargar PDF
                    </a>
                    <a className="text-morado hover:underline" href={`/portal/facturas/${f.id}/xml`}>
                      Descargar XML
                    </a>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
