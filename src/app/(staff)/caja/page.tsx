import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { hoyNegocio, formatearFecha } from "@/lib/formato";
import { cargarClientesBuscables } from "@/lib/clientes/buscables";
import { MostradorCaja, type CuentaAbierta, type PagoMpPendiente } from "./mostrador-caja";
import { zonaActual } from "@/lib/negocio/actual";

// Caja es el mostrador de cobro: cuentas abiertas, buscador, pases,
// cargos sueltos y el cobro mismo (que sigue siendo el de la reserva,
// visto desde aquí). El turno, sus movimientos y el arqueo viven en
// /caja/turno.
export default async function CajaPage() {
  const zona = await zonaActual();
  const supabase = await createSupabaseServerClient();

  const [{ data: turno, error: errorTurno }, { data: cuentasCrudo, error: errorCuentas }, { clientes }, { data: pendientesCrudo }] =
    await Promise.all([
      supabase
        .from("turnos_caja")
        .select("id, abierto_at, abierto_por, fondo_inicial")
        .eq("estado", "abierto")
        .maybeSingle(),
      supabase.rpc("cuentas_abiertas", { p_dias: 30 }),
      cargarClientesBuscables(supabase),
      supabase
        .from("mp_ordenes_estado")
        .select("id, tipo, monto, cliente_nombre, pagada_at, simulado")
        .eq("pendiente_de_registrar", true)
        .order("pagada_at"),
    ]);

  const error = errorTurno ?? errorCuentas;
  const hoy = hoyNegocio(zona);

  const cuentas: CuentaAbierta[] = ((cuentasCrudo ?? []) as Record<string, unknown>[]).map((c) => ({
    reservaId: c.reserva_id as string,
    clienteId: c.cliente_id as string,
    clienteNombre: c.cliente_nombre as string,
    clienteTelefono: (c.cliente_telefono as string) ?? "",
    perros: (c.perros as string) ?? "",
    descripcion: (c.descripcion as string) ?? "",
    fechaActividad: c.fecha_actividad as string,
    totalCuenta: Number(c.total_cuenta),
    saldo: Number(c.saldo),
  }));

  const pendientesMp: PagoMpPendiente[] = (pendientesCrudo ?? []).map((p) => ({
    id: p.id as string,
    tipo: p.tipo as string,
    monto: Number(p.monto),
    clienteNombre: (p.cliente_nombre as string) ?? "—",
    pagadaAt: (p.pagada_at as string | null) ?? null,
    simulado: Boolean(p.simulado),
  }));

  const totalHoy = cuentas.filter((c) => c.fechaActividad === hoy).reduce((s, c) => s + c.saldo, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">Caja</h1>
          <p className="mt-1 text-n-600">
            Cobra, vende pases y aplica cargos desde aquí. El turno, sus movimientos y el arqueo están en{" "}
            <Link href="/caja/turno" className="font-semibold text-morado hover:underline">
              Turno
            </Link>
            .
          </p>
        </div>
        <Link href="/caja/turno">
          <Button type="button" variante="secundario">Turno y arqueo</Button>
        </Link>
      </div>

      {turno ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-menta bg-menta-suave px-4 py-3 text-sm text-menta-oscuro">
          <span>
            Turno abierto desde el {formatearFecha(turno.abierto_at as string, zona)} · fondo ${Number(turno.fondo_inicial).toFixed(2)}
          </span>
          <span>
            Pendiente de cobrar hoy: <strong>${totalHoy.toFixed(2)}</strong>
          </span>
        </div>
      ) : (
        <Alert variante="advertencia" titulo="No hay turno de caja abierto">
          Puedes consultar cuentas y mandar links de pago, pero para cobrar en mostrador, con terminal o vender pases,{" "}
          <Link href="/caja/turno" className="font-semibold underline">
            abre el turno
          </Link>
          .
        </Alert>
      )}

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la caja">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (
        <MostradorCaja clientes={clientes} cuentas={cuentas} hoy={hoy} turnoAbierto={Boolean(turno)} pendientesMp={pendientesMp} />
      )}
    </div>
  );
}
