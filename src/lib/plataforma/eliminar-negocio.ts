import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { stripe, stripeConfigurado, mensajeDeErrorStripe } from "@/lib/cobro/stripe";

// Borrar un negocio de prueba o suspendido, completo. La base decide si se
// puede (plataforma_negocio_a_borrar: no el demo ni Ludogteka, solo prueba o
// suspendido, sin cobros reales) y borra por negocio_id (plataforma_eliminar_negocio,
// con el nombre escrito como confirmación). Lo que Postgres no alcanza se
// limpia aquí, EN ESTE ORDEN y antes de borrar la base, para que un fallo
// deje el negocio intacto y se pueda repetir:
//   1. Stripe: cancela la suscripción y borra el cliente (solo los que son de este negocio).
//   2. Storage: sus carpetas en los buckets.
//   3. La base (esto también desvincula las credenciales de Mercado Pago/Clip en Vault).
//   4. Auth: las cuentas que se quedaron sin ningún negocio.
// El script scripts/plataforma/eliminar-negocio.mjs hace lo mismo para correrlo
// desde la nube sin sesión de pantalla.

export type ManifiestoBorrado = {
  negocio: { id: string; slug: string; nombre: string; plan: string; activo: boolean };
  telefonos: string[];
  clientes: number;
  stripe: { customers: string[]; suscripciones: string[] };
  integraciones: number;
  objetos: { bucket: string; name: string }[];
};

export type ResultadoBorrado = { error: string | null; exito?: string; detalle?: Record<string, unknown> };

const LOTE_STORAGE = 100;

export async function eliminarNegocioCompleto(
  supabase: SupabaseClient,
  negocioId: string,
  confirmacion: string,
): Promise<ResultadoBorrado> {
  const { data: m, error: eManifiesto } = await supabase.rpc("plataforma_negocio_a_borrar", { p_negocio_id: negocioId });
  if (eManifiesto) return { error: eManifiesto.message };
  const manifiesto = m as ManifiestoBorrado;
  if (confirmacion.trim() !== manifiesto.negocio.nombre) {
    return { error: `Para borrar escribe el nombre del negocio tal cual: «${manifiesto.negocio.nombre}».` };
  }

  // 1. Stripe
  const { customers, suscripciones } = manifiesto.stripe;
  const stripeLimpio = { suscripciones: 0, clientes: 0, ajenos: 0 };
  if (customers.length > 0 || suscripciones.length > 0) {
    if (!stripeConfigurado()) {
      return { error: "Este negocio tiene suscripción o cliente en Stripe y Stripe no está configurado aquí: no se borra nada." };
    }
    try {
      const s = stripe();
      for (const id of suscripciones) {
        try {
          await s.subscriptions.cancel(id);
          stripeLimpio.suscripciones++;
        } catch (e) {
          if ((e as { code?: string }).code !== "resource_missing") throw e;
        }
      }
      for (const id of customers) {
        try {
          const c = await s.customers.retrieve(id);
          if (c.deleted) continue;
          // La cuenta de Stripe es compartida: solo se borra el cliente que dice ser de este negocio.
          if (c.metadata?.peludesk_negocio_id !== negocioId) {
            stripeLimpio.ajenos++;
            continue;
          }
          await s.customers.del(id);
          stripeLimpio.clientes++;
        } catch (e) {
          if ((e as { code?: string }).code !== "resource_missing") throw e;
        }
      }
    } catch (e) {
      return { error: `No pudimos limpiar Stripe (${mensajeDeErrorStripe(e)}). No se borró nada.` };
    }
  }

  // 2. Storage
  const admin = createSupabaseAdminClient();
  const porBucket = new Map<string, string[]>();
  for (const o of manifiesto.objetos) porBucket.set(o.bucket, [...(porBucket.get(o.bucket) ?? []), o.name]);
  for (const [bucket, nombres] of porBucket) {
    for (let i = 0; i < nombres.length; i += LOTE_STORAGE) {
      const { error } = await admin.storage.from(bucket).remove(nombres.slice(i, i + LOTE_STORAGE));
      if (error) return { error: `No pudimos borrar los archivos de ${bucket}: ${error.message}. No se borró el negocio; vuelve a intentarlo.` };
    }
  }

  // 3. La base
  const { data: r, error: eBorrar } = await supabase.rpc("plataforma_eliminar_negocio", { p_negocio_id: negocioId, p_confirmacion: confirmacion.trim() });
  if (eBorrar) return { error: eBorrar.message };
  const resultado = r as { cuentas_huerfanas: string[]; filas: Record<string, number>; secretos_vault: number };

  // 4. Auth: cuentas que se quedaron sin negocio
  let cuentas = 0;
  for (const id of resultado.cuentas_huerfanas ?? []) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (!error) cuentas++;
  }
  return {
    error: null,
    exito: `«${manifiesto.negocio.nombre}» se borró: ${Object.keys(resultado.filas).length} tablas limpiadas, ${manifiesto.objetos.length} archivos, ${cuentas} cuentas sin negocio y ${resultado.secretos_vault} credenciales de cobro desvinculadas.`,
    detalle: { ...resultado, stripe: stripeLimpio, cuentas_borradas: cuentas },
  };
}
