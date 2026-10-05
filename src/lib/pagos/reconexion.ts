import type { SupabaseClient } from "@supabase/supabase-js";
import { mpFetch } from "@/lib/mercadopago/api";

/**
 * Desconectar y reconectar Mercado Pago deja todo consistente (5 de octubre de
 * 2026): las órdenes que se quedaron en cola se cancelan (en Mercado Pago y en
 * la app), y al reconectar la misma cuenta se recupera la terminal que se
 * usaba y se comprueba que siga en modo integrado (PDV). Una orden anterior a
 * la desconexión nunca marca pagado nada por su cuenta: todo pago pasa por la
 * verificación contra la API (src/lib/pagos/verificacion.ts).
 *
 * Sin imports de conexion.ts (que importa oauth.ts, que importa esto).
 */
type OrdenMp = { status?: string };

/** Cancela las órdenes de terminal sin terminar. Devuelve cuántas canceló. */
export async function cancelarOrdenesEnCola(admin: SupabaseClient, negocioId: string, token: string | null, motivo: string): Promise<number> {
  const { data: vivas } = await admin
    .from("mp_ordenes")
    .select("id, mp_order_id, simulado")
    .eq("negocio_id", negocioId)
    .eq("tipo", "point")
    .eq("proveedor", "mercadopago")
    .in("estado", ["creada", "en_terminal"])
    .is("deleted_at", null);
  let canceladas = 0;
  for (const o of vivas ?? []) {
    if (o.mp_order_id && token && !o.simulado) {
      try {
        const remota = await mpFetch<OrdenMp>(token, `/v1/orders/${encodeURIComponent(o.mp_order_id as string)}`);
        // Una orden que ya se procesó NO se cancela: es dinero real y la
        // verificación decide si entra (cuando llegue su aviso o se revise).
        if (remota.status === "processed") continue;
        if (!["canceled", "cancelled", "expired", "failed"].includes(String(remota.status))) {
          await mpFetch<OrdenMp>(token, `/v1/orders/${encodeURIComponent(o.mp_order_id as string)}/cancel`, { method: "POST", body: {}, idempotencia: `${o.id}-cancel-reconexion` });
        }
      } catch (e) {
        console.warn("[reconexion] no se pudo cancelar la orden en Mercado Pago", o.id, e instanceof Error ? e.message : e);
      }
    }
    const { error } = await admin
      .from("mp_ordenes")
      .update({ estado: "cancelada", detalle_error: motivo, notificado_at: new Date().toISOString() })
      .eq("id", o.id)
      .eq("negocio_id", negocioId);
    if (!error) canceladas += 1;
  }
  return canceladas;
}

type TerminalMp = { id: string; operating_mode?: string };

/** Tras reconectar: la terminal de antes, si sigue en la cuenta, y en modo integrado. */
export async function restaurarTerminal(admin: SupabaseClient, negocioId: string, token: string): Promise<{ restaurada: boolean; aviso: string | null }> {
  const { data: fila } = await admin
    .from("integraciones_cobro")
    .select("terminal_previa_id, terminal_id")
    .eq("negocio_id", negocioId)
    .eq("proveedor", "mercadopago")
    .is("deleted_at", null)
    .maybeSingle();
  const previa = (fila?.terminal_previa_id as string | null) ?? null;
  if (!previa || fila?.terminal_id) return { restaurada: false, aviso: null };
  const r = await mpFetch<{ data?: { terminals?: TerminalMp[] }; terminals?: TerminalMp[] }>(token, "/terminals/v1/list?limit=50");
  const t = (r.data?.terminals ?? r.terminals ?? []).find((x) => x.id === previa);
  if (!t) return { restaurada: false, aviso: "La terminal que usabas ya no aparece en la cuenta: escógela de nuevo." };
  let aviso: string | null = null;
  if (t.operating_mode !== "PDV") {
    try {
      await mpFetch(token, "/terminals/v1/setup", { method: "PATCH", body: { terminals: [{ id: t.id, operating_mode: "PDV" }] } });
      aviso = "La terminal estaba fuera del modo integrado: se puso en modo integrado. Reiníciala para que lo tome.";
    } catch {
      aviso = "La terminal no está en modo integrado y no pudimos cambiarlo: apriétale «Poner en modo integrado».";
    }
  }
  await admin
    .from("integraciones_cobro")
    .update({ terminal_id: t.id, terminal_nombre: "Point Smart", terminal_compatible: true })
    .eq("negocio_id", negocioId)
    .eq("proveedor", "mercadopago")
    .is("deleted_at", null);
  return { restaurada: true, aviso };
}
