import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioIdActual } from "@/lib/negocio/actual";
import { contextoFacturar, datosFiscalesDe } from "./contexto";
import { DatosFiscalesForm } from "./datos-fiscales-form";

// Tarjeta «Datos fiscales» de la ficha del cliente. La ven quienes facturan o
// editan datos fiscales; solo edita quien tiene «Editar datos fiscales».
export async function DatosFiscalesCliente({ clienteId }: { clienteId: string }) {
  const sb = await createSupabaseServerClient();
  const negocioId = await negocioIdActual();
  const [{ data: edita }, ctx] = await Promise.all([sb.rpc("tiene_permiso", { p_permiso: "editar_datos_fiscales" }), contextoFacturar(sb, negocioId)]);
  if (!edita && !ctx.puede) return null;
  const datos = await datosFiscalesDe(sb, negocioId, clienteId);
  return (
    <div className="flex flex-col gap-3 border-t border-n-200 pt-6">
      <h2 className="text-lg font-bold text-n-900">Datos fiscales</h2>
      <p className="-mt-1 text-sm text-n-600">Para emitirle facturas. Se copian tal cual de la constancia de situación fiscal del cliente.</p>
      <DatosFiscalesForm clienteId={clienteId} inicial={datos} catalogos={ctx.catalogos} editable={Boolean(edita)} />
    </div>
  );
}
