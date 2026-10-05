import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioActual } from "@/lib/negocio/actual";
import { Alert } from "@/components/ui/alert";
import { Antiguedad } from "@/components/ui/antiguedad";
import { diasDesde } from "@/lib/antiguedad";
import { formatearFecha } from "@/lib/formato";

type Fila = {
  correccion_id: string;
  cita_id: string;
  reserva_id: string;
  cliente_nombre: string;
  perro: string;
  servicio_anterior: string;
  servicio_nuevo: string;
  diferencia: number;
  tipo_ajuste: "cobro_adicional" | "saldo_a_favor";
  saldo: number;
  desde: string;
};

/**
 * Caja → Ajustes por corrección de servicio. Cuando se corrige el servicio de
 * una cita que ya se había cobrado, la cuenta queda con un cobro adicional o un
 * saldo a favor del cliente. Aquí se ven, del más viejo al más nuevo, hasta
 * que el saldo de la cuenta llega a cero (con el cobro o la devolución de
 * siempre): nada se resuelve solo ni se toca el cobro original.
 */
export default async function AjustesServicioPage() {
  const negocio = await negocioActual();
  const zona = negocio.zona_horaria;
  const supabase = await createSupabaseServerClient();
  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = String(hoyData);
  const { data, error } = await supabase.rpc("ajustes_servicio_por_atender");
  const filas = (data ?? []) as Fila[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/caja" className="text-sm font-semibold text-morado hover:underline">← Caja</Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Ajustes por corrección de servicio</h1>
        <p className="mt-1 text-n-600">
          Servicios que se corrigieron después de cobrarse. El cobro original no se toca: la cuenta queda con un cobro adicional o con un saldo a favor, y esto se limpia solo cuando el saldo llega a cero.
        </p>
      </div>
      {error && <Alert variante="error" titulo="No pudimos cargar los ajustes">Recarga la página.</Alert>}
      {filas.length === 0 ? (
        <p className="text-sm text-n-600">No hay ajustes pendientes.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filas.map((f) => (
            <li key={f.correccion_id} data-ajuste-servicio className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-4">
              <p className="font-semibold text-n-900">
                {f.perro} · {f.cliente_nombre}
                <Antiguedad dias={diasDesde(f.desde, hoy, zona)} />
              </p>
              <p className="text-sm text-n-700">
                {f.servicio_anterior} → {f.servicio_nuevo} ({Number(f.diferencia) > 0 ? "+" : "−"}${Math.abs(Number(f.diferencia)).toFixed(2)}) · corregido el {formatearFecha(f.desde, zona)}
              </p>
              <p className="text-sm font-semibold text-n-800">
                {f.tipo_ajuste === "cobro_adicional"
                  ? `Falta cobrar $${Number(f.saldo).toFixed(2)} al cliente.`
                  : `Hay $${Math.abs(Number(f.saldo)).toFixed(2)} a favor del cliente por devolver.`}
              </p>
              <p className="text-sm text-n-600">
                {f.tipo_ajuste === "cobro_adicional"
                  ? "Ábrela y cóbralo como cualquier saldo."
                  : "Un admin lo devuelve desde la cuenta con «Registrar devolución» (si el cobro fue con Mercado Pago, con «Devolver con Mercado Pago»)."}
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href={`/caja/cobrar/${f.reserva_id}`} className="font-semibold text-morado hover:underline">
                  Abrir la cuenta →
                </Link>
                <Link href={`/estetica/${f.cita_id}`} className="font-semibold text-morado hover:underline">
                  Ver la cita →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
