import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { sesionApp } from "@/lib/app/sesion";
import { crearAviso } from "@/lib/app/avisos";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { configWhatsApp, ClienteWA, construirSoporte, graphBase, VERSION_GRAPH } from "@/lib/whatsapp/infra";
import { limpiarVariable } from "@/lib/recordatorios/plantillas";
import { telefonoDeCorreoSintetico } from "@/lib/auth/identidad";
import { urlApp } from "@/lib/negocio/host";
import plantilla from "@/lib/app/plantilla-alerta-calle.json";

/**
 * Fase 5 · Alertas (docs/app-duenos/FASE-5.md). Quien ve un perro o gato en la calle (perdido, herido, en peligro o
 * abandonado) sube su foto, una descripción y la ubicación precisa. La base guarda y limita (alerta_calle_*); aquí:
 *   · la foto pierde sus metadatos (sharp vuelve a codificarla sin EXIF ni GPS) antes de guardarse en un bucket privado;
 *   · al publicar se avisa a la gente de la app a 3 km (push + Avisos), a los negocios PeluDesk a 3 km (WhatsApp, solo
 *     con la plantilla aprobada) y a los dueños de mascotas perdidas que se parecen («puede ser tu mascota»);
 *   · los mensajes con quien la subió van por la app y, si la persona habló con el bot en las últimas 24 h, por WhatsApp,
 *     sin mostrar teléfonos.
 * Nunca se devuelve quién subió una alerta.
 */
export const BUCKET_ALERTAS = "alertas-calle";
const KM_AVISO = 3;
const PESO_MAXIMO = 8 * 1024 * 1024;
const TIPOS = ["perdido", "herido", "peligro", "abandonado"] as const;
const ESPECIES = ["perro", "gato", "otro"] as const;
const ESTADOS = ["sigue_ahi", "ya_no_esta", "rescatado", "reunido"] as const;
type Resultado<T = Record<string, unknown>> = { error: string | null } & Partial<T>;

const QUE: Record<string, (e: string) => string> = {
  perdido: (e) => `un ${e} que parece perdido`,
  herido: (e) => `un ${e} herido`,
  peligro: (e) => `un ${e} en peligro`,
  abandonado: (e) => `un ${e} abandonado`,
};
const especieTexto = (e: string) => (e === "gato" ? "gato" : e === "perro" ? "perro" : "animal");
export const queVieron = (tipo: string, especie: string) => (QUE[tipo] ?? QUE.perdido)(especieTexto(especie));
const distanciaTexto = (km: number) => (km < 1 ? `a ${Math.max(100, Math.round((km * 1000) / 100) * 100)} m` : `a ${km.toFixed(1)} km`);
const rechazo = (e: { message?: string } | null, porOmision: string) => (e?.message && !/permission|violates|syntax|function/i.test(e.message) ? e.message : porOmision);

/**
 * La carpeta de las fotos de una persona: una huella de su id (la misma que calcula la base en _alerta_carpeta), para que
 * la URL de la foto no diga quién subió la alerta.
 */
export const carpetaDe = (personaId: string) => createHash("sha256").update(`${personaId}:alertas-calle`).digest("hex").slice(0, 24);

/** La foto: se endereza, se reduce a 1600 px y se vuelve JPEG SIN metadatos (sharp no copia EXIF si no se le pide). */
async function guardarFoto(duenoId: string, archivo: FormDataEntryValue | null): Promise<{ path: string | null; error: string | null }> {
  if (!(archivo instanceof File) || archivo.size === 0) return { path: null, error: null };
  if (archivo.size > PESO_MAXIMO) return { path: null, error: "La foto pesa más de 8 MB. Toma otra." };
  if (!/^image\//.test(archivo.type || "image/jpeg")) return { path: null, error: "Eso no es una foto." };
  try {
    const limpia = await sharp(Buffer.from(await archivo.arrayBuffer())).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    const path = `${carpetaDe(duenoId)}/${randomUUID()}.jpg`;
    const { error } = await createSupabaseAdminClient().storage.from(BUCKET_ALERTAS).upload(path, limpia, { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error(error.message);
    return { path, error: null };
  } catch (e) {
    console.error("[alertas] foto", e instanceof Error ? e.message : e);
    return { path: null, error: "No pudimos guardar la foto. Intenta con otra." };
  }
}

async function firmar(paths: (string | null)[]): Promise<Map<string, string>> {
  const limpios = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const salida = new Map<string, string>();
  if (!limpios.length) return salida;
  const { data } = await createSupabaseAdminClient().storage.from(BUCKET_ALERTAS).createSignedUrls(limpios, 3600);
  for (const f of data ?? []) if (f.path && f.signedUrl) salida.set(f.path, f.signedUrl);
  return salida;
}

// ── Leer ──────────────────────────────────────────────────────────────────
type FilaAlerta = { id: string; tipo: string; especie: string; descripcion: string | null; color: string | null; tamano: string | null; foto_path: string | null; lat: number; lng: number; estado: string; created_at: string; ultima_actividad_at: string; actualizaciones: number; distancia_m: number; es_mia: boolean };

export async function alertasCerca(lat: number, lng: number, km = 10): Promise<Resultado<{ alertas: (Omit<FilaAlerta, "foto_path"> & { fotoUrl: string | null })[] }>> {
  if (!(await sesionApp())) return { error: "Tu sesión se cerró. Vuelve a entrar." };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: "No pudimos leer tu ubicación." };
  const supabase = await createSupabaseServerClient("portal");
  const { data, error } = await supabase.rpc("alertas_calle_cerca", { p_lat: lat, p_lng: lng, p_km: Math.min(Math.max(km, 1), 50) });
  if (error) return { error: "No pudimos leer las alertas. Intenta de nuevo." };
  const filas = (data ?? []) as FilaAlerta[];
  const urls = await firmar(filas.map((f) => f.foto_path));
  return { error: null, alertas: filas.map(({ foto_path, ...f }) => ({ ...f, fotoUrl: foto_path ? (urls.get(foto_path) ?? null) : null })) };
}

export async function detalleAlerta(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(await sesionApp())) return null;
  const supabase = await createSupabaseServerClient("portal");
  const { data, error } = await supabase.rpc("alerta_calle_detalle", { p_id: id });
  if (error || !data) return null;
  const d = data as { foto_path: string | null; actualizaciones: { foto_path: string | null }[] } & Record<string, unknown>;
  const urls = await firmar([d.foto_path, ...d.actualizaciones.map((u) => u.foto_path)]);
  return {
    error: null,
    alerta: {
      ...d,
      fotoUrl: d.foto_path ? (urls.get(d.foto_path) ?? null) : null,
      foto_path: undefined,
      actualizaciones: d.actualizaciones.map((u) => ({ ...u, fotoUrl: u.foto_path ? (urls.get(u.foto_path) ?? null) : null, foto_path: undefined })),
      url: `${urlApp()}/alertas/${id}`,
    },
  };
}

// ── Escribir ──────────────────────────────────────────────────────────────
export async function crearAlerta(form: FormData): Promise<Resultado<{ id: string; avisados: number; coincidencias: number }>> {
  const s = await sesionApp();
  if (!s) return { error: "Tu sesión se cerró. Vuelve a entrar." };
  const tipo = String(form.get("tipo") ?? "");
  const especie = String(form.get("especie") ?? "");
  const lat = Number(form.get("lat")), lng = Number(form.get("lng"));
  if (!TIPOS.includes(tipo as (typeof TIPOS)[number])) return { error: "Escoge qué le pasa." };
  if (!ESPECIES.includes(especie as (typeof ESPECIES)[number])) return { error: "Escoge si es perro o gato." };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { error: "Falta la ubicación: pon el pin donde lo viste." };
  if (!(form.get("foto") instanceof File)) return { error: "Tómale una foto: así lo reconocen." };
  const foto = await guardarFoto(s.user.id, form.get("foto"));
  if (foto.error || !foto.path) return { error: foto.error ?? "Tómale una foto: así lo reconocen." };
  const supabase = await createSupabaseServerClient("portal");
  const { data: id, error } = await supabase.rpc("alerta_calle_crear", {
    p_tipo: tipo, p_especie: especie, p_descripcion: String(form.get("descripcion") ?? "").slice(0, 500), p_color: String(form.get("color") ?? "").slice(0, 40),
    p_tamano: String(form.get("tamano") ?? ""), p_foto_path: foto.path, p_lat: lat, p_lng: lng, p_precision: Number(form.get("precision")) || null,
  });
  if (error || !id) {
    await createSupabaseAdminClient().storage.from(BUCKET_ALERTAS).remove([foto.path]);
    return { error: rechazo(error, "No pudimos publicar la alerta. Intenta de nuevo.") };
  }
  const r = await avisarAlerta(id as string);
  return { error: null, id: id as string, avisados: r.personas, coincidencias: r.coincidencias };
}

export async function actualizarAlerta(id: string, form: FormData): Promise<Resultado<{ actualizacionId: string }>> {
  const s = await sesionApp();
  if (!s) return { error: "Tu sesión se cerró. Vuelve a entrar." };
  const estado = String(form.get("estado") ?? "");
  if (estado && !ESTADOS.includes(estado as (typeof ESTADOS)[number])) return { error: "Ese estado no existe." };
  const foto = await guardarFoto(s.user.id, form.get("foto"));
  if (foto.error) return { error: foto.error };
  const texto = String(form.get("texto") ?? "").slice(0, 300);
  if (!texto.trim() && !foto.path && !estado) return { error: "Cuenta qué viste, sube una foto o cambia cómo está." };
  const supabase = await createSupabaseServerClient("portal");
  const { data, error } = await supabase.rpc("alerta_calle_actualizar", { p_id: id, p_texto: texto, p_foto_path: foto.path, p_estado: estado || null });
  if (error || !data) {
    if (foto.path) await createSupabaseAdminClient().storage.from(BUCKET_ALERTAS).remove([foto.path]);
    return { error: rechazo(error, "No pudimos guardar tu actualización.") };
  }
  // A quien la subió (si no fue él): alguien actualizó su alerta.
  const db = createSupabaseAdminClient();
  const { data: a } = await db.from("alertas_calle").select("autor_id, tipo, especie").eq("id", id).maybeSingle();
  if (a && a.autor_id !== s.user.id) {
    const titulo = estado === "rescatado" ? "Lo rescataron" : estado === "reunido" ? "Ya está con su familia" : "Hay novedades de tu alerta";
    await crearAviso({ duenoId: a.autor_id as string, tipo: "alerta", titulo, cuerpo: texto.trim() || `Alguien actualizó la alerta de ${queVieron(a.tipo as string, a.especie as string)}.`, url: `/alertas/${id}`, datos: { alerta_id: id } });
  }
  return { error: null, actualizacionId: data as string };
}

export async function reportarAlerta(id: string, motivo: string, texto: string): Promise<Resultado> {
  if (!(await sesionApp())) return { error: "Tu sesión se cerró. Vuelve a entrar." };
  if (!["falsa", "ofensiva", "repetida", "otro"].includes(motivo)) return { error: "Escoge por qué la reportas." };
  const supabase = await createSupabaseServerClient("portal");
  const { error } = await supabase.rpc("alerta_calle_reportar", { p_id: id, p_motivo: motivo, p_texto: (texto ?? "").slice(0, 300) });
  if (error) return { error: rechazo(error, "No pudimos mandar tu reporte.") };
  return { error: null };
}

export async function mensajeAlerta(id: string, texto: string, conversacion: number | null): Promise<Resultado<{ entregadoWhatsApp: boolean }>> {
  const s = await sesionApp();
  if (!s) return { error: "Tu sesión se cerró. Vuelve a entrar." };
  const limpio = (texto ?? "").trim().slice(0, 600);
  if (!limpio) return { error: "Escribe tu mensaje." };
  const supabase = await createSupabaseServerClient("portal");
  const { data, error } = await supabase.rpc("alerta_calle_mensaje", { p_id: id, p_texto: limpio, p_conversacion: conversacion ?? 1 });
  if (error || !data) return { error: rechazo(error, "No pudimos mandar tu mensaje.") };
  const db = createSupabaseAdminClient();
  const { data: m } = await db.from("alertas_calle_mensajes").select("id, para_id, alerta_id").eq("id", (data as { id: string }).id).maybeSingle();
  const { data: a } = await db.from("alertas_calle").select("autor_id, tipo, especie").eq("id", id).maybeSingle();
  if (!m || !a) return { error: null, entregadoWhatsApp: false };
  const paraAutor = m.para_id === a.autor_id;
  const titulo = paraAutor ? "Te escribieron por tu alerta" : "Te contestó quien subió la alerta";
  await crearAviso({ duenoId: m.para_id as string, tipo: "alerta", titulo, cuerpo: limpio, url: `/alertas/${id}`, datos: { alerta_id: id } });
  // Por WhatsApp solo si la persona habló con el bot en las últimas 24 horas (fuera de esa ventana, Meta pide plantilla).
  let entregadoWhatsApp = false;
  const { data: d } = await db.from("duenos").select("telefono").eq("id", m.para_id).maybeSingle();
  const tel = (d?.telefono as string | null) ?? null;
  if (tel) {
    try {
      const { datos, wa } = construirSoporte();
      if (await datos.ventanaAbierta(`52${tel}`)) {
        const r = await wa.texto(`52${tel}`, `${titulo} (${queVieron(a.tipo as string, a.especie as string)}): «${limpio}». Contesta desde la app PeluDesk: ${urlApp()}/alertas/${id}`);
        entregadoWhatsApp = r.ok;
      }
    } catch (e) {
      console.error("[alertas] whatsapp", e instanceof Error ? e.message : e);
    }
  }
  if (entregadoWhatsApp) await db.from("alertas_calle_mensajes").update({ entregado_at: new Date().toISOString() }).eq("id", m.id);
  return { error: null, entregadoWhatsApp };
}

// ── Avisar al publicar ──────────────────────────────────────────────────
let cachePlantilla: { ok: boolean; en: number } | null = null;
async function plantillaAprobada(): Promise<boolean> {
  if (process.env.VERCEL_ENV !== "production" && process.env.WHATSAPP_GRAPH_URL) return true;
  if (cachePlantilla && Date.now() - cachePlantilla.en < 10 * 60_000) return cachePlantilla.ok;
  const cfg = configWhatsApp();
  const waba = process.env.PELUDESK_WABA_ID ?? "";
  if (!cfg.token || !waba) return false;
  try {
    const r = await fetch(`${graphBase()}/${VERSION_GRAPH}/${waba}/message_templates?fields=name,status,category&name=${plantilla.nombre}`, { headers: { Authorization: `Bearer ${cfg.token}` }, signal: AbortSignal.timeout(10_000) });
    const j = (await r.json()) as { data?: { name: string; status: string; category: string }[] };
    const p = (j.data ?? []).find((x) => x.name === plantilla.nombre);
    cachePlantilla = { ok: p?.status === "APPROVED" && p.category === "UTILITY", en: Date.now() };
  } catch {
    cachePlantilla = { ok: false, en: Date.now() };
  }
  return cachePlantilla.ok;
}

export async function avisarAlerta(alertaId: string): Promise<{ personas: number; negocios: number; coincidencias: number }> {
  const db = createSupabaseAdminClient();
  const { data: a } = await db.from("alertas_calle").select("id, autor_id, tipo, especie, descripcion, lat, lng").eq("id", alertaId).maybeSingle();
  const r = { personas: 0, negocios: 0, coincidencias: 0 };
  if (!a) return r;
  const que = queVieron(a.tipo as string, a.especie as string);
  const url = `/alertas/${a.id}`;

  // «Puede ser tu mascota»: primero, para que ese dueño reciba el aviso especial y no el general.
  const { data: parecidas } = await db.rpc("alerta_calle_coincidencias", { p_alerta: a.id });
  const yaAvisados = new Set<string>();
  for (const m of ((parecidas ?? []) as { mascota_id: string; dueno_id: string; nombre: string; distancia_km: number; puntaje: number }[]).slice(0, 10)) {
    const { error } = await db.from("alertas_calle_coincidencias").insert({ alerta_id: a.id, mascota_id: m.mascota_id, puntaje: Math.round(m.puntaje * 100) / 100, distancia_km: Math.round(m.distancia_km * 100) / 100, avisado_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (error) continue; // ya se le avisó por esta alerta
    yaAvisados.add(m.dueno_id);
    r.coincidencias += 1;
    await crearAviso({ duenoId: m.dueno_id, tipo: "alerta", titulo: `¿Puede ser ${m.nombre}?`, cuerpo: `Alguien vio ${que} ${distanciaTexto(m.distancia_km)} de donde se perdió ${m.nombre}. Mira la foto.`, url, mascotaId: m.mascota_id, datos: { alerta_id: a.id, coincidencia: true } });
  }

  // La gente de la app a 3 km (su zona guardada).
  const { data: cerca } = await db.rpc("app_duenos_cerca", { p_lat: a.lat, p_lng: a.lng, p_km: KM_AVISO, p_excluir: a.autor_id });
  for (const d of ((cerca ?? []) as { dueno_id: string; distancia_km: number }[]).slice(0, 500)) {
    if (yaAvisados.has(d.dueno_id)) continue;
    await crearAviso({ duenoId: d.dueno_id, tipo: "alerta", titulo: `Vieron ${que} cerca de ti`, cuerpo: `${distanciaTexto(d.distancia_km)[0].toUpperCase()}${distanciaTexto(d.distancia_km).slice(1)}.${a.descripcion ? ` ${String(a.descripcion).slice(0, 120)}` : ""} Si puedes ayudar, mira la alerta.`, url, datos: { alerta_id: a.id } });
    r.personas += 1;
  }

  // Los negocios PeluDesk a 3 km, por WhatsApp a sus admins (solo con la plantilla aprobada).
  const { data: negocios } = await db.rpc("app_negocios_cerca", { p_lat: a.lat, p_lng: a.lng, p_km: KM_AVISO });
  const lista = (negocios ?? []) as { negocio_id: string; nombre: string; distancia_km: number }[];
  const cfg = configWhatsApp();
  if (lista.length && cfg.token && cfg.phoneNumberId && (await plantillaAprobada())) {
    const wa = new ClienteWA(cfg.token, cfg.phoneNumberId);
    for (const n of lista.slice(0, 20)) {
      const { data: admins } = await db.from("membresias").select("profile_id").eq("negocio_id", n.negocio_id).eq("rol", "admin").is("deleted_at", null).limit(3);
      let avisado = false;
      for (const ad of (admins ?? []) as { profile_id: string }[]) {
        const { data: u } = await db.auth.admin.getUserById(ad.profile_id);
        const tel = telefonoDeCorreoSintetico(u?.user?.email);
        if (!tel) continue;
        const res = await wa.plantillaConParametros(`52${tel}`, plantilla.nombre, [limpiarVariable(n.nombre), limpiarVariable(que), limpiarVariable(distanciaTexto(n.distancia_km)), `${urlApp()}${url}`], [], { origen: "bot", negocioId: n.negocio_id, refId: a.id, etiqueta: "alerta de la calle" });
        avisado ||= res.ok;
      }
      if (avisado) r.negocios += 1;
    }
  }
  await db.from("alertas_calle").update({ avisados: r.personas + r.coincidencias }).eq("id", a.id);
  return r;
}

export async function caducarAlertas(): Promise<number> {
  const { data, error } = await createSupabaseAdminClient().rpc("alertas_calle_caducar");
  if (error) console.error("[alertas] caducar", error.message);
  return Number(data ?? 0);
}
