import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buscarPagos, ESTADOS_CON_DINERO, type PagoDeBusqueda } from "@/lib/mercadopago/busqueda";
import { consultarPago } from "@/lib/mercadopago/links";
import { conexionDeCobro, type NegocioParaCobro } from "./conexion";
import { pagosYaLigados } from "./no-recibido";

/**
 * Conciliación de los cobros con terminal contra Mercado Pago (5 de octubre
 * de 2026). Por cada negocio con Mercado Pago conectado (real, no simulado):
 *
 *   cobro_sin_pago  la app dice cobrado con terminal y Mercado Pago no tiene
 *                   un pago que el dinero haya entrado (o no se encuentra uno
 *                   del mismo monto cerca de la hora, en un cobro a mano).
 *   pago_sin_cobro  Mercado Pago tiene un pago aprobado que la caja no tiene.
 *
 * NO corrige nada: solo marca (conciliacion_sincronizar) para «Necesita
 * atención» del negocio y la administración de la plataforma, con antigüedad.
 * Lo ya marcado que deja de aparecer se resuelve solo.
 */
export const DIAS_CONCILIACION = 7;
const MARGEN_RECIENTE_MIN = 20;
const VENTANA_MANUAL_HORAS = 6;

export type Hallazgo = {
  tipo: "cobro_sin_pago" | "pago_sin_cobro";
  clave: string;
  cobro_id?: string;
  orden_id?: string;
  mp_pago_id?: string;
  monto: number;
  ocurrio_at: string;
  detalle: Record<string, unknown>;
};

export type ResultadoConciliacion =
  | { omitido: string }
  | { revisados: number; pagos: number; hallazgos: Hallazgo[]; guardado: { nuevos: number; vistos: number; resueltos: number } };

type CobroFila = {
  id: string;
  created_at: string;
  origen: string | null;
  cobro_metodos: { metodo: string; monto: number }[];
  devoluciones: { origen: string; deleted_at: string | null }[];
};
const redondea = (v: number) => Math.round(v * 100) / 100;

/** La parte pura (probable sin red): los hallazgos a partir de cobros y pagos. */
export function hallazgosDeConciliacion(args: {
  cobros: (CobroFila & { orden?: { id: string; mp_payment_ref: string | null; mp_payment_id: string | null } | null })[];
  pagos: PagoDeBusqueda[];
  ligados: Set<string>;
  ahora: Date;
  // Pagos que se pidieron por id porque no salieron en la búsqueda.
  pagosPorId?: Map<string, PagoDeBusqueda | null>;
}): Hallazgo[] {
  const { cobros, pagos, ligados, ahora } = args;
  const hallazgos: Hallazgo[] = [];
  const reclamados = new Set<string>();
  const porId = new Map(pagos.map((p) => [String(p.id), p]));
  const margen = ahora.getTime() - MARGEN_RECIENTE_MIN * 60_000;

  const ordenados = [...cobros].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const c of ordenados) {
    if (new Date(c.created_at).getTime() > margen) continue;
    if (c.devoluciones.some((d) => d.origen === "no_recibido" && !d.deleted_at)) continue;
    const terminal = redondea(c.cobro_metodos.filter((m) => m.metodo === "terminal").reduce((s, m) => s + Number(m.monto), 0));
    if (c.orden) {
      // Cobro integrado: tiene que existir su pago en Mercado Pago con dinero.
      const ref = c.orden.mp_payment_ref ?? c.orden.mp_payment_id;
      if (!ref || !/^\d+$/.test(ref)) continue;
      const p = porId.get(ref) ?? args.pagosPorId?.get(ref) ?? null;
      reclamados.add(ref);
      if (!p) continue; // no se pudo comprobar: no se acusa
      if (!ESTADOS_CON_DINERO.includes(p.status)) {
        hallazgos.push({
          tipo: "cobro_sin_pago", clave: c.id, cobro_id: c.id, orden_id: c.orden.id, mp_pago_id: ref, monto: terminal || redondea(Number(p.transaction_amount)),
          ocurrio_at: c.created_at, detalle: { motivo: `El cobro vino de una orden de Mercado Pago, pero el pago ${ref} está «${p.status}».`, origen: c.origen },
        });
      }
      continue;
    }
    if (terminal <= 0) continue;
    // Cobro a mano con terminal: debe haber un pago de Mercado Pago del mismo
    // monto cerca de la hora que ningún otro cobro haya reclamado.
    const cuando = new Date(c.created_at).getTime();
    const candidato = pagos.find(
      (p) =>
        ESTADOS_CON_DINERO.includes(p.status) &&
        !ligados.has(String(p.id)) &&
        !reclamados.has(String(p.id)) &&
        Math.abs(Number(p.transaction_amount) - terminal) <= 0.005 &&
        Math.abs(new Date(p.date_approved ?? p.date_created ?? 0).getTime() - cuando) <= VENTANA_MANUAL_HORAS * 3_600_000
    );
    if (candidato) {
      reclamados.add(String(candidato.id));
    } else {
      hallazgos.push({
        tipo: "cobro_sin_pago", clave: c.id, cobro_id: c.id, monto: terminal, ocurrio_at: c.created_at,
        detalle: { motivo: "Cobro a mano con terminal sin un pago de Mercado Pago del mismo monto cerca de esa hora.", origen: c.origen ?? "manual" },
      });
    }
  }

  // Pagos aprobados que la caja no tiene.
  for (const p of pagos) {
    const id = String(p.id);
    if (!["approved", "partially_refunded"].includes(p.status)) continue;
    if (ligados.has(id) || reclamados.has(id)) continue;
    const cuando = new Date(p.date_approved ?? p.date_created ?? 0);
    if (cuando.getTime() > margen) continue;
    hallazgos.push({
      tipo: "pago_sin_cobro", clave: id, mp_pago_id: id, monto: redondea(Number(p.transaction_amount)), ocurrio_at: cuando.toISOString(),
      detalle: { motivo: "Mercado Pago tiene este pago aprobado y la caja no lo tiene registrado.", tipo_pago: p.payment_type_id ?? null, referencia: p.external_reference ?? null },
    });
  }
  return hallazgos;
}

export async function conciliarNegocio(negocio: NegocioParaCobro, ahora = new Date()): Promise<ResultadoConciliacion> {
  const cx = await conexionDeCobro(negocio);
  if (!cx || cx.proveedor !== "mercadopago" || cx.simulado || !cx.mp?.accessToken) return { omitido: "sin Mercado Pago real conectado" };
  const admin = createSupabaseAdminClient(negocio.id);
  const desde = new Date(ahora.getTime() - DIAS_CONCILIACION * 86_400_000);

  const [{ data: cobrosCrudo }, { data: ordenes }, ligados] = await Promise.all([
    admin
      .from("cobros")
      .select("id, created_at, origen, cobro_metodos(metodo, monto), devoluciones(origen, deleted_at)")
      .eq("negocio_id", negocio.id)
      .is("deleted_at", null)
      .gte("created_at", desde.toISOString()),
    admin.from("mp_ordenes").select("id, cobro_id, mp_payment_id, mp_payment_ref").eq("negocio_id", negocio.id).is("deleted_at", null).not("cobro_id", "is", null),
    pagosYaLigados(admin, negocio.id),
  ]);
  const porCobro = new Map((ordenes ?? []).map((o) => [o.cobro_id as string, { id: o.id as string, mp_payment_id: o.mp_payment_id as string | null, mp_payment_ref: o.mp_payment_ref as string | null }]));
  const cobros = ((cobrosCrudo ?? []) as unknown as CobroFila[])
    .filter((c) => c.cobro_metodos.some((m) => m.metodo === "terminal") || porCobro.has(c.id))
    // Los de transferencia a mano también pueden haberse pagado con un pago de MP: solo se juzga terminal.
    .map((c) => ({ ...c, orden: porCobro.get(c.id) ?? null }));

  const pagos = await buscarPagos(cx, new Date(desde.getTime() - 86_400_000), ahora);
  // Los pagos de órdenes de la terminal que no salieron en la búsqueda: por id.
  const pagosPorId = new Map<string, PagoDeBusqueda | null>();
  const enBusqueda = new Set(pagos.map((p) => String(p.id)));
  for (const c of cobros) {
    const ref = c.orden?.mp_payment_ref;
    if (ref && /^\d+$/.test(ref) && !enBusqueda.has(ref) && !pagosPorId.has(ref)) {
      try {
        pagosPorId.set(ref, (await consultarPago(cx, ref)) as unknown as PagoDeBusqueda);
      } catch {
        pagosPorId.set(ref, null);
      }
    }
  }

  const hallazgos = hallazgosDeConciliacion({ cobros, pagos, ligados, ahora, pagosPorId });
  const { data, error } = await admin.rpc("conciliacion_sincronizar", {
    p_hallazgos: hallazgos,
    p_desde: desde.toISOString(),
    p_hasta: new Date(ahora.getTime() - MARGEN_RECIENTE_MIN * 60_000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return { revisados: cobros.length, pagos: pagos.length, hallazgos, guardado: data as { nuevos: number; vistos: number; resueltos: number } };
}
