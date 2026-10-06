import type { SupabaseClient } from "@supabase/supabase-js";
import { adaptador } from "./adaptadores";
import { leerOrdenLocal, sincronizarTerminal } from "./registro";
import { mensajeDeError, type ConexionCobro } from "./tipos";

/**
 * Cancela los cobros EN CURSO de una cuenta (una orden en la terminal o un
 * link de pago abierto) antes de cambiar lo que se cobra: un cobro pendiente
 * por el monto equivocado no puede quedarse colgado.
 *
 * Nunca anula algo que el proveedor ya aprobó: antes de cancelar una orden
 * de terminal le vuelve a preguntar al proveedor (sincronizarTerminal, la
 * misma verificación de siempre) y, si ya está pagada o quedó por confirmar,
 * se detiene SIN cancelar nada más. Si la terminal no deja cancelarla, también
 * se detiene: el cliente podría pagar el monto viejo.
 */
export async function cancelarCobrosEnCurso(
  admin: SupabaseClient,
  negocioId: string,
  cx: ConexionCobro | null,
  ordenesCrudas: { id: string; tipo: string; estado: string }[],
  motivo: string
): Promise<{ error: string | null; canceladas: { id: string; tipo: string; estado_antes: string }[] }> {
  const canceladas: { id: string; tipo: string; estado_antes: string }[] = [];
  // Una orden de un cobro junto puede venir una vez por cada cuenta del grupo.
  const ordenes = ordenesCrudas.filter((o, i) => ordenesCrudas.findIndex((x) => x.id === o.id) === i);
  for (const o of ordenes) {
    if (o.estado === "por_confirmar") {
      return { error: "Hay un cobro por confirmar con el proveedor: ábrelo en la cuenta y usa «Revisar con Mercado Pago» antes de corregir el servicio.", canceladas };
    }
    let orden = await leerOrdenLocal(admin, o.id, negocioId);
    if (!orden) continue;

    if (o.tipo === "point" && orden.mp_order_id && !orden.simulado && cx && orden.proveedor === cx.proveedor) {
      try {
        const r = await sincronizarTerminal(admin, cx, orden);
        if (r.pagada) return { error: "El cliente ya pagó ese cobro en la terminal: ya quedó registrado. Revisa la cuenta antes de corregir el servicio.", canceladas };
        if (r.estado === "por_confirmar") return { error: "Ese cobro de la terminal quedó por confirmar con el proveedor: revísalo en la cuenta antes de corregir el servicio.", canceladas };
      } catch (e) {
        return { error: `No pudimos confirmar con el proveedor el estado del cobro en la terminal (${mensajeDeError(e)}). Cancélalo en la terminal y vuelve a intentar.`, canceladas };
      }
      orden = await leerOrdenLocal(admin, o.id, negocioId);
      if (orden && !["cancelada", "expirada", "fallida", "reembolsada"].includes(orden.estado)) {
        try {
          await adaptador(orden.proveedor).cancelarCobroTerminal(cx, orden);
        } catch (e) {
          return { error: `No se pudo cancelar el cobro en la terminal (${mensajeDeError(e)}). Cancélalo en la terminal y vuelve a intentar.`, canceladas };
        }
      }
    }

    // Un link de pago no se puede retirar del proveedor desde la app: queda
    // cancelado aquí y, si alguien lo pagara después, la conciliación avisa
    // del pago que la caja no tiene.
    await admin
      .from("mp_ordenes")
      .update({ estado: "cancelada", detalle_error: motivo, notificado_at: new Date().toISOString() })
      .eq("id", o.id)
      .eq("negocio_id", negocioId)
      .in("estado", ["creada", "en_terminal"]);
    canceladas.push({ id: o.id, tipo: o.tipo, estado_antes: o.estado });
  }
  return { error: null, canceladas };
}
