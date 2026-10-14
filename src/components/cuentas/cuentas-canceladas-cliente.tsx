import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { zonaActual } from "@/lib/negocio/actual";
import { formatearFecha } from "@/lib/formato";
import { dinero } from "@/lib/dinero";
import { etiquetaMotivoCuenta } from "@/app/(staff)/caja/cancelar-cuenta-tipos";

/** Las cuentas que se cancelaron (no se cobraron) de un cliente: motivo, quién y cuándo. */
export async function CuentasCanceladasCliente({ clienteId }: { clienteId: string }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("cuentas_canceladas_de_cliente", { p_cliente_id: clienteId });
  const filas = (data ?? []) as {
    id: string;
    reserva_id: string;
    cuando: string;
    motivo: string;
    motivo_texto: string | null;
    saldo_cancelado: number;
    descripcion: string | null;
    por_nombre: string;
  }[];
  if (filas.length === 0) return null;
  const zona = await zonaActual();
  return (
    <div data-cuentas-canceladas className="flex flex-col gap-3 border-t border-n-200 pt-6">
      <h2 className="text-lg font-bold text-n-900">Cuentas canceladas</h2>
      <p className="-mt-1 text-sm text-n-600">Cuentas que no se cobraron. No se borran: quedan aquí con el motivo.</p>
      <ul className="flex flex-col gap-2">
        {filas.map((f) => (
          <li key={f.id} className="rounded-md border border-n-200 bg-white px-4 py-3 text-sm">
            <Link href={`/caja/cobrar/${f.reserva_id}`} className="font-semibold text-morado hover:underline">
              {f.descripcion || "Cuenta"} · {dinero(Number(f.saldo_cancelado))}
            </Link>
            <p className="text-n-700">
              {etiquetaMotivoCuenta(f.motivo)}
              {f.motivo_texto ? ` — ${f.motivo_texto}` : ""}
            </p>
            <p className="text-xs text-n-500">
              Canceló {f.por_nombre} · {formatearFecha(f.cuando, zona)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
