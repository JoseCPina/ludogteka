import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { formatearFecha } from "@/lib/formato";
import { diasDesde } from "@/lib/antiguedad";
import { zonaActual } from "@/lib/negocio/actual";
import { BandejaReembolsos, type ReembolsoPorAtender } from "./bandeja-reembolsos";

// Reembolsos de Mercado Pago que alguien tiene que ver (del más viejo al
// más nuevo): hechos en el panel de Mercado Pago (ya están en caja, pero
// nadie los pidió desde el mostrador), hechos sin turno abierto (entran al
// abrir el siguiente) y pedidos desde la app cuya respuesta no llegó.
export default async function ReembolsosPage() {
  const zona = await zonaActual();
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: hoyData }, { data: recientes }] = await Promise.all([
    supabase.rpc("reembolsos_por_atender"),
    supabase.rpc("fecha_negocio"),
    supabase
      .from("reembolsos_cobro")
      .select("id, monto, motivo, estado, origen, detalle_error, created_at, hecho_at, comision_devuelta")
      .in("estado", ["hecho", "rechazado"])
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const hoy = hoyData as string;
  const lista: ReembolsoPorAtender[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    ordenId: r.orden_id as string,
    reservaId: r.reserva_id as string,
    clienteNombre: (r.cliente_nombre as string) ?? "—",
    monto: Number(r.monto),
    motivo: r.motivo as string,
    estado: r.estado as string,
    origen: r.origen as string,
    registrado: Boolean(r.registrado),
    desde: r.desde as string,
    dias: diasDesde(r.desde as string, hoy, zona),
    detalleError: (r.detalle_error as string | null) ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/caja" className="text-sm font-semibold text-morado hover:underline">
          ← Caja
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Reembolsos de Mercado Pago</h1>
        <p className="mt-1 text-n-600">
          Lo que se reembolsó fuera del mostrador, lo que falta de entrar a caja y lo que sigue esperando respuesta de Mercado Pago.
        </p>
      </div>
      {error ? (
        <Alert variante="error" titulo="No pudimos cargar los reembolsos">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (
        <BandejaReembolsos lista={lista} />
      )}
      {(recientes ?? []).length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Últimos reembolsos</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {(recientes ?? []).map((r) => (
              <li key={r.id as string} className="rounded-md border border-n-200 bg-white px-3 py-2 text-n-700">
                ${Number(r.monto).toFixed(2)} · {r.estado === "hecho" ? "Reembolsado" : "Rechazado por Mercado Pago"}
                {r.origen === "proveedor" ? " (desde el panel)" : ""} · {r.motivo as string}
                {Number(r.comision_devuelta) > 0 ? ` · comisión regresada $${Number(r.comision_devuelta).toFixed(2)}` : ""}
                {r.estado === "rechazado" && r.detalle_error ? ` · ${r.detalle_error as string}` : ""} ·{" "}
                {formatearFecha((r.hecho_at ?? r.created_at) as string, zona)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
