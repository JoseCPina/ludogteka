import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { dinero } from "@/lib/dinero";
import { estadoDeSaldo } from "@/lib/caja/cuenta-por-cobrar";
import { formatearFecha } from "@/lib/formato";
import { TablaResponsiva } from "@/components/ui/tabla-responsiva";
import { Enlace } from "@/components/ui/enlace";

type CuentaCliente = { reserva_id: string; creada: string; nombre: string; cancelada: boolean; total: number; pagado: number; saldo: number };

/**
 * QA S62 (UX): en la ficha del cliente, su saldo pendiente (lo que debe y lo que hay a su favor) y el historial de sus
 * cuentas, de la misma cuenta que Caja (`cuentas_de_cliente`). Solo admin y recepción.
 */
export async function CuentasCliente({ clienteId, zona }: { clienteId: string; zona: string }) {
  const sesion = await obtenerSesionConRol();
  if (sesion?.rol !== "admin" && sesion?.rol !== "recepcion") return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("cuentas_de_cliente", { p_cliente: clienteId, p_limite: 30 });
  const cuentas = ((data ?? []) as CuentaCliente[]).filter((c) => !c.cancelada);
  if (cuentas.length === 0) return null;
  const debe = cuentas.reduce((s, c) => s + Math.max(Number(c.saldo), 0), 0);
  const aFavor = cuentas.reduce((s, c) => s + Math.max(-Number(c.saldo), 0), 0);
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-6" data-cuentas-cliente>
      <h2 className="text-lg font-semibold text-foreground">Sus cuentas</h2>
      <p className="-mt-1 text-sm text-n-700" data-saldo-cliente={debe.toFixed(2)} data-a-favor-cliente={aFavor.toFixed(2)}>
        {debe > 0.005 ? <>Saldo pendiente: <strong className="text-coral-oscuro">{dinero(debe)}</strong></> : "No debe nada."}
        {aFavor > 0.005 ? <> · Saldo a favor por devolver: <strong className="text-ambar-oscuro">{dinero(aFavor)}</strong></> : null}
      </p>
      <TablaResponsiva>
        <thead>
          <tr>
            <th className="px-3 py-2 text-left">Cuenta</th>
            <th className="px-3 py-2 text-left">Fecha</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2 text-right">Pagado</th>
            <th className="px-3 py-2 text-left">Estado</th>
          </tr>
        </thead>
        <tbody>
          {cuentas.map((c) => {
            const e = estadoDeSaldo(c.saldo, dinero);
            return (
              <tr key={c.reserva_id} className="border-t border-border" data-cuenta-cliente={c.reserva_id}>
                <td className="px-3 py-2"><Enlace href={`/caja/cobrar/${c.reserva_id}`}>{c.nombre}</Enlace></td>
                <td className="px-3 py-2" data-label="Fecha">{formatearFecha(c.creada, zona)}</td>
                <td className="px-3 py-2 text-right tabular-nums" data-label="Total">{dinero(c.total)}</td>
                <td className="px-3 py-2 text-right tabular-nums" data-label="Pagado">{dinero(c.pagado)}</td>
                <td data-label="Estado" className={`px-3 py-2 ${e.tipo === "por_cobrar" ? "text-coral-oscuro" : e.tipo === "a_favor" ? "text-ambar-oscuro" : "text-menta-oscuro"}`}>{e.corto}</td>
              </tr>
            );
          })}
        </tbody>
      </TablaResponsiva>
    </div>
  );
}
