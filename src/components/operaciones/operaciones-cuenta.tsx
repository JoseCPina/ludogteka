import { createSupabaseServerClient } from "@/lib/supabase/server";
import { zonaActual } from "@/lib/negocio/actual";
import { formatearFecha, formatearHoraNegocio } from "@/lib/formato";
import { dinero } from "@/lib/dinero";
import { Deshacer } from "@/components/operaciones/deshacer";
import { TEXTOS_REVERSION, type TipoReversion } from "@/lib/operaciones/reversion";

/**
 * Lo que una cuenta tiene para corregir fuera de sus cobros: los renglones de venta cancelados (se reactivan) y la
 * bitácora de lo que ya se deshizo en esta cuenta (quién, cuándo, por qué y qué efectos tuvo). Va debajo de la cuenta.
 */
export async function OperacionesCuenta({ reservaId, puedeRevertir }: { reservaId: string; puedeRevertir: boolean }) {
  const [supabase, zona] = await Promise.all([createSupabaseServerClient(), zonaActual()]);
  const [{ data: ventas }, { data: bitacora }] = await Promise.all([
    supabase
      .from("ventas_mostrador")
      .select("id, concepto, cantidad, precio_unitario, motivo_cancelacion, cancelado_at")
      .eq("reserva_id", reservaId)
      .eq("cancelado", true)
      .is("deleted_at", null)
      .order("cancelado_at", { ascending: false }),
    supabase.rpc("operaciones_revertidas_de_reserva", { p_reserva: reservaId }),
  ]);
  const canceladas = (ventas ?? []) as { id: string; concepto: string; cantidad: number; precio_unitario: number; motivo_cancelacion: string | null; cancelado_at: string | null }[];
  const deshechas = ((bitacora ?? []) as { id: string; tipo: TipoReversion; motivo: string; efectos: { tipo?: string; saldo?: number; n?: number }[]; hecha_por_nombre: string; created_at: string }[]);
  if (canceladas.length === 0 && deshechas.length === 0) return null;
  return (
    <div className="flex flex-col gap-4" data-operaciones-cuenta>
      {canceladas.length > 0 && (
        <section className="rounded-lg border border-border bg-card shadow-tarjeta p-4">
          <h2 className="text-lg font-semibold text-foreground">Renglones de venta cancelados</h2>
          <ul className="mt-2 divide-y divide-border">
            {canceladas.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="text-n-700 line-through">{v.concepto} {v.cantidad > 1 ? `× ${v.cantidad}` : ""} · {dinero(v.precio_unitario * v.cantidad)}</p>
                  <p className="text-xs text-n-500">
                    Cancelado{v.cancelado_at ? ` el ${formatearFecha(v.cancelado_at, zona)}` : ""}{v.motivo_cancelacion ? `: ${v.motivo_cancelacion}` : ""}
                  </p>
                </div>
                <Deshacer puede={puedeRevertir} operaciones={[{ tipo: "venta_cancelada", id: v.id, hechoEn: v.cancelado_at }]} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {deshechas.length > 0 && (
        <section className="rounded-lg border border-border bg-card shadow-tarjeta p-4" data-bitacora-reversiones>
          <h2 className="text-lg font-semibold text-foreground">Operaciones deshechas en esta cuenta</h2>
          <ul className="mt-2 divide-y divide-border">
            {deshechas.map((o) => {
              const saldo = o.efectos?.find((e) => e.tipo === "cuenta")?.saldo;
              return (
                <li key={o.id} className="py-2 text-sm">
                  <p className="font-semibold text-n-900">{TEXTOS_REVERSION[o.tipo]?.nombre ?? o.tipo}</p>
                  <p className="text-n-700">
                    {o.hecha_por_nombre}, {formatearFecha(o.created_at, zona)} a las {formatearHoraNegocio(o.created_at, zona)} — {o.motivo}
                    {typeof saldo === "number" ? ` · la cuenta quedó con saldo ${dinero(saldo)}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
