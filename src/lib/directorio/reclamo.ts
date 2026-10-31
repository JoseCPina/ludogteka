import { createHash, randomInt } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizarTelefono } from "@/lib/telefono";
import { registrarEventoHerramienta, type Origen } from "@/lib/herramientas/telemetria";
import { hoyNegocio } from "@/lib/formato";

/**
 * «¿Es tu negocio? Reclámalo»: la persona deja su WhatsApp y recibe un código de 6 caracteres EN PANTALLA; lo manda
 * ella al número del bot de PeluDesk («RECLAMO ABC123»). Así no hace falta una plantilla de autenticación de Meta y la
 * verificación es real: el mensaje llega del teléfono que pidió el código. El webhook llama
 * prospecto_reclamo_verificar; la página pregunta el estado y, verificado, abre la prueba gratis con
 * ?prospecto=<slug>&reclamo=<id>: el negocio nace con su ficha publicada y «Negocio verificado».
 */
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I: se dicta por teléfono sin confusión

export function codigoNuevo(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}

/** El número del bot de PeluDesk (PELUDESK_WHATSAPP), al que se manda el código. */
export function numeroBot(): string | null {
  const tel = (process.env.PELUDESK_WHATSAPP ?? "").replace(/\D/g, "");
  if (tel.length < 10) return null;
  return tel.length === 10 ? `52${tel}` : tel;
}

export const textoReclamo = (codigo: string) => `RECLAMO ${codigo}`;

export type EstadoReclamo = { id: string; estado: "pendiente" | "verificado" | "registrado" | "vencido"; codigo: string; waUrl: string | null; telefonoCoincide: boolean };

export async function iniciarReclamo(o: { prospectoId: string; telefonoNegocio: string | null; telefono: string; ip: string | null; origen?: Origen | null; giro?: string | null; ciudad?: string | null }): Promise<{ error: string | null; reclamo?: EstadoReclamo }> {
  const tel = normalizarTelefono(o.telefono);
  if (!tel) return { error: "Escribe tu WhatsApp a diez dígitos." };
  const db = createSupabaseAdminClient();
  const dia = hoyNegocio("America/Mexico_City");
  const ipHash = o.ip ? createHash("sha256").update(`${o.ip}|${dia}`).digest("hex").slice(0, 32) : null;
  // Un reclamo pendiente del mismo teléfono para el mismo negocio se reusa (recargar la página no genera otro código).
  const { data: previo } = await db.from("prospectos_reclamos").select("id, codigo, estado, telefono_coincide").eq("prospecto_id", o.prospectoId).eq("telefono_norm", tel).in("estado", ["pendiente", "verificado"]).is("deleted_at", null).gte("created_at", new Date(Date.now() - 2 * 86_400_000).toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (previo) return { error: null, reclamo: aEstado(previo as { id: string; codigo: string; estado: EstadoReclamo["estado"]; telefono_coincide: boolean }) };
  // No más de 5 reclamos pendientes por teléfono al día.
  const { count } = await db.from("prospectos_reclamos").select("id", { count: "exact", head: true }).eq("telefono_norm", tel).gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= 5) return { error: "Ya pediste varios códigos hoy. Manda uno de los que tienes o intenta mañana." };
  for (let intento = 0; intento < 3; intento++) {
    const codigo = codigoNuevo();
    const { data, error } = await db
      .from("prospectos_reclamos")
      .insert({ prospecto_id: o.prospectoId, telefono_norm: tel, codigo, telefono_coincide: o.telefonoNegocio === tel, ip_hash: ipHash })
      .select("id, codigo, estado, telefono_coincide")
      .maybeSingle();
    if (error?.code === "23505") continue;
    if (error || !data) {
      console.error("[directorio] reclamo", error?.message);
      return { error: "No pudimos generar tu código. Intenta de nuevo." };
    }
    await registrarEventoHerramienta({ herramienta: "directorio", evento: "telefono", origen: o.origen, giro: o.giro, ciudad: o.ciudad, prospectoId: o.prospectoId, sinFiltroNavegador: true });
    return { error: null, reclamo: aEstado(data as { id: string; codigo: string; estado: EstadoReclamo["estado"]; telefono_coincide: boolean }) };
  }
  return { error: "No pudimos generar tu código. Intenta de nuevo." };
}

function aEstado(r: { id: string; codigo: string; estado: EstadoReclamo["estado"]; telefono_coincide: boolean }): EstadoReclamo {
  const bot = numeroBot();
  return { id: r.id, codigo: r.codigo, estado: r.estado, telefonoCoincide: r.telefono_coincide, waUrl: bot ? `https://wa.me/${bot}?text=${encodeURIComponent(textoReclamo(r.codigo))}` : null };
}

export async function estadoReclamo(id: string): Promise<EstadoReclamo | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await createSupabaseAdminClient().from("prospectos_reclamos").select("id, codigo, estado, telefono_coincide").eq("id", id).is("deleted_at", null).maybeSingle();
  return data ? aEstado(data as { id: string; codigo: string; estado: EstadoReclamo["estado"]; telefono_coincide: boolean }) : null;
}

/** Al registrarse con ?reclamo=<id> verificado y el mismo teléfono: el negocio queda verificado y el reclamo, registrado. */
export async function aplicarReclamoAlRegistro(o: { reclamoId: string; telefono: string; negocioId: string; slugProspecto: string }): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/.test(o.reclamoId)) return false;
  const db = createSupabaseAdminClient();
  const { data: r } = await db.from("prospectos_reclamos").select("id, prospecto_id, telefono_norm, estado, prospectos!inner(slug)").eq("id", o.reclamoId).eq("estado", "verificado").is("deleted_at", null).maybeSingle();
  const fila = r as { id: string; prospecto_id: string; telefono_norm: string; prospectos: { slug: string } | { slug: string }[] } | null;
  if (!fila) return false;
  const slug = Array.isArray(fila.prospectos) ? fila.prospectos[0]?.slug : fila.prospectos?.slug;
  if (fila.telefono_norm !== normalizarTelefono(o.telefono) || slug !== o.slugProspecto) return false;
  await db.from("prospectos_reclamos").update({ estado: "registrado", registrado_at: new Date().toISOString(), negocio_id: o.negocioId }).eq("id", fila.id);
  const perfil = createSupabaseAdminClient(o.negocioId);
  const { data: existe } = await perfil.from("negocio_perfil").select("id").eq("negocio_id", o.negocioId).is("deleted_at", null).maybeSingle();
  const cambios = { verificado_at: new Date().toISOString(), verificado_por: "reclamo" };
  const { error } = existe ? await perfil.from("negocio_perfil").update(cambios).eq("id", existe.id).eq("negocio_id", o.negocioId) : await perfil.from("negocio_perfil").insert({ negocio_id: o.negocioId, ...cambios });
  if (error) console.error("[directorio] verificado", error.message);
  await registrarEventoHerramienta({ herramienta: "directorio", evento: "cuenta", prospectoId: fila.prospecto_id, negocioId: o.negocioId, sinFiltroNavegador: true });
  return true;
}
