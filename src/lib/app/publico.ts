import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { construirSoporte } from "@/lib/whatsapp/infra";
import { normalizarTelefono } from "@/lib/telefono";
import { numeroBot } from "@/lib/directorio/reclamo";
import { urlFirmadaApp } from "./fotos";
import { enviarPush } from "./push";
import { crearAviso } from "./avisos";

/**
 * El perfil público de una mascota (/m/<token>, el QR de la placa) y el canal por el que quien la encuentra le escribe
 * al dueño sin ver su teléfono: desde la página (mensaje y, si quiere, su WhatsApp) o mandando «ENCONTRE <token> …» al
 * bot desde su número. Al dueño le llega push y aviso; contesta desde la app y la respuesta sale por el bot al WhatsApp
 * de quien la encontró (si el bot ya tiene su número y la ventana de 24 h está abierta).
 */
export type MascotaPublica = { id: string; nombre: string; especie: string; especieDetalle: string | null; sexo: string | null; razaTexto: string | null; fotoUrl: string | null; perdida: boolean; perdidaNota: string | null; duenoNombre: string | null; token: string };

export const PATRON_HALLAZGO = /\bENCONTR[EÉ]\s+([A-Za-z0-9]{10})\b\s*[:\-.,]?\s*([\s\S]{0,600})?/i;
export const textoHallazgo = (token: string) => `ENCONTRE ${token}: `;

export async function mascotaPublica(token: string): Promise<MascotaPublica | null> {
  if (!/^[A-Za-z0-9]{10}$/.test(token)) return null;
  const db = createSupabaseAdminClient();
  const { data } = await db.rpc("app_mascota_publica", { p_token: token.toUpperCase() });
  const m = data as Record<string, unknown> | null;
  if (!m?.id) return null;
  let fotoUrl = await urlFirmadaApp((m.foto_path as string | null) ?? null, 3600);
  const v = m.vinculo_foto as { negocio_id: string; foto_path: string } | null;
  if (!fotoUrl && v?.foto_path) {
    const { data: f } = await createSupabaseAdminClient(v.negocio_id).storage.from("perros-archivos").createSignedUrl(v.foto_path, 3600);
    fotoUrl = f?.signedUrl ?? null;
  }
  return {
    id: m.id as string, nombre: m.nombre as string, especie: (m.especie as string) ?? "perro", especieDetalle: (m.especie_detalle as string | null) ?? null, sexo: (m.sexo as string | null) ?? null,
    razaTexto: (m.raza_texto as string | null) ?? null, fotoUrl, perdida: Boolean(m.perdida), perdidaNota: (m.perdida_nota as string | null) ?? null, duenoNombre: (m.dueno_nombre as string | null) || null, token: token.toUpperCase(),
  };
}

/** Un mensaje de quien la encontró (página o bot): se guarda, y al dueño le llega push y aviso. */
export async function registrarMensajeHallador(o: { token: string; texto: string; telefono?: string | null; nombre?: string | null; via: "pagina" | "whatsapp" }): Promise<{ error: string | null; mascota?: { id: string; nombre: string } }> {
  const texto = o.texto.trim().slice(0, 600);
  if (texto.length < 2) return { error: "Escribe un mensaje." };
  const db = createSupabaseAdminClient();
  const { data: m } = await db.from("mascotas").select("id, nombre, dueno_id, token_publico").eq("token_publico", o.token.toUpperCase()).is("deleted_at", null).maybeSingle();
  if (!m) return { error: "No encontramos esa mascota." };
  // Tope: 20 mensajes por mascota por día (no es un chat libre).
  const { count } = await db.from("mascotas_mensajes").select("id", { count: "exact", head: true }).eq("mascota_id", m.id).eq("de", "hallador").gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= 20) return { error: "Ya hay muchos mensajes para esta mascota hoy. Si es urgente, llévala a una veterinaria cercana." };
  const tel = o.telefono ? normalizarTelefono(o.telefono) : null;
  const { error } = await db.from("mascotas_mensajes").insert({ mascota_id: m.id, de: "hallador", texto, hallador_telefono: tel, hallador_nombre: o.nombre?.trim().slice(0, 60) || null, entregado_at: new Date().toISOString(), created_by: null, updated_at: new Date().toISOString() });
  if (error) return { error: "No pudimos mandar tu mensaje. Intenta de nuevo." };
  const titulo = `Alguien escribió sobre ${m.nombre}`;
  await enviarPush(m.dueno_id, { titulo, cuerpo: texto.slice(0, 120), url: `/mascotas/${m.id}/perdida`, etiqueta: `msg-${m.id}` });
  await crearAviso({ duenoId: m.dueno_id, tipo: "mensaje", titulo, cuerpo: texto.slice(0, 200), url: `/mascotas/${m.id}/perdida`, mascotaId: m.id, push: false, datos: { via: o.via } });
  return { error: null, mascota: { id: m.id, nombre: m.nombre } };
}

/** El webhook: «ENCONTRE ABCD2345EF: la vi en el parque». Nunca lanza. */
export async function atenderHallazgo(telefonoWa: string, texto: string | null | undefined, perfil: string | null): Promise<string | null> {
  const m = PATRON_HALLAZGO.exec(texto ?? "");
  if (!m) return null;
  try {
    const mensaje = (m[2] ?? "").trim() || "Encontré a tu mascota. Escríbeme por aquí.";
    const r = await registrarMensajeHallador({ token: m[1], texto: mensaje, telefono: telefonoWa, nombre: perfil, via: "whatsapp" });
    if (r.error) return r.error === "No encontramos esa mascota." ? "No encontramos una mascota con ese código. Revisa la placa: son 10 letras y números." : r.error;
    return `Gracias. Ya le avisamos a quien cuida a ${r.mascota!.nombre}. Si te contesta, te llega aquí mismo. Mientras, si puedes, llévala a una veterinaria cercana para que lean su chip.`;
  } catch (e) {
    console.error("[app] hallazgo", e instanceof Error ? e.message : e);
    return "No pudimos avisar en este momento. Intenta de nuevo en un minuto.";
  }
}

/** El dueño contesta desde la app: queda en el hilo y, si se puede, sale por el bot al WhatsApp de quien escribió. */
export async function responderHallador(o: { mascotaId: string; duenoId: string; texto: string }): Promise<{ error: string | null; entregado: boolean; motivo?: string }> {
  const texto = o.texto.trim().slice(0, 600);
  if (texto.length < 1) return { error: "Escribe tu respuesta.", entregado: false };
  const db = createSupabaseAdminClient();
  const { data: m } = await db.from("mascotas").select("id, nombre").eq("id", o.mascotaId).eq("dueno_id", o.duenoId).is("deleted_at", null).maybeSingle();
  if (!m) return { error: "No encontramos esa mascota.", entregado: false };
  const { data: ultimo } = await db.from("mascotas_mensajes").select("hallador_telefono").eq("mascota_id", m.id).eq("de", "hallador").not("hallador_telefono", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const tel = (ultimo?.hallador_telefono as string | null) ?? null;
  let entregado = false;
  let motivo: string | undefined;
  if (tel) {
    const { datos, wa } = construirSoporte();
    if (await datos.ventanaAbierta(`52${tel}`)) {
      const r = await wa.texto(`52${tel}`, `Quien cuida a ${m.nombre} te contesta: ${texto}`);
      entregado = r.ok;
      motivo = r.ok ? undefined : "No se pudo entregar por WhatsApp.";
    } else motivo = `Quien te escribió no ha hablado con PeluDesk en las últimas 24 horas: tu respuesta queda aquí y la ve si vuelve a abrir el perfil${numeroBot() ? " o a escribirnos" : ""}.`;
  } else motivo = "Quien te escribió no dejó su WhatsApp: tu respuesta queda en el perfil de tu mascota, donde la ve si vuelve a abrirlo.";
  const { error } = await db.from("mascotas_mensajes").insert({ mascota_id: m.id, de: "dueno", texto, entregado_at: entregado ? new Date().toISOString() : null, error: entregado ? null : motivo ?? null, created_by: o.duenoId, updated_at: new Date().toISOString() });
  if (error) return { error: "No pudimos guardar tu respuesta.", entregado: false };
  return { error: null, entregado, motivo };
}

/** Lo que quien encontró a la mascota ve en /m/<token> después de escribir: las respuestas del dueño (sin datos del dueño). */
export async function hiloPublico(token: string, desde: string | null): Promise<{ de: "hallador" | "dueno"; texto: string; creado: string }[]> {
  const db = createSupabaseAdminClient();
  const { data: m } = await db.from("mascotas").select("id").eq("token_publico", token.toUpperCase()).is("deleted_at", null).maybeSingle();
  if (!m) return [];
  let q = db.from("mascotas_mensajes").select("de, texto, created_at").eq("mascota_id", m.id).is("deleted_at", null).order("created_at").limit(50);
  if (desde) q = q.gte("created_at", desde);
  const { data } = await q;
  return ((data ?? []) as { de: "hallador" | "dueno"; texto: string; created_at: string }[]).map((x) => ({ de: x.de, texto: x.texto, creado: x.created_at }));
}
