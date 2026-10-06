import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { Alert } from "@/components/ui/alert";
import { estadoCobroIntegrado } from "@/app/(staff)/caja/cobro-integrado-actions";
import type { OrdenCobroFila } from "@/app/(staff)/reservas/[id]/cobrar/cobro-integrado";
import { CobroJunto, type CuentaJunto } from "./cobro-junto";

// Cobrar en UN movimiento varias cuentas abiertas de la misma persona:
// un pago, un folio, una propina; el monto se reparte entre las cuentas.
export default async function CobrarJuntoPage({ searchParams }: { searchParams: Promise<{ cuentas?: string }> }) {
  const { cuentas: param } = await searchParams;
  const ids = Array.from(new Set((param ?? "").split(",").map((x) => x.trim()).filter(Boolean)));
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();

  const encabezado = (
    <div>
      <Link href="/caja" className="text-sm font-semibold text-morado hover:underline">
        ← Caja
      </Link>
      <h1 className="mt-1 text-2xl font-bold text-n-900">Cobrar varias cuentas juntas</h1>
    </div>
  );
  if (ids.length < 2) {
    return (
      <div className="flex flex-col gap-6">
        {encabezado}
        <Alert variante="advertencia" titulo="Faltan cuentas">
          Marca al menos dos cuentas de la misma persona en Caja y usa «Cobrar todo junto».
        </Alert>
      </div>
    );
  }

  const [{ data: abiertas, error }, { data: turno }, mpDisponible, { data: terminalManualBloqueada }] = await Promise.all([
    supabase.rpc("cuentas_abiertas", { p_dias: 30 }),
    supabase.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle(),
    estadoCobroIntegrado(),
    supabase.rpc("terminal_manual_bloqueada"),
  ]);
  const filas = ((abiertas ?? []) as Record<string, unknown>[]).filter((c) => ids.includes(c.reserva_id as string));
  const clientes = new Set(filas.map((c) => c.cliente_id as string));

  let problema: string | null = null;
  if (error) problema = "No pudimos cargar las cuentas. Recarga la página.";
  else if (filas.length !== ids.length) problema = "Alguna de las cuentas ya no tiene saldo (quizá ya se cobró) o no existe. Regresa a Caja y vuelve a marcarlas.";
  else if (clientes.size !== 1) problema = "Solo se cobran juntas las cuentas de la misma persona: nunca se mezclan clientas.";
  if (problema) {
    return (
      <div className="flex flex-col gap-6">
        {encabezado}
        <Alert variante="error" titulo="No se pueden cobrar juntas">
          {problema}
        </Alert>
      </div>
    );
  }

  // De la más antigua a la más nueva (por la fecha del servicio y, si es la misma,
  // por cuándo se abrió la cuenta): así se reparte un pago parcial.
  const { data: creadas } = await supabase.from("reservas").select("id, created_at").in("id", ids);
  const creadaEn = new Map((creadas ?? []).map((r) => [r.id as string, r.created_at as string]));
  const cuentas: CuentaJunto[] = filas
    .map((c) => ({
      reservaId: c.reserva_id as string,
      descripcion: (c.descripcion as string) ?? "",
      perros: (c.perros as string) ?? "",
      fechaActividad: c.fecha_actividad as string,
      totalCuenta: Number(c.total_cuenta),
      saldo: Number(c.saldo),
    }))
    .sort(
      (a, b) =>
        a.fechaActividad.localeCompare(b.fechaActividad) ||
        (creadaEn.get(a.reservaId) ?? "").localeCompare(creadaEn.get(b.reservaId) ?? "") ||
        a.reservaId.localeCompare(b.reservaId)
    );
  const primera = filas[0];

  // Las órdenes de terminal o link de estas cuentas (la del grupo y las sueltas).
  const { data: ordenesCrudo } = await supabase
    .from("mp_ordenes_estado")
    .select("id, tipo, monto, descripcion, estado, url_pago, installments, simulado, pendiente_de_registrar, detalle_error, created_at, expira_at, cobro_id, proveedor, monto_reembolsado, grupo_cuentas, reserva_id")
    .or(ids.map((id) => `reserva_id.eq.${id}`).join(","))
    .order("created_at", { ascending: false })
    .limit(20);
  const ordenes: OrdenCobroFila[] = (ordenesCrudo ?? []).map((o) => ({
    id: o.id as string,
    tipo: o.tipo as "point" | "link",
    monto: Number(o.monto),
    descripcion: (o.descripcion as string | null) ?? null,
    estado: o.estado as string,
    url_pago: (o.url_pago as string | null) ?? null,
    installments: (o.installments as number | null) ?? null,
    simulado: Boolean(o.simulado),
    pendiente_de_registrar: Boolean(o.pendiente_de_registrar),
    detalle_error: (o.detalle_error as string | null) ?? null,
    created_at: o.created_at as string,
    expira_at: (o.expira_at as string | null) ?? null,
    cobro_id: (o.cobro_id as string | null) ?? null,
    proveedor: (o.proveedor as "mercadopago" | "clip") ?? "mercadopago",
    monto_reembolsado: Number(o.monto_reembolsado ?? 0),
    grupo_cuentas: (o.grupo_cuentas as { reserva_id: string; monto: number }[] | null) ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      {encabezado}
      <CobroJunto
        cliente={{ id: primera.cliente_id as string, nombre: primera.cliente_nombre as string, telefono: (primera.cliente_telefono as string | null) ?? null }}
        cuentas={cuentas}
        turnoAbierto={Boolean(turno)}
        puedeTarjetaManual={tienePermiso(sesion, "tarjeta_manual")}
        terminalManualBloqueada={Boolean(terminalManualBloqueada)}
        esAdmin={sesion?.rol === "admin"}
        mp={{ disponible: mpDisponible, ordenes }}
      />
    </div>
  );
}
