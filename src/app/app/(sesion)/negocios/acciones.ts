"use server";

import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";
import { sesionApp } from "@/lib/app/sesion";
import { supabaseAppEnNegocio } from "@/lib/app/en-negocio";
import { cotizarPorDireccion, direccionDesdeUbicacion } from "@/lib/recoleccion/distancia";
import { dejaSolicitud, requisitoParaDueno, type MotivoBase, type RequisitoDueno } from "@/lib/app/requisitos";
import { avisarSolicitudAlNegocio } from "@/lib/app/solicitudes";
import { vinculoDe, vinculosApp } from "@/lib/app/negocios";
import { firmarContratoCon, ipDeFirma } from "@/lib/contratos/firmar";
import { linkDeSaldo } from "@/lib/pagos/link-de-saldo";
import { mensajeParaDueno } from "@/lib/app/mensajes";
import { mensajeSoloLectura } from "@/lib/solo-lectura";
import { resolverPlantilla } from "@/lib/contratos/plantilla";
import { horasDisponiblesApp, disponibilidadEstanciaApp, type HorasDisponibles, type DisponibilidadEstancia } from "@/lib/app/negocios";

/**
 * App para dueños · Fase 3 · acciones del servidor (docs/app-duenos/FASE-3.md). Cada una comprueba la sesión de la app
 * y que el negocio sea uno donde la persona tiene vínculo; la base vuelve a comprobar con mi_cliente_id(). Devuelven el
 * registro final (lo que la base respondió) para que la pantalla pinte sin recargar.
 */
export type ResultadoApp<T = Record<string, unknown>> = { error: string | null; datos?: T; registros?: RegistroFinal[] };

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * El rechazo de la base, dicho al dueño: su propio texto («ya se ocupó», «ese día no abre»…, sin rutas del personal) y,
 * si el negocio no deja escribir, el aviso de la demo o el de solo lectura. `mensajeDeError` (de pagos) solo entiende
 * excepciones de JavaScript: con un error de la base daba «No pudimos hablar con el proveedor de cobro».
 */
function rechazoDeLaBase(error: { code?: string; message?: string }): string {
  const texto = (error.message ?? "").trim();
  if (error.code === "42501" && /solo lectura|En la demo no se guardan/.test(texto)) return mensajeSoloLectura(error);
  return texto ? mensajeParaDueno(texto) : "No pudimos guardarlo. Intenta de nuevo.";
}

async function negocioMio(negocioId: string): Promise<string | null> {
  const s = await sesionApp();
  if (!s) return "Tu sesión terminó. Entra otra vez.";
  if (!UUID.test(negocioId)) return "Negocio inválido.";
  if (!(await vinculosApp()).some((v) => v.negocioId === negocioId)) return "Tu mascota no tiene expediente en ese negocio.";
  return null;
}

/** El expediente (cliente) de quien llama en este negocio: el titular o quien tiene acceso compartido a la mascota. */
async function miClienteEn(supabase: Awaited<ReturnType<typeof supabaseAppEnNegocio>>): Promise<string | null> {
  const { data } = await supabase.rpc("mi_cliente_id");
  return typeof data === "string" && UUID.test(data) ? data : null;
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
  if (error) return { error: rechazoDeLaBase(error) };
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
// Recolección a domicilio pedida desde la app (migración 20261203004100): lo que devolvió cotizarRecoleccionApp.
export type RecoleccionApp = { direccion: string; lat: number | null; lng: number | null; punto: "negocio" | "base"; km: number; hora: string | null; notas?: string | null };

export async function pedirCitaApp(negocioId: string, mascotaId: string, servicioId: string, inicioIso: string, recoleccion?: RecoleccionApp | null): Promise<ResultadoApp> {
  const falta = await negocioMio(negocioId);
  if (falta) return { error: falta };
  const v = await vinculoDe(mascotaId, negocioId);
  if (!v) return { error: "Esa mascota no tiene expediente en este negocio." };
  if (!UUID.test(servicioId) || Number.isNaN(Date.parse(inicioIso))) return { error: "Escoge el servicio y la hora." };
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data, error } = recoleccion
    ? await supabase.rpc("portal_pedir_cita_con_recoleccion", { p_perro: v.perroId, p_servicio: servicioId, p_inicio: new Date(inicioIso).toISOString(), p_recoleccion: recoleccion })
    : await supabase.rpc("portal_pedir_cita", { p_perro: v.perroId, p_servicio: servicioId, p_inicio: new Date(inicioIso).toISOString() });
  if (error) return { error: rechazoDeLaBase(error) };
  const d = data as { cita_id: string; reserva_id: string; estado: string; updated_at: string; recoleccion?: { id: string } | null };
  return { error: null, datos: d, registros: await registrosDe(supabase, [{ t: "citas_estetica", i: d.cita_id, datos: d }, ...(d.recoleccion?.id ? [{ t: "recolecciones", i: d.recoleccion.id, datos: d.recoleccion }] : [])]) };
}

/**
 * Cotiza la recolección para una mascota del dueño por la DIRECCIÓN (la guardada o una nueva), con la tarifa del negocio.
 * _lat y _lng ya no se usan: el APK anterior todavía los manda; la ubicación del celular nunca decide el cobro.
 */
// registro-final: solo cotiza; no cambia nada.
export async function cotizarRecoleccionApp(negocioId: string, mascotaId: string, direccion: string, _lat?: number | null, _lng?: number | null, punto: "negocio" | "base" = "negocio") {
  void _lat;
  void _lng;
  const falta = await negocioMio(negocioId);
  if (falta) return { error: falta };
  const v = await vinculoDe(mascotaId, negocioId);
  if (!v) return { error: "Esa mascota no tiene expediente en este negocio." };
  const supabase = await supabaseAppEnNegocio(negocioId);
  // La cotización es de quien pide (titular o con acceso compartido a la mascota): la base la busca con mi_cliente_id().
  void v;
  const clienteId = await miClienteEn(supabase);
  if (!clienteId) return { error: "No encontramos tu cuenta en este negocio." };
  const r = await cotizarPorDireccion({ caller: supabase, negocioId, clienteId, direccion, punto, esDueno: true });
  if (r.error) return { error: mensajeParaDueno(r.error) };
  if (Number(r.cotizacion?.km) > 60) return { error: "Esa dirección queda a más de 60 km del negocio. Pregúntale si puede pasar por tu mascota." };
  return { error: null, datos: r.cotizacion as unknown as Record<string, unknown>, lat: r.lat ?? null, lng: r.lng ?? null };
}

/** Su dirección guardada en este negocio, para abrir «Incluir recolección» ya llena. */
// registro-final: solo lee.
export async function direccionGuardadaApp(negocioId: string, mascotaId: string): Promise<{ error: string | null; direccion?: string | null }> {
  const falta = await negocioMio(negocioId);
  if (falta) return { error: falta };
  const v = await vinculoDe(mascotaId, negocioId);
  if (!v) return { error: "Esa mascota no tiene expediente en este negocio." };
  const supabase = await supabaseAppEnNegocio(negocioId);
  void v;
  const clienteId = await miClienteEn(supabase);
  const { data: cli } = clienteId ? await supabase.from("clientes").select("direccion").eq("id", clienteId).maybeSingle() : { data: null };
  return { error: null, direccion: (cli as { direccion: string | null } | null)?.direccion ?? null };
}

/** «¿Usar donde estás ahora?»: propone una dirección; se cotiza hasta que la persona la confirma. */
// registro-final: solo lee.
export async function direccionDeMiUbicacionApp(negocioId: string, mascotaId: string, lat: number, lng: number): Promise<{ error: string | null; direccion?: string }> {
  const falta = await negocioMio(negocioId);
  if (falta) return { error: falta };
  const v = await vinculoDe(mascotaId, negocioId);
  if (!v) return { error: "Esa mascota no tiene expediente en este negocio." };
  const supabase = await supabaseAppEnNegocio(negocioId);
  void v;
  const clienteId = await miClienteEn(supabase);
  if (!clienteId) return { error: "No encontramos tu cuenta en este negocio." };
  return direccionDesdeUbicacion(negocioId, clienteId, lat, lng);
}

// ── Reservar guardería u hotel (la base valida cupo, requisitos y traslapes; el contrato de alta sale en el mismo flujo) ──
export async function reservarApp(negocioId: string, mascotaId: string, servicioId: string, entrada: string, salida: string, horas: number | null, recoleccion?: RecoleccionApp | null): Promise<ResultadoApp> {
  const falta = await negocioMio(negocioId);
  if (falta) return { error: falta };
  const v = await vinculoDe(mascotaId, negocioId);
  if (!v) return { error: "Esa mascota no tiene expediente en este negocio." };
  if (!UUID.test(servicioId) || !/^\d{4}-\d{2}-\d{2}$/.test(entrada) || !/^\d{4}-\d{2}-\d{2}$/.test(salida)) return { error: "Escoge el servicio y las fechas." };
  const supabase = await supabaseAppEnNegocio(negocioId);
  const p_horas = horas && horas > 0 ? Math.round(horas) : null;
  const { data, error } = recoleccion
    ? await supabase.rpc("portal_reservar_con_recoleccion", { p_perro: v.perroId, p_servicio: servicioId, p_entrada: entrada, p_salida: salida, p_horas, p_recoleccion: recoleccion })
    : await supabase.rpc("portal_reservar", { p_perro: v.perroId, p_servicio: servicioId, p_entrada: entrada, p_salida: salida, p_horas });
  if (error) return { error: rechazoDeLaBase(error) };
  const d = data as { reserva_id: string; estancia_id: string; estado: string; updated_at: string; contratos_por_firmar: { id: string; tipo_nombre: string }[]; recoleccion?: { id: string } | null };
  return {
    error: null,
    datos: d,
    registros: await registrosDe(supabase, [
      { t: "estancias", i: d.estancia_id, datos: { id: d.estancia_id, estado: d.estado, updated_at: d.updated_at } },
      ...d.contratos_por_firmar.map((c) => ({ t: "contratos", i: c.id })),
    ]),
  };
}

// ── «Pedir lugar»: lo que falta nunca es una pared (docs/app-duenos/FASE-3.md) ───────────────────────────────────────
export type RevisionReserva = { faltan: RequisitoDueno[]; puedePedirLugar: boolean };

/** Qué falta para esta reserva o cita, ya en palabras del dueño. Sin faltantes, se reserva directo. */
// registro-final: solo lee; lo que simula en la base no queda guardado.
export async function revisarReservaApp(negocioId: string, mascotaId: string, servicioId: string, entrada: string | null, salida: string | null, horas: number | null, inicioIso: string | null): Promise<{ error: string | null; datos?: RevisionReserva }> {
  const falta = await negocioMio(negocioId);
  if (falta) return { error: falta };
  const v = await vinculoDe(mascotaId, negocioId);
  if (!v) return { error: "Esa mascota no tiene expediente en este negocio." };
  if (!UUID.test(servicioId)) return { error: "Escoge el servicio." };
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data, error } = await supabase.rpc("portal_requisitos_reserva", { p_perro: v.perroId, p_servicio: servicioId, p_entrada: entrada, p_salida: salida, p_horas: horas && horas > 0 ? Math.round(horas) : null, p_inicio: inicioIso ? new Date(inicioIso).toISOString() : null });
  if (error) return { error: rechazoDeLaBase(error) };
  const motivos = (data ?? []) as MotivoBase[];
  return { error: null, datos: { faltan: motivos.map(requisitoParaDueno), puedePedirLugar: motivos.length > 0 && motivos.every((m) => dejaSolicitud(m.clave)) } };
}

/** Deja la solicitud (sin cobrar ni ocupar cupo) y le avisa al negocio. La base vuelve a revisar qué falta. */
export async function pedirLugarApp(negocioId: string, mascotaId: string, servicioId: string, entrada: string | null, salida: string | null, horas: number | null, inicioIso: string | null, recoleccion?: RecoleccionApp | null): Promise<ResultadoApp> {
  const falta = await negocioMio(negocioId);
  if (falta) return { error: falta };
  const v = await vinculoDe(mascotaId, negocioId);
  if (!v) return { error: "Esa mascota no tiene expediente en este negocio." };
  if (!UUID.test(servicioId)) return { error: "Escoge el servicio." };
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data, error } = await supabase.rpc("portal_pedir_lugar", { p_perro: v.perroId, p_servicio: servicioId, p_entrada: entrada, p_salida: salida, p_horas: horas && horas > 0 ? Math.round(horas) : null, p_inicio: inicioIso ? new Date(inicioIso).toISOString() : null, p_recoleccion: recoleccion ?? null });
  if (error) return { error: rechazoDeLaBase(error) };
  const d = data as { id: string; estado: string; updated_at: string };
  avisarSolicitudAlNegocio({ negocioId, solicitudId: d.id });
  return { error: null, datos: d, registros: await registrosDe(supabase, [{ t: "solicitudes_reserva", i: d.id, datos: d }]) };
}

export async function cancelarSolicitudApp(negocioId: string, solicitudId: string): Promise<ResultadoApp> {
  const falta = await negocioMio(negocioId);
  if (falta) return { error: falta };
  if (!UUID.test(solicitudId)) return { error: "Solicitud inválida." };
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data, error } = await supabase.rpc("portal_cancelar_solicitud", { p_id: solicitudId });
  if (error) return { error: rechazoDeLaBase(error) };
  const d = data as { id: string; estado: string; updated_at: string };
  return { error: null, datos: d, registros: await registrosDe(supabase, [{ t: "solicitudes_reserva", i: d.id, datos: d }]) };
}

/** Deja listos los contratos que le faltan a esta mascota, para firmarlos antes de reservar. */
export async function prepararContratosApp(negocioId: string, mascotaId: string): Promise<{ error: string | null; datos?: { id: string; tipo_nombre: string }[]; registros?: RegistroFinal[] }> {
  const falta = await negocioMio(negocioId);
  if (falta) return { error: falta };
  const v = await vinculoDe(mascotaId, negocioId);
  if (!v) return { error: "Esa mascota no tiene expediente en este negocio." };
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data, error } = await supabase.rpc("portal_preparar_contratos", { p_perro: v.perroId });
  if (error) return { error: rechazoDeLaBase(error) };
  const lista = (data ?? []) as { id: string; tipo_nombre: string }[];
  return { error: null, datos: lista, registros: await registrosDe(supabase, lista.map((c) => ({ t: "contratos", i: c.id }))) };
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
  const s = await sesionApp();
  // El SALDO de la cuenta, nunca el total; un link vivo se reusa solo si cobra exactamente ese saldo (link-de-saldo.ts).
  return linkDeSaldo(supabase, negocioId, reservaId, s?.user.id ?? null);
}

// ── Reseña verificada ───────────────────────────────────────────────────────────────────────────────────────────
export async function resenarApp(negocioId: string, tipo: "estetica" | "estancia", id: string, estrellas: number, texto: string): Promise<ResultadoApp> {
  const falta = await negocioMio(negocioId);
  if (falta) return { error: falta };
  if (!UUID.test(id)) return { error: "Visita inválida." };
  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) return { error: "Califica de 1 a 5 estrellas." };
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data, error } = await supabase.rpc("portal_resenar", { p_tipo: tipo, p_id: id, p_estrellas: estrellas, p_texto: texto.trim().slice(0, 500) || null });
  if (error) return { error: rechazoDeLaBase(error) };
  const d = data as { id: string };
  return { error: null, datos: d, registros: await registrosDe(supabase, [{ t: "resenas", i: d.id }]) };
}
