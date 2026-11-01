import { createHash, randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizarTelefono } from "@/lib/telefono";
import { BUCKET_APP } from "./fotos";
import { enviarPush } from "./push";
import { crearAviso } from "./avisos";
import { programarRecordatorios } from "./cartilla";
import { fechaLarga, hoyMx } from "./cartilla-util";
import type { EstadoReclamo } from "@/lib/directorio/reclamo";

/**
 * App para dueños · Fase 2 (docs/app-duenos/FASE-2.md): una veterinaria, estética u hotel que NO usa PeluDesk escanea
 * el QR de la mascota y registra una atención sin cuenta ni app. El negocio queda como «negocio por reclamar» (un
 * prospecto: el mismo si ya existía por WhatsApp o por nombre y ubicación), lo registrado entra a la cartilla del dueño
 * al instante (push y Avisos) y el recordatorio de la siguiente dosis o cita sale firmado por ese negocio.
 *
 * Reglas que no se rompen aquí:
 *   · al negocio que escanea nunca le llega un dato del dueño: solo nombre, especie y raza de la mascota y su cartilla;
 *   · límites por WhatsApp del negocio, por mascota y por IP, al día;
 *   · el registro lo edita solo quien lo hizo (token de edición en su teléfono) y solo en las primeras 24 h; cada
 *     edición guarda la versión anterior; el dueño lo puede ocultar, nunca borrar.
 */
export type Giro = "veterinaria" | "estetica" | "hotel";
export type AplicacionVet = { tipo: "vacuna" | "desparasitacion"; nombre: string; subtipo?: "interna" | "externa" | "ambas" | null; lote?: string | null; proxima_dosis?: string | null };
export type DatosAtencion =
  | { giro: "veterinaria"; aplicaciones: AplicacionVet[] }
  | { giro: "estetica"; servicio: string; proxima_cita?: string | null }
  | { giro: "hotel"; entrada: string; salida: string };
export type EntradaAtencion = {
  token: string;
  escaneoId: string | null;
  datos: DatosAtencion;
  fecha: string;
  pesoKg: number | null;
  nota: string | null;
  negocioNombre: string;
  negocioWhatsapp: string;
  firma: string; // data:image/png;base64,…
  lat?: number | null;
  lng?: number | null;
  ip: string | null;
};

/** Lo que manda el formulario del negocio (/m/<token>/registrar). */
export type CamposAtencion = { datos: DatosAtencion; fecha: string; pesoKg: number | null; nota: string | null; negocioNombre: string; negocioWhatsapp: string; firma: string | null; lat?: number | null; lng?: number | null };
/** El reclamo de la cuenta desde el QR, con el link al registro cuando ya está verificado. */
export type ReclamoQR = EstadoReclamo & { registroUrl: string | null };

export const LIMITES = { porWhatsappAlDia: 30, porMascotaAlDia: 6, porIpAlDia: 40 } as const;
export const HORAS_EDICION = 24;
/** A partir de cuántas atenciones de un mismo negocio se le ofrece abrir su cuenta. */
export const OFERTA_A_LA = 3;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const huella = (texto: string) => createHash("sha256").update(texto).digest("hex");
const huellaIp = (ip: string | null) => (ip ? huella(`${ip}|${hoyMx()}`).slice(0, 32) : null);
const limpiar = (s: string | null | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Lo que el negocio que escanea puede ver: la mascota (nombre, especie, raza) y su cartilla. Nada del dueño. */
export type MascotaParaNegocio = { id: string; token: string; nombre: string; especie: string; especieDetalle: string | null; razaTexto: string | null; cartilla: { tipo: string; nombre: string; fecha: string | null; proxima: string | null }[] };

export async function mascotaParaNegocio(token: string): Promise<MascotaParaNegocio | null> {
  if (!/^[A-Za-z0-9]{10}$/.test(token)) return null;
  const db = createSupabaseAdminClient();
  const { data: m } = await db.from("mascotas").select("id, nombre, especie, especie_detalle, raza_texto, token_publico, fallecido").eq("token_publico", token.toUpperCase()).is("deleted_at", null).maybeSingle();
  if (!m || m.fallecido) return null;
  const { data: c } = await db.from("mascotas_cartilla").select("tipo, nombre, fecha_aplicacion, proxima_dosis").eq("mascota_id", m.id).is("deleted_at", null).order("fecha_aplicacion", { ascending: false }).limit(30);
  return {
    id: m.id, token: m.token_publico, nombre: m.nombre, especie: m.especie, especieDetalle: m.especie_detalle, razaTexto: m.raza_texto,
    cartilla: ((c ?? []) as { tipo: string; nombre: string; fecha_aplicacion: string | null; proxima_dosis: string | null }[]).map((r) => ({ tipo: r.tipo, nombre: r.nombre, fecha: r.fecha_aplicacion, proxima: r.proxima_dosis })),
  };
}

/** Abrir el formulario es un escaneo (métrica). El mismo teléfono (IP) en la misma mascota en 30 minutos es uno solo. */
export async function registrarEscaneo(mascotaId: string, ip: string | null): Promise<string | null> {
  const db = createSupabaseAdminClient();
  const ipHash = huellaIp(ip);
  if (ipHash) {
    const { data: previo } = await db.from("app_qr_escaneos").select("id").eq("mascota_id", mascotaId).eq("ip_hash", ipHash).gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (previo) return previo.id as string;
  }
  const { data, error } = await db.from("app_qr_escaneos").insert({ mascota_id: mascotaId, ip_hash: ipHash, created_by: null, updated_at: new Date().toISOString() }).select("id").maybeSingle();
  if (error) console.error("[app qr] escaneo", error.message);
  return (data?.id as string | undefined) ?? null;
}

function validar(e: Omit<EntradaAtencion, "token" | "escaneoId" | "ip" | "firma">): string | null {
  if (limpiar(e.negocioNombre, 80).length < 2) return "Escribe el nombre de tu negocio.";
  if (!normalizarTelefono(e.negocioWhatsapp)) return "Escribe el WhatsApp de tu negocio a diez dígitos: ahí le llega al dueño para agendar.";
  if (!FECHA.test(e.fecha) || e.fecha > hoyMx()) return "La fecha de la atención no puede ser futura.";
  if (e.pesoKg != null && !(e.pesoKg > 0 && e.pesoKg < 200)) return "El peso va en kilos (por ejemplo, 8.4).";
  if (e.nota && e.nota.length > 280) return "La nota es de hasta 280 letras.";
  const d = e.datos;
  if (d.giro === "veterinaria") {
    if (!d.aplicaciones.length && e.pesoKg == null && !e.nota) return "Registra una vacuna o desparasitación, el peso o una nota.";
    for (const a of d.aplicaciones) {
      if (!["vacuna", "desparasitacion"].includes(a.tipo) || limpiar(a.nombre, 80).length < 2) return "Cada vacuna o desparasitación lleva su nombre.";
      if (a.proxima_dosis && (!FECHA.test(a.proxima_dosis) || a.proxima_dosis <= e.fecha)) return "La próxima dosis va después de la fecha de hoy.";
    }
  } else if (d.giro === "estetica") {
    if (limpiar(d.servicio, 80).length < 2) return "Escribe qué servicio le hicieron (baño, corte…).";
    if (d.proxima_cita && (!FECHA.test(d.proxima_cita) || d.proxima_cita <= e.fecha)) return "La próxima cita va después de la fecha de hoy.";
  } else if (d.giro === "hotel") {
    if (!FECHA.test(d.entrada) || !FECHA.test(d.salida) || d.salida < d.entrada) return "La salida va el mismo día o después de la entrada.";
  } else return "Escoge si eres veterinaria, estética u hotel.";
  return null;
}

/** Normaliza lo que se guarda en `datos` (sin campos de más). */
function datosLimpios(d: DatosAtencion): Record<string, unknown> {
  if (d.giro === "veterinaria") return { aplicaciones: d.aplicaciones.map((a) => ({ tipo: a.tipo, nombre: limpiar(a.nombre, 80), subtipo: a.tipo === "desparasitacion" ? (a.subtipo ?? null) : null, lote: limpiar(a.lote, 40) || null, proxima_dosis: a.proxima_dosis || null })) };
  if (d.giro === "estetica") return { servicio: limpiar(d.servicio, 80), proxima_cita: d.proxima_cita || null };
  return { entrada: d.entrada, salida: d.salida };
}

/**
 * El «negocio por reclamar»: el prospecto con ese WhatsApp (o teléfono); si no, el del mismo nombre a menos de 300 m;
 * si no, uno nuevo con fuente 'qr'. Nunca se cambia el nombre de un prospecto que ya existía.
 */
async function prospectoDe(o: { nombre: string; whatsapp: string; giro: Giro; lat: number | null; lng: number | null; ciudad: string | null }): Promise<{ id: string; slug: string } | null> {
  const db = createSupabaseAdminClient();
  const { data: porTel } = await db.from("prospectos").select("id, slug").or(`telefono_norm.eq.${o.whatsapp},whatsapp.eq.${o.whatsapp},whatsapp_bot.eq.${o.whatsapp}`).is("deleted_at", null).order("created_at").limit(1).maybeSingle();
  if (porTel) return porTel as { id: string; slug: string };
  if (o.lat != null && o.lng != null) {
    const { data: norm } = await db.rpc("prospecto_texto_norm", { p: o.nombre });
    if (norm) {
      const { data: mismos } = await db.from("prospectos").select("id, slug, lat, lng").eq("nombre_norm", norm as string).is("deleted_at", null).not("lat", "is", null).limit(20);
      const cerca = ((mismos ?? []) as { id: string; slug: string; lat: number; lng: number }[]).find((p) => distanciaM(o.lat!, o.lng!, p.lat, p.lng) < 300);
      if (cerca) return { id: cerca.id, slug: cerca.slug };
    }
  }
  const giroProspecto = o.giro === "veterinaria" ? "veterinaria" : o.giro === "estetica" ? "estetica" : "hotel";
  const { data: nuevo, error } = await db.from("prospectos").insert({ nombre: o.nombre, giro: giroProspecto, ciudad: o.ciudad || "Por confirmar", telefono: o.whatsapp, whatsapp: o.whatsapp, fuente: "qr", etapa: "nuevo", lat: o.lat, lng: o.lng, notas: "Llegó registrando una atención con el QR de la placa de una mascota (app para dueños).", updated_at: new Date().toISOString(), created_by: null }).select("id, slug").maybeSingle();
  if (error || !nuevo) {
    console.error("[app qr] prospecto", error?.message);
    return null;
  }
  await db.from("prospectos_eventos").insert({ prospecto_id: nuevo.id, tipo: "nota", texto: "Registró su primera atención con el QR de PeluDesk." }).then(({ error: e }) => e && console.error("[app qr] evento", e.message));
  return nuevo as { id: string; slug: string };
}

function distanciaM(a1: number, o1: number, a2: number, o2: number): number {
  const r = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(rad(a2 - a1) / 2) ** 2 + Math.cos(rad(a1)) * Math.cos(rad(a2)) * Math.sin(rad(o2 - o1) / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

async function subirFirma(mascotaId: string, atencionId: string, firma: string): Promise<string | null> {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(firma);
  if (!m) return null;
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length < 200 || bytes.length > 300_000) return null;
  const path = `atenciones/${mascotaId}/${atencionId}-${Date.now()}.png`;
  const { error } = await createSupabaseAdminClient().storage.from(BUCKET_APP).upload(path, bytes, { upsert: false, contentType: "image/png" });
  if (error) {
    console.error("[app qr] firma", error.message);
    return null;
  }
  return path;
}

/** Escribe en la cartilla y en los pesos lo que trae la atención (y quita lo que escribió una versión anterior). */
async function aplicarAlExpediente(atencion: { id: string; mascota_id: string; giro: Giro; datos: Record<string, unknown>; fecha: string; peso_kg: number | null }): Promise<void> {
  const db = createSupabaseAdminClient();
  const ahora = new Date().toISOString();
  await db.from("mascotas_cartilla").update({ deleted_at: ahora }).eq("atencion_id", atencion.id).is("deleted_at", null);
  await db.from("mascotas_pesos").update({ deleted_at: ahora }).eq("atencion_id", atencion.id).is("deleted_at", null);
  if (atencion.giro === "veterinaria") {
    const apps = (atencion.datos.aplicaciones as AplicacionVet[] | undefined) ?? [];
    if (apps.length) {
      const { error } = await db.from("mascotas_cartilla").insert(apps.map((a) => ({ mascota_id: atencion.mascota_id, tipo: a.tipo, nombre: a.nombre, subtipo: a.subtipo ?? null, lote: a.lote ?? null, fecha_aplicacion: atencion.fecha, proxima_dosis: a.proxima_dosis ?? null, fuente: "qr", atencion_id: atencion.id, created_by: null, updated_at: ahora })));
      if (error) throw new Error(`cartilla: ${error.message}`);
    }
  }
  if (atencion.peso_kg != null) {
    const { error } = await db.from("mascotas_pesos").insert({ mascota_id: atencion.mascota_id, peso_kg: atencion.peso_kg, fecha: atencion.fecha, notas: null, atencion_id: atencion.id, created_by: null, updated_at: ahora });
    if (error) throw new Error(`peso: ${error.message}`);
  }
  await programarRecordatorios(atencion.mascota_id);
}

function resumenAtencion(giro: Giro, datos: Record<string, unknown>, pesoKg: number | null): string {
  const partes: string[] = [];
  if (giro === "veterinaria") for (const a of (datos.aplicaciones as AplicacionVet[] | undefined) ?? []) partes.push(`${a.tipo === "vacuna" ? "vacuna" : "desparasitación"} ${a.nombre}${a.proxima_dosis ? ` (próxima: ${fechaLarga(a.proxima_dosis)})` : ""}`);
  if (giro === "estetica") partes.push(`${datos.servicio}${datos.proxima_cita ? ` (próxima cita sugerida: ${fechaLarga(String(datos.proxima_cita))})` : ""}`);
  if (giro === "hotel") partes.push(`estancia del ${fechaLarga(String(datos.entrada))} al ${fechaLarga(String(datos.salida))}`);
  if (pesoKg != null) partes.push(`peso ${pesoKg} kg`);
  return partes.join(", ") || "una nota";
}

export type ResultadoAtencion = {
  error: string | null;
  atencionId?: string;
  tokenEdicion?: string;
  editableHasta?: string;
  /** Cuántas atenciones lleva ese negocio y si ya se le ofrece abrir su cuenta (a la 3.ª, si no está reclamado). */
  total?: number;
  ofrecerCuenta?: boolean;
  prospectoId?: string;
};

export async function registrarAtencion(e: EntradaAtencion): Promise<ResultadoAtencion> {
  const invalido = validar(e);
  if (invalido) return { error: invalido };
  const whatsapp = normalizarTelefono(e.negocioWhatsapp)!;
  const db = createSupabaseAdminClient();
  const { data: m } = await db.from("mascotas").select("id, dueno_id, nombre, fallecido").eq("token_publico", e.token.toUpperCase()).is("deleted_at", null).maybeSingle();
  if (!m || m.fallecido) return { error: "No encontramos esa mascota. Revisa el QR de su placa." };
  // Límites al día.
  const desde = new Date(Date.now() - 86_400_000).toISOString();
  const ipHash = huellaIp(e.ip);
  const [porTel, porMascota, porIp] = await Promise.all([
    db.from("app_atenciones").select("id", { count: "exact", head: true }).eq("negocio_whatsapp", whatsapp).gte("created_at", desde),
    db.from("app_atenciones").select("id", { count: "exact", head: true }).eq("mascota_id", m.id).gte("created_at", desde),
    ipHash ? db.from("app_atenciones").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", desde) : Promise.resolve({ count: 0 }),
  ]);
  if ((porTel.count ?? 0) >= LIMITES.porWhatsappAlDia || (porIp.count ?? 0) >= LIMITES.porIpAlDia) return { error: "Ya registraste muchas atenciones hoy desde este número. Si atiendes a más pacientes, abre tu cuenta gratis de PeluDesk." };
  if ((porMascota.count ?? 0) >= LIMITES.porMascotaAlDia) return { error: `${m.nombre} ya tiene varias atenciones registradas hoy. Si hace falta corregir una, edítala desde el teléfono con el que la registraste.` };

  const { data: dueno } = await db.from("duenos").select("ciudad").eq("id", m.dueno_id).maybeSingle();
  const prospecto = await prospectoDe({ nombre: limpiar(e.negocioNombre, 80), whatsapp, giro: e.datos.giro, lat: e.lat ?? null, lng: e.lng ?? null, ciudad: (dueno?.ciudad as string | null) ?? null });
  if (!prospecto) return { error: "No pudimos guardar el registro. Intenta de nuevo." };

  const id = crypto.randomUUID();
  const firmaPath = await subirFirma(m.id, id, e.firma);
  if (!firmaPath) return { error: "Falta la firma: fírmalo con el dedo en el recuadro." };
  const tokenEdicion = randomBytes(24).toString("base64url");
  const editableHasta = new Date(Date.now() + HORAS_EDICION * 3_600_000).toISOString();
  const datos = datosLimpios(e.datos);
  const fila = {
    id, mascota_id: m.id, prospecto_id: prospecto.id, escaneo_id: e.escaneoId, giro: e.datos.giro, negocio_nombre: limpiar(e.negocioNombre, 80), negocio_whatsapp: whatsapp,
    datos, fecha: e.fecha, peso_kg: e.pesoKg, nota: limpiar(e.nota, 280) || null, firma_path: firmaPath, editor_hash: huella(tokenEdicion), ip_hash: ipHash,
    editable_hasta: editableHasta, created_by: null, updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("app_atenciones").insert(fila);
  if (error) {
    console.error("[app qr] atención", error.message);
    return { error: "No pudimos guardar el registro. Intenta de nuevo." };
  }
  if (e.escaneoId) await db.from("app_qr_escaneos").update({ prospecto_id: prospecto.id, giro: e.datos.giro }).eq("id", e.escaneoId).eq("mascota_id", m.id);
  try {
    await aplicarAlExpediente({ id, mascota_id: m.id, giro: e.datos.giro, datos, fecha: e.fecha, peso_kg: e.pesoKg });
  } catch (err) {
    console.error("[app qr] expediente", err instanceof Error ? err.message : err);
  }
  // Al dueño, al instante.
  const titulo = `${fila.negocio_nombre} registró una atención de ${m.nombre}`;
  const cuerpo = `${resumenAtencion(e.datos.giro, datos, e.pesoKg)}. Ya está en su cartilla.`;
  await enviarPush(m.dueno_id, { titulo: titulo.slice(0, 120), cuerpo: cuerpo.slice(0, 160), url: `/mascotas/${m.id}`, etiqueta: `atencion-${id}` });
  await crearAviso({ duenoId: m.dueno_id, tipo: "registro", titulo: titulo.slice(0, 120), cuerpo: cuerpo.slice(0, 600), url: `/mascotas/${m.id}`, mascotaId: m.id, push: false, datos: { atencion_id: id, giro: e.datos.giro } });

  const { total, ofrecer } = await ofertaPara(prospecto.id);
  return { error: null, atencionId: id, tokenEdicion, editableHasta, total, ofrecerCuenta: ofrecer, prospectoId: prospecto.id };
}

/** Cuántas atenciones lleva el negocio y si se le ofrece su cuenta (desde la 3.ª, mientras no la haya abierto). */
export async function ofertaPara(prospectoId: string): Promise<{ total: number; ofrecer: boolean }> {
  const db = createSupabaseAdminClient();
  const [{ count }, { data: p }] = await Promise.all([
    db.from("app_atenciones").select("id", { count: "exact", head: true }).eq("prospecto_id", prospectoId).is("deleted_at", null),
    db.from("prospectos").select("negocio_cliente_id").eq("id", prospectoId).maybeSingle(),
  ]);
  const total = count ?? 0;
  return { total, ofrecer: total >= OFERTA_A_LA && !p?.negocio_cliente_id };
}

/** Lo que el negocio necesita para editar (solo con su token y dentro de las 24 h). */
export async function atencionParaEditar(id: string, token: string): Promise<{ error: string | null; atencion?: { id: string; giro: Giro; datos: Record<string, unknown>; fecha: string; pesoKg: number | null; nota: string | null; negocioNombre: string; negocioWhatsapp: string; editableHasta: string } }> {
  const a = await atencionConToken(id, token);
  if ("error" in a) return { error: a.error };
  return { error: null, atencion: { id: a.id, giro: a.giro, datos: a.datos, fecha: a.fecha, pesoKg: a.peso_kg, nota: a.nota, negocioNombre: a.negocio_nombre, negocioWhatsapp: a.negocio_whatsapp, editableHasta: a.editable_hasta } };
}

type FilaAtencion = { id: string; mascota_id: string; prospecto_id: string; giro: Giro; datos: Record<string, unknown>; fecha: string; peso_kg: number | null; nota: string | null; negocio_nombre: string; negocio_whatsapp: string; editable_hasta: string; editor_hash: string; historial: unknown[]; firma_path: string };

async function atencionConToken(id: string, token: string): Promise<FilaAtencion | { error: string }> {
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { error: "Ese registro no se puede editar desde aquí." };
  const { data } = await createSupabaseAdminClient().from("app_atenciones").select("id, mascota_id, prospecto_id, giro, datos, fecha, peso_kg, nota, negocio_nombre, negocio_whatsapp, editable_hasta, editor_hash, historial, firma_path").eq("id", id).is("deleted_at", null).maybeSingle();
  const a = data as FilaAtencion | null;
  if (!a || a.editor_hash !== huella(token)) return { error: "Ese registro solo lo puede editar el teléfono con el que se hizo." };
  if (new Date(a.editable_hasta).getTime() < Date.now()) return { error: `Ya pasaron ${HORAS_EDICION} horas: el registro ya no se puede editar. Si hay un error, registra uno nuevo con lo correcto.` };
  return a;
}

export async function editarAtencion(id: string, token: string, e: Omit<EntradaAtencion, "token" | "escaneoId" | "ip" | "firma" | "lat" | "lng"> & { firma?: string | null }): Promise<{ error: string | null }> {
  const a = await atencionConToken(id, token);
  if ("error" in a) return { error: a.error };
  if (e.datos.giro !== a.giro) return { error: "No se puede cambiar el tipo de negocio de un registro." };
  const invalido = validar(e);
  if (invalido) return { error: invalido };
  const db = createSupabaseAdminClient();
  const datos = datosLimpios(e.datos);
  const anterior = { datos: a.datos, fecha: a.fecha, peso_kg: a.peso_kg, nota: a.nota, negocio_nombre: a.negocio_nombre, negocio_whatsapp: a.negocio_whatsapp, firma_path: a.firma_path, hasta: new Date().toISOString() };
  const firmaPath = e.firma ? await subirFirma(a.mascota_id, a.id, e.firma) : a.firma_path;
  const { error } = await db.from("app_atenciones").update({ datos, fecha: e.fecha, peso_kg: e.pesoKg, nota: limpiar(e.nota, 280) || null, negocio_nombre: limpiar(e.negocioNombre, 80), negocio_whatsapp: normalizarTelefono(e.negocioWhatsapp)!, firma_path: firmaPath ?? a.firma_path, editado_at: new Date().toISOString(), historial: [...(a.historial ?? []), anterior] }).eq("id", a.id).eq("editor_hash", a.editor_hash);
  if (error) return { error: "No pudimos guardar el cambio. Intenta de nuevo." };
  const { data: oculto } = await db.from("app_atenciones").select("oculto_at").eq("id", a.id).maybeSingle();
  if (!oculto?.oculto_at) await aplicarAlExpediente({ id: a.id, mascota_id: a.mascota_id, giro: a.giro, datos, fecha: e.fecha, peso_kg: e.pesoKg });
  return { error: null };
}

/** El dueño oculta (o vuelve a enseñar) una atención: deja de contar en su cartilla, pero la bitácora no se borra. */
export async function ocultarAtencion(o: { atencionId: string; duenoId: string; ocultar: boolean }): Promise<{ error: string | null }> {
  const db = createSupabaseAdminClient();
  const { data } = await db.from("app_atenciones").select("id, mascota_id, giro, datos, fecha, peso_kg, mascotas!inner(dueno_id)").eq("id", o.atencionId).is("deleted_at", null).maybeSingle();
  const a = data as (FilaAtencion & { mascotas: { dueno_id: string } | { dueno_id: string }[] }) | null;
  const dueno = a ? (Array.isArray(a.mascotas) ? a.mascotas[0]?.dueno_id : a.mascotas?.dueno_id) : null;
  if (!a || dueno !== o.duenoId) return { error: "No encontramos ese registro." };
  const ahora = new Date().toISOString();
  await db.from("app_atenciones").update({ oculto_at: o.ocultar ? ahora : null }).eq("id", a.id);
  if (o.ocultar) {
    await db.from("mascotas_cartilla").update({ deleted_at: ahora }).eq("atencion_id", a.id).is("deleted_at", null);
    await db.from("mascotas_pesos").update({ deleted_at: ahora }).eq("atencion_id", a.id).is("deleted_at", null);
    await programarRecordatorios(a.mascota_id);
  } else {
    await aplicarAlExpediente({ id: a.id, mascota_id: a.mascota_id, giro: a.giro, datos: a.datos, fecha: a.fecha, peso_kg: a.peso_kg });
  }
  return { error: null };
}

/** La firma del recordatorio: qué negocio registró el producto de esta fila de la cartilla (null si no vino de un QR). */
export async function firmaDeRegistro(cartillaId: string): Promise<{ nombre: string; whatsapp: string } | null> {
  const db = createSupabaseAdminClient();
  const { data } = await db.from("mascotas_cartilla").select("atencion_id").eq("id", cartillaId).maybeSingle();
  if (!data?.atencion_id) return null;
  const { data: a } = await db.from("app_atenciones").select("negocio_nombre, negocio_whatsapp, oculto_at").eq("id", data.atencion_id).maybeSingle();
  return a && !a.oculto_at ? { nombre: a.negocio_nombre as string, whatsapp: a.negocio_whatsapp as string } : null;
}

export const waDeNegocio = (whatsapp: string, texto: string) => `https://wa.me/52${whatsapp}?text=${encodeURIComponent(texto)}`;

/**
 * Al abrir su cuenta (registro con ?prospecto=&reclamo= verificado), el negocio entra con sus pacientes del QR: un
 * cliente «Pacientes del QR de PeluDesk» (con el WhatsApp del propio negocio: el del dueño nunca viaja), cada mascota
 * como su perro (nombre, especie, raza) con su nota clínica de lo registrado, y el vínculo con la mascota del dueño
 * para que lo que registre después le llegue a su app. Idempotente: si ya existe el paciente, no lo repite.
 */
export async function aplicarPrecargaQR(negocioId: string, prospectoId: string): Promise<{ pacientes: number; registros: number }> {
  const db = createSupabaseAdminClient();
  const { data: ats } = await db.from("app_atenciones").select("id, mascota_id, giro, datos, fecha, peso_kg, nota, negocio_whatsapp, created_at").eq("prospecto_id", prospectoId).is("deleted_at", null).order("created_at");
  const atenciones = (ats ?? []) as (FilaAtencion & { created_at: string })[];
  if (!atenciones.length) return { pacientes: 0, registros: 0 };
  const n = createSupabaseAdminClient(negocioId);
  const telefono = atenciones[atenciones.length - 1].negocio_whatsapp;
  let { data: cliente } = await n.from("clientes").select("id").eq("negocio_id", negocioId).eq("telefono", telefono).is("deleted_at", null).maybeSingle();
  if (!cliente) {
    const r = await n.from("clientes").insert({ negocio_id: negocioId, nombre: "Pacientes del QR de PeluDesk", telefono, updated_at: new Date().toISOString(), created_by: null }).select("id").maybeSingle();
    if (r.error || !r.data) {
      console.error("[app qr] precarga cliente", r.error?.message);
      return { pacientes: 0, registros: 0 };
    }
    cliente = r.data;
  }
  const porMascota = new Map<string, typeof atenciones>();
  for (const a of atenciones) porMascota.set(a.mascota_id, [...(porMascota.get(a.mascota_id) ?? []), a]);
  // Con Veterinaria, lo registrado va a la nota clínica de cada mascota (esa tabla exige el módulo); sin ella, a la
  // nota interna del cliente «Pacientes del QR» (solo la lee el personal). Nunca a una tabla que lea el dueño.
  const { data: vet } = await n.from("negocio_modulos").select("id").eq("negocio_id", negocioId).eq("modulo", "veterinaria").eq("activo", true).is("deleted_at", null).maybeSingle();
  const encabezado = "Registrado con el QR de PeluDesk antes de abrir tu cuenta. Los datos de su familia los tiene ella en su app PeluDesk: pídeselos en su próxima visita y dala de alta como cliente.";
  const bloquesCliente: string[] = [];
  let pacientes = 0;
  for (const [mascotaId, lista] of porMascota) {
    const { data: m } = await db.from("mascotas").select("id, nombre, especie, raza_texto, sexo, fecha_nacimiento").eq("id", mascotaId).maybeSingle();
    if (!m) continue;
    const { data: ya } = await n.from("mascotas_vinculos").select("perro_id").eq("negocio_id", negocioId).eq("mascota_id", mascotaId).is("deleted_at", null).maybeSingle();
    let perroId = (ya?.perro_id as string | undefined) ?? null;
    if (!perroId) {
      const { data: p, error } = await n.from("perros").insert({ negocio_id: negocioId, cliente_id: cliente!.id, nombre: m.nombre, especie: m.especie === "gato" ? "gato" : m.especie === "perro" ? "perro" : "otro", raza: m.raza_texto, updated_at: new Date().toISOString(), created_by: null }).select("id").maybeSingle();
      if (error || !p) {
        console.error("[app qr] precarga perro", error?.message);
        continue;
      }
      perroId = p.id as string;
      const v = await n.from("mascotas_vinculos").insert({ negocio_id: negocioId, mascota_id: mascotaId, perro_id: perroId, updated_at: new Date().toISOString(), created_by: null });
      if (v.error) console.error("[app qr] precarga vínculo", v.error.message);
      pacientes += 1;
    }
    const lineas = lista.map((a) => `· ${fechaLarga(a.fecha)}: ${resumenAtencion(a.giro, a.datos, a.peso_kg)}${a.nota ? `. Nota: ${a.nota}` : ""}`);
    if (!vet) {
      bloquesCliente.push(`${m.nombre}:\n${lineas.join("\n")}`);
      continue;
    }
    const notas = `${encabezado}\n${lineas.join("\n")}`.slice(0, 4000);
    const { data: previa } = await n.from("perros_notas_clinicas").select("perro_id").eq("perro_id", perroId).maybeSingle();
    const r = previa
      ? await n.from("perros_notas_clinicas").update({ notas }).eq("perro_id", perroId).eq("negocio_id", negocioId)
      : await n.from("perros_notas_clinicas").insert({ perro_id: perroId, negocio_id: negocioId, notas, updated_at: new Date().toISOString(), created_by: null });
    if (r.error) console.error("[app qr] precarga notas", r.error.message);
  }
  if (bloquesCliente.length) {
    const notas = `${encabezado}\n\n${bloquesCliente.join("\n\n")}`.slice(0, 2000);
    const r = await n.from("clientes_notas_internas").upsert({ cliente_id: cliente!.id, negocio_id: negocioId, notas, updated_at: new Date().toISOString(), created_by: null }, { onConflict: "cliente_id" });
    if (r.error) console.error("[app qr] precarga nota del cliente", r.error.message);
  }
  await db.from("prospectos_eventos").insert({ prospecto_id: prospectoId, tipo: "nota", texto: `Abrió su cuenta: entraron ${porMascota.size} paciente(s) y ${atenciones.length} registro(s) del QR.` });
  return { pacientes, registros: atenciones.length };
}

/** Lo que ve el dueño en la ficha de su mascota. */
export type AtencionDelDueno = { id: string; giro: Giro; negocioNombre: string; negocioWhatsapp: string; resumen: string; fecha: string; nota: string | null; editado: boolean; oculto: boolean; creada: string };

export function aAtencionDelDueno(f: Record<string, unknown>): AtencionDelDueno {
  return {
    id: f.id as string, giro: f.giro as Giro, negocioNombre: f.negocio_nombre as string, negocioWhatsapp: f.negocio_whatsapp as string,
    resumen: resumenAtencion(f.giro as Giro, (f.datos as Record<string, unknown>) ?? {}, (f.peso_kg as number | null) ?? null), fecha: f.fecha as string, nota: (f.nota as string | null) ?? null,
    editado: Boolean(f.editado_at), oculto: Boolean(f.oculto_at), creada: f.created_at as string,
  };
}
