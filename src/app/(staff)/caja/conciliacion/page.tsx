import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { negocioActual } from "@/lib/negocio/actual";
import { Alert } from "@/components/ui/alert";
import { Antiguedad } from "@/components/ui/antiguedad";
import { diasDesde } from "@/lib/antiguedad";
import { formatearFecha, horaLocalDeInstante } from "@/lib/formato";
import { DarPorRevisada } from "./dar-por-revisada";
import { RevisarTarjetaManual } from "@/components/cobro/revisar-tarjeta-manual";
import { ETIQUETA_TARJETA_MANUAL, etiquetaMotivo } from "@/lib/cobro/tarjeta-manual";

type TarjetaFila = {
  id: string;
  cobro_id: string;
  reserva_id: string;
  turno_cerrado: boolean;
  monto: number;
  propina: number;
  folio: string;
  motivo: string;
  motivo_texto: string | null;
  ultimos4: string | null;
  banco: string | null;
  sobre_tope: boolean;
  estado: "por_revisar" | "revisada" | "no_recibida";
  registrada_at: string;
  registrada_por_nombre: string;
  cliente_nombre: string;
  devuelto: number;
  revisada_at: string | null;
  revisada_por_nombre: string | null;
  nota_revision: string | null;
  grupo_id: string | null;
  cuentas: number;
};

type Fila = {
  id: string;
  tipo: "cobro_sin_pago" | "pago_sin_cobro";
  monto: number;
  ocurrio_at: string;
  detectada_at: string;
  cobro_id: string | null;
  orden_id: string | null;
  mp_pago_id: string | null;
  detalle: { motivo?: string } | null;
};

/**
 * Caja → Conciliación con Mercado Pago. Una vez por hora la app compara los
 * cobros con terminal contra los pagos de Mercado Pago y MARCA lo que no
 * cuadra: no corrige nada. Aquí se ven, del más viejo al más nuevo, con lo
 * que hay que hacer en cada caso.
 */
export default async function ConciliacionPage() {
  const sesion = await obtenerSesionConRol();
  const negocio = await negocioActual();
  const zona = negocio.zona_horaria;
  const supabase = await createSupabaseServerClient();
  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = String(hoyData);
  const esAdminSesion = sesion?.rol === "admin";
  const [{ data, error }, { data: porConfirmar }, { data: tarjetasCrudo }] = await Promise.all([
    supabase.from("conciliacion_terminal").select("id, tipo, monto, ocurrio_at, detectada_at, cobro_id, orden_id, mp_pago_id, detalle").is("resuelta_at", null).order("detectada_at"),
    supabase.from("mp_ordenes").select("id, monto, created_at, detalle_error, reserva_id").eq("estado", "por_confirmar").is("deleted_at", null).order("created_at"),
    // Tarjetas manuales: solo el admin las revisa (la función ya devuelve vacío a los demás).
    esAdminSesion ? supabase.rpc("tarjetas_manuales_por_revisar", { p_historial: true }) : Promise.resolve({ data: [] as TarjetaFila[] }),
  ]);
  const tarjetas = (tarjetasCrudo ?? []) as TarjetaFila[];
  const tarjetasPorRevisar = tarjetas.filter((t) => t.estado === "por_revisar");
  const tarjetasHechas = tarjetas.filter((t) => t.estado !== "por_revisar");
  const filas = (data ?? []) as Fila[];
  // Para ir a la cuenta del cobro dudoso.
  const ids = filas.map((f) => f.cobro_id).filter(Boolean) as string[];
  const { data: cobros } = ids.length ? await supabase.from("cobros").select("id, reserva_id").in("id", ids) : { data: [] as { id: string; reserva_id: string }[] };
  const reservaDe = new Map((cobros ?? []).map((c) => [c.id as string, c.reserva_id as string]));
  const esAdmin = sesion?.rol === "admin";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/caja" className="text-sm font-semibold text-morado hover:underline">← Caja</Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Conciliación</h1>
        <p className="mt-1 text-n-600">
          Cada hora la app compara los cobros con terminal contra los pagos de Mercado Pago. Aquí salen las diferencias y las tarjetas registradas a mano
          que faltan por revisar: no se corrige nada solo.
        </p>
      </div>
      {error && <Alert variante="error" titulo="No pudimos cargar la conciliación">Recarga la página.</Alert>}

      {(porConfirmar ?? []).length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Por confirmar</h2>
          <ul className="flex flex-col gap-2">
            {(porConfirmar ?? []).map((o) => (
              <li key={o.id as string} className="rounded-md border border-ambar bg-ambar-suave px-3 py-2 text-sm">
                <p className="font-semibold text-ambar-oscuro">
                  ${Number(o.monto).toFixed(2)} · {formatearFecha(o.created_at as string, zona)} {horaLocalDeInstante(o.created_at as string, zona)}
                  <Antiguedad dias={diasDesde(o.created_at as string, hoy, zona)} />
                </p>
                <p className="text-n-700">{(o.detalle_error as string | null) ?? "Mercado Pago no pudo confirmar el pago."}</p>
                <Link href={`/caja/cobrar/${o.reserva_id}`} className="font-semibold text-morado hover:underline">
                  Abrir la cuenta y «Revisar con Mercado Pago» →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {esAdmin && (
        <section className="flex flex-col gap-2" data-tarjetas-manuales>
          <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Tarjetas manuales por revisar</h2>
          <p className="text-sm text-n-600">
            Cobros que se registraron con «{ETIQUETA_TARJETA_MANUAL}» (la terminal vinculada no se pudo usar). Cuentan como pagados, pero no los verificó ningún
            proveedor: contrástalos con el voucher y el estado de cuenta, del más viejo al más nuevo.
          </p>
          {tarjetasPorRevisar.length === 0 ? (
            <p className="text-sm text-n-600">No hay tarjetas manuales por revisar.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {tarjetasPorRevisar.map((t) => (
                <li key={t.id} data-tarjeta-por-revisar className="flex flex-col gap-2 rounded-lg border border-ambar bg-ambar-suave p-4">
                  <p className="font-semibold text-n-900">
                    ${Number(t.monto).toFixed(2)} · folio {t.folio}
                    {t.cuentas > 1 ? <span className="ml-2 rounded-full bg-morado-suave px-2 py-0.5 text-xs font-semibold text-morado">cobro junto · {t.cuentas} cuentas</span> : null}
                    {t.sobre_tope ? <span className="ml-2 rounded-full bg-coral-suave px-2 py-0.5 text-xs font-semibold text-coral-oscuro">arriba del tope</span> : null}
                    <Antiguedad dias={diasDesde(t.registrada_at, hoy, zona)} />
                  </p>
                  <p className="text-sm text-n-700">
                    {t.cliente_nombre} · {formatearFecha(t.registrada_at, zona)} {horaLocalDeInstante(t.registrada_at, zona)} · lo registró {t.registrada_por_nombre}
                    {t.ultimos4 ? ` · •••• ${t.ultimos4}` : ""}
                    {t.banco ? ` · ${t.banco}` : ""}
                  </p>
                  <p className="text-sm text-n-700">Motivo: {etiquetaMotivo(t.motivo, t.motivo_texto)}</p>
                  {t.turno_cerrado && (
                    <p className="text-sm text-n-600">Se registró en un turno que ya cerró: si la marcas como no recibida, el ajuste cae en el turno abierto y ese corte no cambia.</p>
                  )}
                  {t.devuelto > 0 && <p className="text-sm text-coral-oscuro">Ya tiene una devolución manual de ${Number(t.devuelto).toFixed(2)}.</p>}
                  <div className="flex flex-wrap items-start gap-3">
                    <Link href={`/caja/cobrar/${t.reserva_id}`} className="font-semibold text-morado hover:underline">
                      Abrir la cuenta →
                    </Link>
                  </div>
                  <RevisarTarjetaManual tarjetaId={t.id} monto={Number(t.monto)} reservaId={t.reserva_id} cuentas={t.cuentas} />
                </li>
              ))}
            </ul>
          )}
          {tarjetasHechas.length > 0 && (
            <details className="text-sm text-n-700">
              <summary className="cursor-pointer font-semibold text-n-800">Ya revisadas (últimos 60 días): {tarjetasHechas.length}</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {tarjetasHechas.map((t) => (
                  <li key={t.id}>
                    ${Number(t.monto).toFixed(2)}{t.cuentas > 1 ? ` (${t.cuentas} cuentas)` : ""} · folio {t.folio} · {t.estado === "revisada" ? "revisada con voucher" : "marcada como no recibida"}
                    {t.revisada_por_nombre ? ` por ${t.revisada_por_nombre}` : ""}
                    {t.nota_revision ? ` — ${t.nota_revision}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Diferencias</h2>
        {filas.length === 0 ? (
          <p className="text-sm text-n-600">Todo cuadra: no hay diferencias abiertas.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {filas.map((f) => {
              const dias = diasDesde(f.detectada_at, hoy, zona);
              const reserva = f.cobro_id ? reservaDe.get(f.cobro_id) : null;
              return (
                <li key={f.id} data-conciliacion className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-4">
                  <p className="font-semibold text-n-900">
                    {f.tipo === "cobro_sin_pago" ? "Cobrado en la app, sin pago aprobado en Mercado Pago" : "Pago aprobado en Mercado Pago, sin cobro en la caja"} · ${Number(f.monto).toFixed(2)}
                    <Antiguedad dias={dias} />
                  </p>
                  <p className="text-sm text-n-700">
                    {formatearFecha(f.ocurrio_at, zona)} {horaLocalDeInstante(f.ocurrio_at, zona)} · detectado {formatearFecha(f.detectada_at, zona)}
                    {f.mp_pago_id ? ` · pago ${f.mp_pago_id}` : ""}
                  </p>
                  {f.detalle?.motivo && <p className="text-sm text-n-700">{f.detalle.motivo}</p>}
                  <p className="text-sm text-n-600">
                    {f.tipo === "cobro_sin_pago"
                      ? "Pregúntale al cliente si pagó. Si no pagó, el admin abre la cuenta y usa «Marcar como no recibido» (la app vuelve a preguntarle a Mercado Pago antes de dejarlo)."
                      : "Revisa en tu panel de Mercado Pago de quién es y si hay que cobrarlo o devolverlo; la app no lo registra sola."}
                  </p>
                  <div className="flex flex-wrap items-start gap-3">
                    {reserva && (
                      <Link href={`/caja/cobrar/${reserva}`} className="font-semibold text-morado hover:underline">
                        Abrir la cuenta →
                      </Link>
                    )}
                    {esAdmin && <DarPorRevisada id={f.id} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
