"use server";

import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";
import { sesionApp } from "@/lib/app/sesion";
import { supabaseAppEnNegocio } from "@/lib/app/en-negocio";
import { vinculoDe, vinculosApp } from "@/lib/app/negocios";
import { firmarContratoCon, ipDeFirma } from "@/lib/contratos/firmar";
import { conexionDeCobro, negocioParaCobro } from "@/lib/pagos/conexion";
import { adaptador } from "@/lib/pagos/adaptadores";
import { vigenciaLink } from "@/lib/mercadopago/links";
import { mensajeDeError } from "@/lib/pagos/tipos";
import { mensajeParaDueno } from "@/lib/app/mensajes";
import { resolverPlantilla } from "@/lib/contratos/plantilla";
import { horasDisponiblesApp, disponibilidadEstanciaApp, type HorasDisponibles, type DisponibilidadEstancia } from "@/lib/app/negocios";

/**
 * App para dueños · Fase 3 · acciones del servidor (docs/app-duenos/FASE-3.md). Cada una comprueba la sesión de la app
 * y que el negocio sea uno donde la persona tiene vínculo; la base vuelve a comprobar con mi_cliente_id(). Devuelven el
 * registro final (lo que la base respondió) para que la pantalla pinte sin recargar.
 */
export type ResultadoApp<T = Record<string, unknown>> = { error: string | null; datos?: T; registros?: RegistroFinal[] };

const UUID = /^[0-9a-f-]{36}$/i;

async function negocioMio(negocioId: string): Promise<string | null> {
  const s = await sesionApp();
  if (!s) return "Tu sesión terminó. Entra otra vez.";
  if (!UUID.test(negocioId)) return "Negocio inválido.";
  if (!(await vinculosApp()).some((v) => v.negocioId === negocioId)) return "Tu mascota no tiene expediente en ese negocio.";
  return null;
}

const ZONA_POR_OMISION = "America/Mexico_City";
async function zonaDe(negocioId: string): Promise<{ zona: string; ciudad: string | null }> {
  const { data } = await createSupabaseAdminClient().from("negocios").select("zona_horaria, ciudad").eq("id", negocioId).maybeSingle();
  return { zona: (data?.zona_horaria as string | null) ?? ZONA_POR_OMISION, ciudad: (data?.ciudad as string | null) ?? null };
}

// ── Confirmar una cita o una reserva en un toque ────────────────────────────────────────────────────────────────
export async function confirmarVisitaApp(negocioId: string, tipo: "estetica" | "estancia", id: string): Promise<ResultadoApp> {
  const falta = await negocioMio(negocioId);
  if (falta) return { error: falta };
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data, error } = await supabase.rpc("portal_confirmar_visita", { p_tipo: tipo, p_id: id });
  if (error) return { error: mensajeDeError(error) };
  const d = data as { id: string; estado: string; updated_at: string };
  const tabla = tipo === "estetica" ? "citas_estetica" : "estancias";
  // El dueño no lee citas_estetica ni estancias por tabla (llevan precio): el registro final va con lo que la base respondió.
  return { error: null, datos: d, registros: await registrosDe(supabase, [{ t: tabla, i: d.id, datos: { id: d.id, estado: d.estado, updated_at: d.updated_at } }]) };
}

// ── Lo que se ofrece: horas libres de un día y cupo por noche (solo leen) ───────────────────────────────────────
// registro-final: solo lee la disponibilidad; no cambia nada.
export async function horasApp(negocioId: string, servicioId: string, fecha: string): Promise<{ error: string | null; datos?: HorasDisponibles }> {
  const falta = await negocioMio(negocioId);
  if (falta) return { error: falta };
  if (!UUID.test(servicioId) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Escoge el servicio y el día." };
  const r = await horasDisponiblesApp(negocioId, servicioId, fecha);
  if ("error" in r) return { error: mensajeParaDueno(r.error) };
  return { error: null, datos: r };
}

// registro-final: solo lee el cupo; no cambia nada.
export async function cupoApp(negocioId: string, servicioId: string, entrada: string, salida: string): Promise<{ error: string | null; datos?: DisponibilidadEstancia }> {
  const falta = await negocioMio(negocioId);
  if (falta) return { error: falta };
  if (!UUID.test(servicioId) || !/^\d{4}-\d{2}-\d{2}$/.test(entrada) || !/^\d{4}-\d{2}-\d{2}$/.test(salida)) return { error: "Escoge el servicio y las fechas." };
  const r = await disponibilidadEstanciaApp(negocioId, servicioId, entrada, salida);
  if ("error" in r) return { error: mensajeParaDueno(r.error) };
  return { error: null, datos: r };
}

// ── Pedir cita de estética ───────────────────────────────────────────────────────────────────────────────────────
export async function pedirCitaApp(negocioId: string, mascotaId: string, servicioId: string, inicioIso: string): Promise<ResultadoApp> {
  const falta = await negocioMio(negocioId);
  if (falta) return { error: falta };
  const v = await vinculoDe(mascotaId, negocioId);
  if (!v) return { error: "Esa mascota no tiene expediente en este negocio." };
  if (!UUID.test(servicioId) || Number.isNaN(Date.parse(inicioIso))) return { error: "Escoge el servicio y la hora." };
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data, error } = await supabase.rpc("portal_pedir_cita", { p_perro: v.perroId, p_servicio: servicioId, p_inicio: new Date(inicioIso).toISOString() });
  if (error) return { error: mensajeParaDueno(mensajeDeError(error)) };
  const d = data as { cita_id: string; reserva_id: string; estado: string; updated_at: string };
  return { error: null, datos: d, registros: await registrosDe(supabase, [{ t: "citas_estetica", i: d.cita_id, datos: d }]) };
}

// ── Reservar guardería u hotel (la base valida cupo, requisitos y traslapes; el contrato de alta sale en el mismo flujo) ──
export async function reservarApp(negocioId: string, mascotaId: string, servicioId: string, entrada: string, salida: string, horas: number | null): Promise<ResultadoApp> {
  const falta = await negocioMio(negocioId);
  if (falta) return { error: falta };
  const v = await vinculoDe(mascotaId, negocioId);
  if (!v) return { error: "Esa mascota no tiene expediente en este negocio." };
  if (!UUID.test(servicioId) || !/^\d{4}-\d{2}-\d{2}$/.test(entrada) || !/^\d{4}-\d{2}-\d{2}$/.test(salida)) return { error: "Escoge el servicio y las fechas." };
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data, error } = await supabase.rpc("portal_reservar", { p_perro: v.perroId, p_servicio: servicioId, p_entrada: entrada, p_salida: salida, p_horas: horas && horas > 0 ? Math.round(horas) : null });
  if (error) return { error: mensajeParaDueno(mensajeDeError(error)) };
  const d = data as { reserva_id: string; estancia_id: string; estado: string; updated_at: string; contratos_por_firmar: { id: string; tipo_nombre: string }[] };
  return {
    error: null,
    datos: d,
    registros: await registrosDe(supabase, [
      { t: "estancias", i: d.estancia_id, datos: { id: d.estancia_id, estado: d.estado, updated_at: d.updated_at } },
      ...d.contratos_por_firmar.map((c) => ({ t: "contratos", i: c.id })),
    ]),
  };
}

// ── El texto del contrato antes de firmar (el mismo que llevará el PDF: plantilla resuelta con los datos del contrato) ──
// registro-final: solo lee el contrato; no cambia nada.
export async function textoContratoApp(negocioId: string, contratoId: string): Promise<{ error: string | null; datos?: { titulo: string; cuerpo: string; estado: string } }> {
  const falta = await negocioMio(negocioId);
  if (falta) return { error: falta };
  if (!UUID.test(contratoId)) return { error: "Contrato inválido." };
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data: c } = await supabase.from("contratos").select("id, estado, plantillas_contrato(titulo, cuerpo)").eq("id", contratoId).maybeSingle();
  if (!c) return { error: "No encontramos ese contrato." };
  const pl = (Array.isArray(c.plantillas_contrato) ? c.plantillas_contrato[0] : c.plantillas_contrato) as { titulo: string; cuerpo: string } | null;
  if (!pl) return { error: "No pudimos leer este contrato." };
  const { data: campos, error } = await supabase.rpc("resolver_campos_de_contrato", { p_contrato_id: contratoId });
  if (error || !campos) return { error: "No pudimos preparar tu contrato. Intenta de nuevo en unos minutos." };
  const t = campos as Record<string, string>;
  return { error: null, datos: { titulo: resolverPlantilla(pl.titulo, t), cuerpo: resolverPlantilla(pl.cuerpo, t), estado: c.estado as string } };
}

// ── Firmar un contrato pendiente (la misma firma del portal) ────────────────────────────────────────────────────
export async function firmarContratoApp(negocioId: string, contratoId: string, firmaPngDataUrl: string): Promise<ResultadoApp> {
  const falta = await negocioMio(negocioId);
  if (falta) return { error: falta };
  if (!UUID.test(contratoId)) return { error: "Contrato inválido." };
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { zona, ciudad } = await zonaDe(negocioId);
  const r = await firmarContratoCon(supabase, { contratoId, firmaPngDataUrl, zona, lugar: ciudad, ip: ipDeFirma(await headers()) });
  if (r.error) return { error: r.error };
  return { error: null, registros: await registrosDe(supabase, [{ t: "contratos", i: contratoId }]) };
}

// ── Pedir el link de pago de una cuenta con saldo (Mercado Pago del negocio; en la demo, simulado) ───────────────
export async function pedirLinkPagoApp(negocioId: string, reservaId: string): Promise<ResultadoApp<{ url: string; monto: number; simulado: boolean }>> {
  const falta = await negocioMio(negocioId);
  if (falta) return { error: falta };
  if (!UUID.test(reservaId)) return { error: "Cuenta inválida." };
  const supabase = await supabaseAppEnNegocio(negocioId);
  // Solo una cuenta del dueño con saldo (la misma lista que ve en la app).
  const { data: pendientes } = await supabase.rpc("mis_pagos_pendientes");
  const cuenta = ((pendientes ?? []) as { reserva_id: string; saldo: number; descripcion: string; link: { url: string; monto: number; expira_at: string | null } | null }[]).find((p) => p.reserva_id === reservaId);
  if (!cuenta || Number(cuenta.saldo) <= 0) return { error: "Esa cuenta no tiene saldo pendiente." };
  // Ya hay un link vivo: no se crea nada (nada que repintar).
  if (cuenta.link?.url) return { error: null, datos: { url: cuenta.link.url, monto: Number(cuenta.link.monto), simulado: false }, registros: [] };
  const negocio = await negocioParaCobro(negocioId);
  if (!negocio) return { error: "No encontramos el negocio." };
  const cx = await conexionDeCobro(negocio);
  if (!cx) return { error: "Este negocio no cobra con link todavía: paga en el mostrador o pídeselo por WhatsApp." };
  const s = await sesionApp();
  const admin = createSupabaseAdminClient(negocioId);
  const monto = Math.round(Number(cuenta.saldo) * 100) / 100;
  const expira = vigenciaLink();
  const titulo = `Pago a ${negocio.nombre}`;
  const { data: orden, error: errorOrden } = await admin
    .from("mp_ordenes")
    .insert({
      negocio_id: negocioId,
      proveedor: cx.proveedor,
      cuenta_id: cx.cuentaId,
      tipo: "link",
      reserva_id: reservaId,
      monto,
      descripcion: `${titulo} · ${cuenta.descripcion}`.slice(0, 120),
      estado: "creada",
      simulado: cx.simulado,
      expira_at: expira.toISOString(),
      created_by: s?.user.id ?? null,
    })
    .select("id")
    .single();
  if (errorOrden || !orden) return { error: "No pudimos preparar el link. Intenta de nuevo." };
  const ad = adaptador(cx.proveedor);
  if (!ad.crearLinkPago) {
    await admin.from("mp_ordenes").update({ estado: "fallida", detalle_error: "El proveedor de cobro del negocio no hace links." }).eq("id", orden.id).eq("negocio_id", negocioId);
    return { error: "Este negocio no cobra con link todavía: paga en el mostrador o pídeselo por WhatsApp." };
  }
  try {
    const { data: reservaFila } = await admin.from("reservas").select("cliente_id").eq("id", reservaId).eq("negocio_id", negocioId).maybeSingle();
    const { data: dueno } = reservaFila?.cliente_id ? await admin.from("clientes").select("nombre, telefono").eq("id", reservaFila.cliente_id as string).maybeSingle() : { data: null };
    const link = await ad.crearLinkPago(cx, {
      ordenId: orden.id as string,
      monto,
      titulo,
      clienteNombre: (dueno?.nombre as string | null) ?? "Cliente",
      clienteTelefono: ((dueno?.telefono as string | null) ?? "").replace(/\D/g, "") || null,
      expiraAt: expira,
    });
    await admin.from("mp_ordenes").update({ mp_preference_id: link.idRemoto, url_pago: link.url, ultimo_evento: link.crudo as object }).eq("id", orden.id).eq("negocio_id", negocioId);
    return { error: null, datos: { url: link.url, monto, simulado: cx.simulado }, registros: await registrosDe(supabase, [{ t: "mp_ordenes", i: orden.id as string, datos: { id: orden.id, url_pago: link.url, monto, estado: "creada" } }]) };
  } catch (e) {
    await admin.from("mp_ordenes").update({ estado: "fallida", detalle_error: mensajeDeError(e) }).eq("id", orden.id).eq("negocio_id", negocioId);
    return { error: mensajeDeError(e) };
  }
}

// ── Reseña verificada ───────────────────────────────────────────────────────────────────────────────────────────
export async function resenarApp(negocioId: string, tipo: "estetica" | "estancia", id: string, estrellas: number, texto: string): Promise<ResultadoApp> {
  const falta = await negocioMio(negocioId);
  if (falta) return { error: falta };
  if (!UUID.test(id)) return { error: "Visita inválida." };
  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) return { error: "Califica de 1 a 5 estrellas." };
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data, error } = await supabase.rpc("portal_resenar", { p_tipo: tipo, p_id: id, p_estrellas: estrellas, p_texto: texto.trim().slice(0, 500) || null });
  if (error) return { error: mensajeDeError(error) };
  const d = data as { id: string };
  return { error: null, datos: d, registros: await registrosDe(supabase, [{ t: "resenas", i: d.id }]) };
}
