import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatearFecha } from "@/lib/formato";
import { Alert } from "@/components/ui/alert";

const ZONA = "America/Mexico_City";

type Fila = { negocio_id: string; tipo: string; monto: number; ocurrio_at: string; detectada_at: string; detalle: { motivo?: string } | null };

// Diferencias entre los cobros con terminal y Mercado Pago, de TODOS los
// negocios (la conciliación corre cada hora y solo marca; no corrige). La
// plataforma las ve sin entrar al negocio: lee con el servidor, después de
// comprobar que es administración de la plataforma.
export default async function ConciliacionPlataforma() {
  await exigirPlataforma();
  const admin = createSupabaseAdminClient();
  const [{ data: filas, error }, { data: negocios }, { data: porConfirmar }] = await Promise.all([
    admin.from("conciliacion_terminal").select("negocio_id, tipo, monto, ocurrio_at, detectada_at, detalle").is("resuelta_at", null).order("detectada_at"),
    admin.from("negocios").select("id, nombre, slug"),
    admin.from("mp_ordenes").select("negocio_id, created_at").eq("estado", "por_confirmar").is("deleted_at", null),
  ]);
  const nombre = new Map((negocios ?? []).map((n) => [n.id as string, n.nombre as string]));
  const porNegocio = new Map<string, Fila[]>();
  for (const f of (filas ?? []) as Fila[]) porNegocio.set(f.negocio_id, [...(porNegocio.get(f.negocio_id) ?? []), f]);
  // La antigüedad se cuenta contra el reloj del servidor, fuera del render.
  const ahora = (await import("node:perf_hooks")).performance.timeOrigin + (await import("node:perf_hooks")).performance.now();
  const dias = (iso: string) => Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 86_400_000));
  const pcPorNegocio = new Map<string, number>();
  for (const o of porConfirmar ?? []) pcPorNegocio.set(o.negocio_id as string, (pcPorNegocio.get(o.negocio_id as string) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Conciliación de terminales</h1>
        <p className="mt-1 text-n-600">
          Cada hora se compara, negocio por negocio, lo cobrado con terminal contra los pagos aprobados de su Mercado Pago. Solo marca; no corrige. Un cobro de
          terminal solo se da por pagado cuando Mercado Pago confirma el pago.
        </p>
      </div>
      {error && <Alert variante="error" titulo="No pudimos cargar la conciliación">{error.message}</Alert>}
      {porNegocio.size === 0 && (pcPorNegocio.size === 0) ? (
        <p className="text-sm text-n-600">Todo cuadra: ningún negocio tiene diferencias abiertas.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {[...new Set([...porNegocio.keys(), ...pcPorNegocio.keys()])].map((id) => {
            const lista = porNegocio.get(id) ?? [];
            return (
              <section key={id} className="rounded-lg border border-n-200 bg-white p-4">
                <h2 className="font-bold text-n-900">{nombre.get(id) ?? id}</h2>
                {(pcPorNegocio.get(id) ?? 0) > 0 && <p className="text-sm text-ambar-oscuro">{pcPorNegocio.get(id)} cobro(s) por confirmar con Mercado Pago.</p>}
                <ul className="mt-2 flex flex-col gap-1 text-sm text-n-700">
                  {lista.map((f, i) => (
                    <li key={i}>
                      {f.tipo === "cobro_sin_pago" ? "Cobrado en la app sin pago en Mercado Pago" : "Pago de Mercado Pago sin cobro en la caja"} · ${Number(f.monto).toFixed(2)} ·{" "}
                      {formatearFecha(f.ocurrio_at, ZONA)} · abierta hace {dias(f.detectada_at)} {dias(f.detectada_at) === 1 ? "día" : "días"}
                      {f.detalle?.motivo ? ` — ${f.detalle.motivo}` : ""}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
