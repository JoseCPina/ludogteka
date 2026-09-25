import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Antiguedad } from "@/components/ui/antiguedad";
import { formatearFecha, hoyNegocio } from "@/lib/formato";
import { haceCuanto } from "@/lib/antiguedad";
import { cargarSaldosDeSalidas } from "@/lib/tablero/saldos-de-salidas";
import { zonaActual } from "@/lib/negocio/actual";

// Cuentas con saldo de perros que ya se fueron, de la más vieja a la más
// nueva: la que lleva más tiempo sin cobrarse es la primera que se pierde.
export default async function SaldosPendientesPage() {
  const zona = await zonaActual();
  const supabase = await createSupabaseServerClient();
  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio(zona);
  const saldos = await cargarSaldosDeSalidas(supabase, hoy, zona);
  const total = saldos.reduce((s, c) => s + c.saldo, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/recepcion" className="text-sm font-semibold text-azul hover:underline">
          ← Tablero del día
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Saldos de perros que ya se fueron</h1>
        <p className="mt-1 text-n-600">
          Cuentas con algo por cobrar cuya estancia o cita ya terminó. Van de la más vieja a la más
          nueva.
        </p>
      </div>

      {saldos.length === 0 ? (
        <p className="rounded-lg border border-n-200 bg-white p-4 text-n-600">
          No hay saldos pendientes de perros que ya se fueron.
        </p>
      ) : (
        <>
          <p className="text-sm text-n-700">
            {saldos.length} {saldos.length === 1 ? "cuenta" : "cuentas"} · <strong>${total.toFixed(2)}</strong> por cobrar
          </p>
          <ul className="divide-y divide-n-200 rounded-lg border border-n-200 bg-white">
            {saldos.map((s) => (
              <li key={s.reservaId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex flex-col gap-1">
                  <p className="font-semibold text-n-900">
                    {s.perros || "Cuenta"} · <span className="font-normal">{s.clienteNombre}</span>
                  </p>
                  <p className="text-sm text-n-600">
                    {s.descripcion} · salió el {formatearFecha(s.salioEl, zona)}
                  </p>
                  <Antiguedad dias={s.dias} texto={`Sin cobrar desde que salió, ${haceCuanto(s.dias)}`} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold tabular-nums text-n-900">${s.saldo.toFixed(2)}</span>
                  <Link
                    href={`/caja/cobrar/${s.reservaId}`}
                    className="inline-flex min-h-10 items-center rounded-md bg-azul px-4 text-sm font-semibold text-white hover:bg-azul-oscuro"
                  >
                    Cobrar
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
