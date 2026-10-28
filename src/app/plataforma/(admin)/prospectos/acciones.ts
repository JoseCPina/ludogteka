"use server";

import { revalidatePath } from "next/cache";
import { sesionPlataforma } from "@/lib/plataforma/sesion";
import type { ResultadoPlataforma } from "@/lib/plataforma/tipos";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { ConRegistros } from "@/lib/concurrencia/tipos";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { detallesLugar, PLACES_URL } from "@/lib/prospectos/places";
import { correrBusqueda, correrCalidad, correrLista } from "@/lib/prospectos/motor";
import { revisarWeb } from "@/lib/prospectos/web";
import { esCanal, esEtapa, esGiro } from "@/lib/prospectos/textos";
import { correrSincronizacionMeta } from "@/lib/meta-ads/motor";

// Todo con la sesión de la administración de PeluDesk: la RLS de las tablas vuelve a exigir
// es_admin_plataforma. Lo que habla con Google usa la llave de servicio, siempre después de comprobarla.
const NO_AUTORIZADO: ResultadoPlataforma = { error: "Tu sesión de administración de PeluDesk terminó. Vuelve a entrar." };

const texto = (fd: FormData, k: string, max = 300) => {
  const v = String(fd.get(k) ?? "").trim();
  return v ? v.slice(0, max) : null;
};
const placesUrl = () => (process.env.VERCEL_ENV !== "production" ? process.env.PLACES_API_URL?.trim() || PLACES_URL : PLACES_URL);
const llave = () => process.env.GOOGLE_PLACES_API_KEY?.trim() || null;

function refrescar(id?: string) {
  revalidatePath("/plataforma/prospectos");
  if (id) revalidatePath(`/plataforma/prospectos/${id}`);
}

const duplicado = (m: string) =>
  /prospectos_telefono_unico/.test(m)
    ? "Ya hay un prospecto con ese teléfono."
    : /prospectos_dominio_unico/.test(m)
      ? "Ya hay un prospecto con esa web."
      : /prospectos_nombre_ciudad_unico/.test(m)
        ? "Ya hay un prospecto con ese nombre en esa ciudad."
        : m;

export async function guardarAjustes(fd: FormData): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const ciudades = [...new Set(String(fd.get("ciudades") ?? "").split(/\n|,/).map((c) => c.trim()).filter(Boolean))];
  if (ciudades.length === 0 || ciudades.length > 40 || ciudades.some((c) => c.length > 80)) return { error: "Escribe de 1 a 40 ciudades, una por renglón." };
  const consultas: Record<string, string[]> = {};
  for (const g of ["guarderia", "hotel", "estetica", "veterinaria"]) {
    const l = [...new Set(String(fd.get(`consultas_${g}`) ?? "").split(/\n|,/).map((c) => c.trim()).filter(Boolean))].slice(0, 8);
    consultas[g] = l;
  }
  const tope = Number(fd.get("tope"));
  const paginas = Number(fd.get("paginas"));
  if (!Number.isInteger(tope) || tope < 0 || tope > 500) return { error: "El tope de búsquedas por día va de 0 a 500." };
  if (![1, 2, 3].includes(paginas)) return { error: "Las páginas por consulta van de 1 a 3." };
  const listaWa = Number(fd.get("lista_whatsapp"));
  const listaIg = Number(fd.get("lista_instagram"));
  const dias = Number(fd.get("dias_seguimiento"));
  const maxSeg = Number(fd.get("max_seguimientos"));
  const firma = texto(fd, "firma", 40);
  if (![listaWa, listaIg].every((n) => Number.isInteger(n) && n >= 0 && n <= 100)) return { error: "La lista del día va de 0 a 100 por canal." };
  if (!Number.isInteger(dias) || dias < 1 || dias > 30) return { error: "Los días para el seguimiento van de 1 a 30." };
  if (!Number.isInteger(maxSeg) || maxSeg < 0 || maxSeg > 5) return { error: "Los seguimientos van de 0 a 5." };
  if (!firma) return { error: "Escribe con qué nombre se firman los mensajes." };
  const whatsappVentas = String(fd.get("whatsapp_ventas") ?? "").replace(/\D/g, "");
  if (!/^52\d{10}$/.test(whatsappVentas)) return { error: "El WhatsApp de ventas va con 52 y los 10 dígitos (por ejemplo 524443103236)." };
  const { error } = await s.supabase
    .from("prospeccion_ajustes")
    .update({ ciudades, consultas, tope_busquedas_dia: tope, paginas_por_consulta: paginas, pausado: fd.get("pausado") === "si", lista_whatsapp: listaWa, lista_instagram: listaIg, dias_seguimiento: dias, max_seguimientos: maxSeg, firma, whatsapp_ventas: whatsappVentas })
    .eq("id", 1);
  if (error) return { error: error.message };
  refrescar();
  return { error: null, exito: "Guardado.", registros: await registrosDe(s.supabase, [{ t: "prospeccion_ajustes", i: "1" }]) };
}

export async function buscarAhora(fd: FormData): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  const apiKey = llave();
  if (!apiKey) return { error: "Falta la llave GOOGLE_PLACES_API_KEY en el servidor: no se puede buscar." };
  const ciudad = texto(fd, "ciudad", 80);
  const giro = texto(fd, "giro", 20);
  const tope = Number(fd.get("tope") ?? 5);
  if (!Number.isInteger(tope) || tope < 1 || tope > 60) return { error: "Las búsquedas de esta corrida van de 1 a 60." };
  if (giro && !esGiro(giro)) return { error: "Giro no válido." };
  const r = await correrBusqueda({ origen: "manual", tope, ciudades: ciudad ? [ciudad] : undefined, giros: giro && giro !== "mixto" ? [giro] : undefined, presupuestoMs: 180_000 });
  // Lo nuevo se clasifica y agrupa en la misma corrida.
  try {
    await correrCalidad(50_000, 200);
  } catch (e) {
    console.error("[prospectos] calidad", e instanceof Error ? e.message : e);
  }
  refrescar();
  if (r.estado === "fallida") return { error: r.error ?? "La búsqueda falló. Revisa el registro de corridas." };
  return { error: null, exito: `Listo: ${r.busquedas} búsquedas, ${r.nuevos} nuevos, ${r.duplicados} duplicados, ${r.clientes} ya son de PeluDesk, ${r.errores} errores.` };
}

export async function agregarProspecto(fd: FormData): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const nombre = texto(fd, "nombre", 200);
  const ciudad = texto(fd, "ciudad", 80);
  const giro = String(fd.get("giro") ?? "");
  if (!nombre || !ciudad || !esGiro(giro)) return { error: "Escribe nombre, ciudad y giro." };
  const { data, error } = await s.supabase
    .from("prospectos")
    .insert({ nombre, ciudad, giro, telefono: texto(fd, "telefono", 40), correo: texto(fd, "correo", 200), web: texto(fd, "web", 300), instagram: texto(fd, "instagram", 200), fuente: "manual" })
    .select("id")
    .single();
  if (error) return { error: duplicado(error.message) };
  // ¿Ya es negocio de PeluDesk? Lo decide la base con la llave de servicio.
  await createSupabaseAdminClient().rpc("prospectos_revisar_clientes");
  refrescar();
  return { error: null, exito: "Agregado.", ir: `/plataforma/prospectos/${data.id}`, registros: await registrosDe(s.supabase, [{ t: "prospectos", i: data.id }]) };
}

export async function cambiarEtapa(id: string, fd: FormData): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const etapa = String(fd.get("etapa") ?? "");
  const canal = String(fd.get("canal") ?? "");
  if (!esEtapa(etapa)) return { error: "Escoge una etapa." };
  if (canal && !esCanal(canal)) return { error: "Canal no válido." };
  const cambio: Record<string, unknown> = { etapa };
  if (canal) {
    cambio.canal_ultimo_contacto = canal;
    cambio.ultimo_contacto_at = new Date().toISOString();
  }
  const { error } = await s.supabase.from("prospectos").update(cambio).eq("id", id);
  if (error) return { error: error.message };
  const nota = texto(fd, "nota", 4000);
  if (nota) await s.supabase.from("prospectos_eventos").insert({ prospecto_id: id, tipo: "nota", texto: nota, canal: canal || null });
  refrescar(id);
  return { error: null, exito: "Etapa guardada.", registros: await registrosDe(s.supabase, [{ t: "prospectos", i: id }]) };
}

export async function cambiarEtapaA(id: string, etapa: string): Promise<ResultadoPlataforma> {
  const fd = new FormData();
  fd.set("etapa", etapa);
  return cambiarEtapa(id, fd);
}

export async function agregarNota(id: string, fd: FormData): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const nota = texto(fd, "nota", 4000);
  if (!nota) return { error: "Escribe la nota." };
  const { error } = await s.supabase.from("prospectos_eventos").insert({ prospecto_id: id, tipo: "nota", texto: nota });
  if (error) return { error: error.message };
  refrescar(id);
  return { error: null, exito: "Nota agregada.", registros: await registrosDe(s.supabase, [{ t: "prospectos", i: id }]) };
}

export async function guardarDatos(id: string, fd: FormData): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const nombre = texto(fd, "nombre", 200);
  const ciudad = texto(fd, "ciudad", 80);
  const giro = String(fd.get("giro") ?? "");
  if (!nombre || !ciudad || !esGiro(giro)) return { error: "Nombre, ciudad y giro son obligatorios." };
  const { error } = await s.supabase
    .from("prospectos")
    .update({
      nombre,
      ciudad,
      giro,
      direccion: texto(fd, "direccion", 300),
      telefono: texto(fd, "telefono", 40),
      whatsapp: texto(fd, "whatsapp", 40),
      correo: texto(fd, "correo", 200),
      instagram: texto(fd, "instagram", 200),
      facebook: texto(fd, "facebook", 300),
      web: texto(fd, "web", 300),
      notas: texto(fd, "notas", 4000),
    })
    .eq("id", id);
  if (error) return { error: duplicado(error.message) };
  await createSupabaseAdminClient().rpc("prospectos_revisar_clientes");
  refrescar(id);
  return { error: null, exito: "Datos guardados.", registros: await registrosDe(s.supabase, [{ t: "prospectos", i: id }]) };
}

export async function actualizarDesdeGoogle(id: string): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const apiKey = llave();
  if (!apiKey) return { error: "Falta la llave GOOGLE_PLACES_API_KEY en el servidor." };
  const { data: p } = await s.supabase.from("prospectos").select("id, google_place_id, telefono, web").eq("id", id).maybeSingle();
  if (!p?.google_place_id) return { error: "Este prospecto no viene de Google Maps." };
  try {
    const l = await detallesLugar({ apiKey, id: p.google_place_id, url: placesUrl() });
    if (!l) return { error: "Google ya no tiene este lugar." };
    const db = createSupabaseAdminClient();
    const { error } = await db
      .from("prospectos")
      .update({ calificacion: l.calificacion, resenas: l.resenas, direccion: l.direccion, telefono: p.telefono ?? l.telefono, web: p.web ?? l.web, web_revisada_at: p.web ? undefined : null })
      .eq("id", id);
    if (error) return { error: duplicado(error.message) };
    const web = p.web ?? l.web;
    if (web) await db.rpc("prospecto_completar_web", { p_id: id, p: await revisarWeb(web) });
    refrescar(id);
    return {
      error: null,
      exito: l.cerrado ? "Actualizado. Google lo marca como cerrado definitivamente." : "Actualizado desde Google.",
      registros: await registrosDe(s.supabase, [{ t: "prospectos", i: id }]),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo consultar a Google." };
  }
}

// ── Etapa 2: calidad, sucursales y «Contactar hoy» ────────────────────────────────────────────────────────────────

export async function revertirClasificacion(id: string): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const { data: p } = await s.supabase.from("prospectos").select("id, etapa, etapa_antes_descarte, giro_busqueda, descarte_tipo").eq("id", id).maybeSingle();
  if (!p) return { error: "Ese prospecto ya no existe." };
  const cambio: Record<string, unknown> = { clasificacion_revertida_at: new Date().toISOString() };
  if (p.etapa === "descartado") Object.assign(cambio, { etapa: p.etapa_antes_descarte ?? "nuevo", descarte_tipo: null, descarte_motivo: null, etapa_antes_descarte: null });
  else if (p.giro_busqueda) cambio.giro = p.giro_busqueda;
  const { error } = await s.supabase.from("prospectos").update(cambio).eq("id", id);
  if (error) return { error: error.message };
  await s.supabase.from("prospectos_eventos").insert({ prospecto_id: id, tipo: "clasificacion", texto: p.etapa === "descartado" ? "Se revirtió el descarte automático" : "Se revirtió el giro que puso la clasificación" });
  refrescar(id);
  return { error: null, exito: "Revertido. La clasificación automática ya no lo vuelve a tocar.", registros: await registrosDe(s.supabase, [{ t: "prospectos", i: id }]) };
}

export async function separarSucursal(id: string): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const { data: p } = await s.supabase.from("prospectos").select("principal_id").eq("id", id).maybeSingle();
  const { error } = await s.supabase.from("prospectos").update({ principal_id: null, no_agrupar: true }).eq("id", id);
  if (error) return { error: error.message };
  await s.supabase.from("prospectos_eventos").insert({ prospecto_id: id, tipo: "sucursal", texto: "Separado: es otro negocio, no una sucursal" });
  refrescar(id);
  if (p?.principal_id) revalidatePath(`/plataforma/prospectos/${p.principal_id}`);
  return {
    error: null,
    exito: "Separado. Ya no se agrupa como sucursal.",
    registros: await registrosDe(s.supabase, [{ t: "prospectos", i: id }, { t: "prospectos", i: p?.principal_id as string | null | undefined }]),
  };
}

export async function noLeInteresa(id: string): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const { data: p } = await s.supabase.from("prospectos").select("etapa").eq("id", id).maybeSingle();
  if (!p) return { error: "Ese prospecto ya no existe." };
  if (p.etapa === "descartado") return { error: null, exito: "Ya estaba descartado.", registros: await registrosDe(s.supabase, [{ t: "prospectos", i: id }]) };
  const { error } = await s.supabase.from("prospectos").update({ etapa_antes_descarte: p.etapa, etapa: "descartado", descarte_tipo: "no_le_interesa", descarte_motivo: "No le interesa" }).eq("id", id);
  if (error) return { error: error.message };
  refrescar(id);
  return { error: null, exito: "Descartado: no le interesa.", registros: await registrosDe(s.supabase, [{ t: "prospectos", i: id }]) };
}

/** Un renglón de «Contactar hoy»: se mandó, respondió o no le interesa. La base pasa al prospecto de etapa. */
export async function marcarContacto(contactoId: string, accion: "enviado" | "respondio" | "no_interesa"): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const { error } = await s.supabase.rpc("plataforma_prospecto_contacto", { p_contacto: contactoId, p_accion: accion });
  if (error) return { error: error.message };
  revalidatePath("/plataforma/prospectos/hoy");
  return {
    error: null,
    exito: accion === "enviado" ? "Marcado como contactado." : accion === "respondio" ? "Respondió." : "No le interesa.",
    registros: await registrosDe(s.supabase, [{ t: "prospectos_contactos", i: contactoId }]),
  };
}

export async function armarListaHoy(): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  try {
    const r = await correrLista();
    revalidatePath("/plataforma/prospectos/hoy");
    if (r.whatsapp + r.instagram === 0) return { error: null, exito: r.yaEstaba ? "La lista de hoy ya estaba completa." : "No hay prospectos que toque contactar hoy." };
    return { error: null, exito: `Lista armada: ${r.whatsapp} por WhatsApp y ${r.instagram} por Instagram (${r.seguimientos} seguimientos).` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo armar la lista." };
  }
}

// ── Audiencias de Meta ────────────────────────────────────────────────────────────────────────────────────────────

/** Pidió que no le llegue publicidad: sale de todas las audiencias de Meta en la siguiente sincronización. */
export async function bajaPublicidad(id: string, fd: FormData): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const motivo = texto(fd, "motivo") ?? "Pidió baja";
  const { error } = await s.supabase.from("prospectos").update({ publicidad_baja_at: new Date().toISOString(), publicidad_baja_motivo: motivo }).eq("id", id);
  if (error) return { error: error.message };
  await s.supabase.from("prospectos_eventos").insert({ prospecto_id: id, tipo: "nota", texto: `Baja de publicidad: ${motivo}` });
  refrescar(id);
  return { error: null, exito: "Listo: sale de las audiencias de Meta en la siguiente sincronización.", registros: await registrosDe(s.supabase, [{ t: "prospectos", i: id }]) };
}

export async function quitarBajaPublicidad(id: string): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const { error } = await s.supabase.from("prospectos").update({ publicidad_baja_at: null, publicidad_baja_motivo: null }).eq("id", id);
  if (error) return { error: error.message };
  await s.supabase.from("prospectos_eventos").insert({ prospecto_id: id, tipo: "nota", texto: "Vuelve a incluirse en publicidad" });
  refrescar(id);
  return { error: null, exito: "Vuelve a entrar a las audiencias en la siguiente sincronización.", registros: await registrosDe(s.supabase, [{ t: "prospectos", i: id }]) };
}

export async function sincronizarMetaAhora(): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  const r = await correrSincronizacionMeta("manual");
  refrescar();
  if (r.estado === "ocupada") return { error: "Ya hay una sincronización corriendo. Espera a que termine." };
  if (r.estado === "sin_credenciales") return { error: "Faltan META_ADS_TOKEN o META_AD_ACCOUNT_ID en el servidor." };
  if (r.estado === "fallida") return { error: `No se pudo sincronizar: ${r.errores[0] ?? "error desconocido"}` };
  const camp = r.campanas;
  const extra = camp ? ` Campaña: ${camp.creados.length} creados${camp.activados.length ? `, activado ${camp.activados.join(", ")}` : ""}${camp.errores.length ? `; ${camp.errores.length} con error (se ven abajo)` : ""}.` : "";
  return { error: null, exito: (r.estado === "ok" ? "Audiencias sincronizadas." : `Sincronizado con errores: ${r.errores.join(" · ")}`) + extra };
}
