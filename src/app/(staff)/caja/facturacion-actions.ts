"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual, urlDelNegocioActual } from "@/lib/negocio/actual";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { MENSAJE_SOLO_LECTURA } from "@/lib/solo-lectura";
import {
  cancelarFactura,
  enviarPorCorreo,
  revisarFactura,
  sincronizarCancelaciones,
  timbrarFactura,
  traducir,
  type Resultado,
} from "@/lib/cfdi/servicio";

// Facturar un cobro, un cobro junto o la global; cancelar, sustituir, descargar
// y mandar. Los permisos y las reglas las comprueba la base con la sesión de
// quien llama; aquí solo se junta el trabajo con el PAC (src/lib/cfdi).

export type ResultadoFactura = Resultado & { facturaId?: string; enlaceWhatsapp?: string; mensaje?: string };

export type ReceptorManual = { rfc: string; nombre_fiscal: string; cp: string; regimen_fiscal: string; uso_cfdi: string; email?: string };

async function enDemo(): Promise<ResultadoFactura | null> {
  return (await cargarNegocioLanding()).plan === "demo" ? { error: MENSAJE_SOLO_LECTURA } : null;
}

function refrescar() {
  revalidatePath("/caja");
  revalidatePath("/caja/facturas");
  revalidatePath("/recepcion");
}

async function contexto() {
  const negocio = await negocioActual();
  return { negocio, sb: await createSupabaseServerClient(), admin: createSupabaseAdminClient(negocio.id) };
}

/** Prepara y timbra la factura de uno o varios cobros de la MISMA persona. */
export async function facturarCobros(cobroIds: string[], receptor?: ReceptorManual | null): Promise<ResultadoFactura> {
  const negado = await enDemo();
  if (negado) return negado;
  if (!cobroIds.length) return { error: "Escoge al menos un cobro." };
  const { negocio, sb, admin } = await contexto();
  const p = await sb.rpc("cfdi_preparar_cobros", { p_cobro_ids: cobroIds, p_receptor: receptor ?? null, p_sustituye: null });
  if (p.error) return { error: traducir(p.error) };
  const facturaId = p.data as string;
  const r = await timbrarFactura(sb, admin, negocio.id, facturaId);
  refrescar();
  return { ...r, facturaId };
}

/** El cobro junto (varias cuentas de la misma clienta) sale en UNA factura. */
export async function facturarGrupo(grupoId: string, receptor?: ReceptorManual | null): Promise<ResultadoFactura> {
  const negado = await enDemo();
  if (negado) return negado;
  const { negocio, sb } = await contexto();
  const { data } = await sb.from("cobros").select("id, anulado_at").eq("grupo_id", grupoId).eq("negocio_id", negocio.id).is("deleted_at", null);
  const ids = (data ?? []).filter((c) => !c.anulado_at).map((c) => c.id as string);
  if (!ids.length) return { error: "Ese cobro junto no tiene cobros vigentes por facturar." };
  return facturarCobros(ids, receptor);
}

export async function timbrarBorrador(facturaId: string): Promise<ResultadoFactura> {
  const negado = await enDemo();
  if (negado) return negado;
  const { negocio, sb, admin } = await contexto();
  const r = await timbrarFactura(sb, admin, negocio.id, facturaId);
  refrescar();
  return { ...r, facturaId };
}

export async function revisarPorRevisar(facturaId: string): Promise<ResultadoFactura> {
  const { negocio, sb, admin } = await contexto();
  const r = await revisarFactura(sb, admin, negocio.id, facturaId);
  refrescar();
  return r;
}

export async function descartarBorrador(facturaId: string): Promise<ResultadoFactura> {
  const negado = await enDemo();
  if (negado) return negado;
  const { sb } = await contexto();
  const { error } = await sb.rpc("cfdi_descartar", { p_factura_id: facturaId });
  if (error) return { error: traducir(error) };
  refrescar();
  return { error: null, aviso: "Borrador descartado: los cobros quedaron libres para facturarse." };
}

export async function cancelarUnaFactura(facturaId: string, motivo: string, sustitutaUuid: string | null): Promise<ResultadoFactura> {
  const negado = await enDemo();
  if (negado) return negado;
  const { sb, admin } = await contexto();
  const r = await cancelarFactura(sb, admin, facturaId, motivo, sustitutaUuid);
  refrescar();
  return r;
}

/**
 * «Corregir y sustituir»: emite otra factura de los mismos cobros (relación 04
 * con la anterior) y, solo si salió, cancela la anterior con el motivo 01 y el
 * UUID de la nueva. Los datos fiscales nuevos (si los hay) van en `receptor`.
 */
export async function sustituirFactura(facturaId: string, receptor?: ReceptorManual | null): Promise<ResultadoFactura> {
  const negado = await enDemo();
  if (negado) return negado;
  const { negocio, sb, admin } = await contexto();
  const { data: vieja } = await sb.from("cfdi_factura_cobros").select("cobro_id").eq("factura_id", facturaId).eq("vigente", true);
  const ids = (vieja ?? []).map((c) => c.cobro_id as string);
  if (!ids.length) return { error: "Esa factura no tiene cobros por sustituir." };
  const p = await sb.rpc("cfdi_preparar_cobros", { p_cobro_ids: ids, p_receptor: receptor ?? null, p_sustituye: facturaId });
  if (p.error) return { error: traducir(p.error) };
  const nuevaId = p.data as string;
  const t = await timbrarFactura(sb, admin, negocio.id, nuevaId);
  if (t.error) {
    refrescar();
    return { ...t, facturaId: nuevaId, error: `${t.error} (La factura anterior sigue vigente.)` };
  }
  const { data: nueva } = await admin.from("cfdi_facturas").select("uuid_fiscal").eq("id", nuevaId).eq("negocio_id", negocio.id).maybeSingle();
  const c = await cancelarFactura(sb, admin, facturaId, "01", nueva?.uuid_fiscal ?? null);
  refrescar();
  if (c.error) return { error: `La factura nueva ya salió, pero la anterior no se pudo cancelar: ${c.error}`, facturaId: nuevaId };
  return { error: null, aviso: `Factura sustituida. ${c.aviso ?? ""}`.trim(), facturaId: nuevaId };
}

export async function actualizarCancelaciones(): Promise<ResultadoFactura> {
  const { negocio, admin, sb } = await contexto();
  const { data: ok } = await sb.rpc("tiene_permiso", { p_permiso: "cancelar_facturas" });
  const { data: ok2 } = await sb.rpc("tiene_permiso", { p_permiso: "facturar" });
  if (!ok && !ok2) return { error: "No tienes permiso para esto." };
  const n = await sincronizarCancelaciones(admin, negocio.id);
  refrescar();
  return { error: null, aviso: n ? `${n} cancelación(es) cambiaron de estado.` : "Sin cambios por ahora." };
}

/** Emite la factura global de un periodo CERRADO. */
export async function emitirGlobal(desde: string, hasta: string): Promise<ResultadoFactura> {
  const negado = await enDemo();
  if (negado) return negado;
  const { negocio, sb, admin } = await contexto();
  const p = await sb.rpc("cfdi_preparar_global", { p_desde: desde, p_hasta: hasta });
  if (p.error) return { error: traducir(p.error) };
  const facturaId = p.data as string;
  const r = await timbrarFactura(sb, admin, negocio.id, facturaId);
  refrescar();
  return { ...r, facturaId };
}

/** Link de un solo uso para que el cliente baje PDF y XML + el wa.me con el mensaje. */
export async function enlaceDeFactura(facturaId: string): Promise<ResultadoFactura> {
  const negado = await enDemo();
  if (negado) return negado;
  const { negocio, sb } = await contexto();
  const { data: f } = await sb
    .from("cfdi_facturas")
    .select("id, cliente_id, serie, folio, estado, receptor")
    .eq("id", facturaId)
    .eq("negocio_id", negocio.id)
    .maybeSingle();
  if (!f) return { error: "Esa factura no existe." };
  const token = randomBytes(32).toString("hex");
  const { error } = await sb.rpc("cfdi_guardar_enlace", { p_factura_id: facturaId, p_hash: createHash("sha256").update(token).digest("hex"), p_dias: 30 });
  if (error) return { error: traducir(error) };
  const base = await urlDelNegocioActual();
  const url = `${base}/fac/${token}`;
  let tel: string | null = null;
  if (f.cliente_id) {
    const { data: c } = await sb.from("clientes").select("telefono").eq("id", f.cliente_id).maybeSingle();
    tel = c?.telefono ? String(c.telefono).replace(/\D/g, "") : null;
  }
  const mensaje = `Hola, aquí está tu factura ${f.serie ?? ""}${f.folio ?? ""} de ${negocio.nombre}. Puedes bajar el PDF y el XML aquí (el link dura 30 días): ${url}`;
  await sb.rpc("cfdi_registrar_envio", { p_factura_id: facturaId, p_canal: "whatsapp" });
  refrescar();
  return { error: null, enlaceWhatsapp: tel ? `https://wa.me/52${tel}?text=${encodeURIComponent(mensaje)}` : undefined, aviso: tel ? undefined : "El cliente no tiene teléfono: copia el mensaje y mándalo por donde lo contactes.", facturaId, mensaje };
}

export async function correoDeFactura(facturaId: string, correo: string): Promise<ResultadoFactura> {
  const negado = await enDemo();
  if (negado) return negado;
  const c = correo.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) return { error: "Escribe un correo válido." };
  const { negocio, sb, admin } = await contexto();
  const { data: f } = await sb.from("cfdi_facturas").select("id, estado, pac_factura_id").eq("id", facturaId).eq("negocio_id", negocio.id).maybeSingle();
  if (!f || !f.pac_factura_id || !["vigente", "cancelacion_pendiente"].includes(f.estado)) return { error: "Solo se manda una factura vigente." };
  const r = await enviarPorCorreo(admin, facturaId, f.pac_factura_id, c);
  if (r.error) return r;
  const { error } = await sb.rpc("cfdi_registrar_envio", { p_factura_id: facturaId, p_canal: "correo" });
  if (error) return { error: traducir(error) };
  refrescar();
  return { error: null, aviso: `Factura enviada a ${c}.` };
}
