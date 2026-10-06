import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buscarPagos, ESTADOS_CON_DINERO } from "@/lib/mercadopago/busqueda";
import { conexionDeCobro, type NegocioParaCobro } from "./conexion";
import { mensajeDeError } from "./tipos";

/**
 * «Marcar como no recibido» (5 de octubre de 2026): corregir un cobro con
 * terminal que quedó como pagado sin que nadie pasara tarjeta (el de Ludogteka
 * fue un cobro a mano con método «Terminal»).
 *
 * Solo se permite cuando Mercado Pago confirma, por consulta directa, que NO
 * hay un pago aprobado que pueda corresponder al cobro (mismo monto, cerca de
 * la hora, y que no esté ya ligado a otro cobro). Si lo hay, o si no se puede
 * consultar, se niega: la devolución sigue siendo solo para pagos reales.
 */
export type ResultadoRevision = { ok: true; aviso: string } | { ok: false; error: string };

const VENTANA_HORAS = 6;
const dinero = (v: number) => `$${v.toFixed(2)}`;

/** Pagos ya ligados a un cobro nuestro (no pueden ser «el pago de este cobro»). */
export async function pagosYaLigados(admin: SupabaseClient, negocioId: string): Promise<Set<string>> {
  const { data } = await admin
    .from("mp_ordenes")
    .select("mp_payment_id, mp_payment_ref")
    .eq("negocio_id", negocioId)
    .is("deleted_at", null);
  const s = new Set<string>();
  for (const o of data ?? []) {
    if (o.mp_payment_id) s.add(String(o.mp_payment_id));
    if (o.mp_payment_ref) s.add(String(o.mp_payment_ref));
  }
  return s;
}

export async function revisarCobroConProveedor(negocio: NegocioParaCobro, cobroId: string, motivo: string, actorId: string): Promise<ResultadoRevision> {
  const admin = createSupabaseAdminClient(negocio.id);
  const { data: cobro } = await admin
    .from("cobros")
    .select("id, created_at, origen, grupo_id, cobro_metodos(metodo, monto, propina)")
    .eq("id", cobroId)
    .eq("negocio_id", negocio.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!cobro) return { ok: false, error: "Cobro no encontrado." };
  // Un cobro de un pago agrupado se revisa (y se deshace) completo: el monto que
  // Mercado Pago tendría que mostrar es el de TODAS las cuentas del grupo.
  let grupoCobros: { cobro_metodos: unknown }[] = [cobro];
  if (cobro.grupo_id) {
    const { data: delGrupo } = await admin
      .from("cobros")
      .select("id, cobro_metodos(metodo, monto, propina)")
      .eq("negocio_id", negocio.id)
      .eq("grupo_id", cobro.grupo_id as string)
      .is("deleted_at", null);
    grupoCobros = delGrupo ?? [cobro];
  }
  if ((cobro.origen ?? "manual") !== "manual") {
    return { ok: false, error: "Este cobro entró con un pago que el proveedor confirmó: si hay que devolverlo, usa «Devolver con Mercado Pago»." };
  }
  const metodos = grupoCobros.flatMap((c) => (c.cobro_metodos ?? []) as { metodo: string; monto: number; propina: number }[]);
  const terminal = metodos.filter((m) => m.metodo === "terminal");
  const monto = Math.round(terminal.reduce((s, m) => s + Number(m.monto), 0) * 100) / 100;
  if (monto <= 0) return { ok: false, error: "Este cobro no tiene un método de terminal." };

  const cx = await conexionDeCobro(negocio);
  if (!cx || cx.proveedor !== "mercadopago" || cx.simulado || !cx.mp?.accessToken) {
    return {
      ok: false,
      error: "Para marcarlo como no recibido hay que comprobarlo con Mercado Pago, y la cuenta no está conectada. Reconéctala en Administración → Cobro con terminal y vuelve a intentarlo.",
    };
  }

  const cuando = new Date(cobro.created_at as string);
  let pagos;
  try {
    pagos = await buscarPagos(cx, new Date(cuando.getTime() - VENTANA_HORAS * 3_600_000), new Date(cuando.getTime() + VENTANA_HORAS * 3_600_000));
  } catch (e) {
    return { ok: false, error: `No pudimos consultar a Mercado Pago (${mensajeDeError(e)}). No se cambió nada.` };
  }
  const ligados = await pagosYaLigados(admin, negocio.id);
  const candidatos = pagos.filter(
    (p) => ESTADOS_CON_DINERO.includes(p.status) && Math.abs(Number(p.transaction_amount) - monto) <= 0.005 && !ligados.has(String(p.id))
  );
  if (candidatos.length > 0) {
    const c = candidatos[0];
    return {
      ok: false,
      error: `Mercado Pago SÍ tiene un pago ${c.status === "approved" ? "aprobado" : `(${c.status})`} de ${dinero(monto)} (id ${c.id}${c.date_approved ? `, ${c.date_approved.slice(0, 16).replace("T", " ")}` : ""}) que podría ser de este cobro. No se marcó como no recibido: confírmalo con el cliente.`,
    };
  }

  const { data, error } = await admin.rpc("cobro_marcar_no_recibido", {
    p_cobro_id: cobroId,
    p_motivo: motivo,
    p_actor: actorId,
    p_evidencia: {
      mp_sin_pago_aprobado: true,
      consultado_at: new Date().toISOString(),
      cuenta_id: cx.cuentaId,
      ventana_horas: VENTANA_HORAS,
      pagos_revisados: pagos.length,
      monto,
    },
  });
  if (error) return { ok: false, error: error.message.replace(/^.*?ERROR:\s*/, "") };
  const r = data as { turno_del_cobro_cerrado?: boolean; monto: number };
  return {
    ok: true,
    aviso: `Listo: el cobro de ${dinero(r.monto)} quedó como no recibido y ${cobro.grupo_id ? "las cuentas del cobro junto vuelven" : "la cuenta vuelve"} a tener saldo para cobrarse.${r.turno_del_cobro_cerrado ? " Ese cobro era de un turno ya cerrado: el corte no cambió, la corrección quedó en el turno abierto." : ""}`,
  };
}

/** Para el cron y las pantallas: sin credenciales ni cobros de más. */
export type { NegocioParaCobro };
