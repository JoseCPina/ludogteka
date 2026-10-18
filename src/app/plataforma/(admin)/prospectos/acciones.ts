"use server";

import { revalidatePath } from "next/cache";
import { sesionPlataforma } from "@/lib/plataforma/sesion";
import type { ResultadoPlataforma } from "@/lib/plataforma/tipos";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { correrProspeccion } from "@/lib/prospectos/correr";
import { buscarTexto, detallesLugar, PLACES_URL } from "@/lib/prospectos/places";
import { revisarWeb } from "@/lib/prospectos/web";
import { esCanal, esEtapa, esGiro } from "@/lib/prospectos/textos";

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

export async function guardarAjustes(fd: FormData): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
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
  const { error } = await s.supabase
    .from("prospeccion_ajustes")
    .update({ ciudades, consultas, tope_busquedas_dia: tope, paginas_por_consulta: paginas, pausado: fd.get("pausado") === "si" })
    .eq("id", 1);
  if (error) return { error: error.message };
  refrescar();
  return { error: null, exito: "Guardado." };
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
  const url = placesUrl();
  const r = await correrProspeccion({
    db: createSupabaseAdminClient(),
    apiKey,
    buscar: (consulta, pageToken) => buscarTexto({ apiKey, consulta, pageToken, url }),
    revisarWeb: (w) => revisarWeb(w),
    origen: "manual",
    tope,
    ciudades: ciudad ? [ciudad] : undefined,
    giros: giro && giro !== "mixto" ? [giro] : undefined,
    presupuestoMs: 240_000,
  });
  refrescar();
  if (r.estado === "fallida") return { error: r.error ?? "La búsqueda falló. Revisa el registro de corridas." };
  return { error: null, exito: `Listo: ${r.busquedas} búsquedas, ${r.nuevos} nuevos, ${r.duplicados} duplicados, ${r.clientes} ya son de PeluDesk, ${r.errores} errores.` };
}

export async function agregarProspecto(fd: FormData): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
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
  return { error: null, exito: "Agregado.", ir: `/plataforma/prospectos/${data.id}` };
}

export async function cambiarEtapa(id: string, fd: FormData): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
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
  return { error: null, exito: "Etapa guardada." };
}

export async function agregarNota(id: string, fd: FormData): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  const nota = texto(fd, "nota", 4000);
  if (!nota) return { error: "Escribe la nota." };
  const { error } = await s.supabase.from("prospectos_eventos").insert({ prospecto_id: id, tipo: "nota", texto: nota });
  if (error) return { error: error.message };
  refrescar(id);
  return { error: null, exito: "Nota agregada." };
}

export async function guardarDatos(id: string, fd: FormData): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
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
  return { error: null, exito: "Datos guardados." };
}

export async function actualizarDesdeGoogle(id: string): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
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
    return { error: null, exito: l.cerrado ? "Actualizado. Google lo marca como cerrado definitivamente." : "Actualizado desde Google." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo consultar a Google." };
  }
}
