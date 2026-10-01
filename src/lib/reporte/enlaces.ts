import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { BUCKET_REPORTES, TTL_URL_FIRMADA_S } from "./constantes";

/**
 * Solo servidor. Ligas públicas del reporte (/r/<token>) y de la galería
 * (/f/<token>). El token son 32 bytes aleatorios (256 bits) en base64url; en
 * la base solo vive su sha256. El token en claro existe únicamente en el
 * mensaje que se le manda al dueño.
 */
export function nuevoToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashDeToken(token) };
}

export function hashDeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Forma del token: 43 caracteres de base64url. Lo demás ni se busca. */
export function tokenPlausible(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function urlReporte(negocio: Parameters<typeof urlDelNegocio>[0], token: string): string {
  return `${urlDelNegocio(negocio)}/r/${token}`;
}

export function urlGaleria(negocio: Parameters<typeof urlDelNegocio>[0], token: string): string {
  return `${urlDelNegocio(negocio)}/f/${token}`;
}

/** wa.me al teléfono principal del dueño (10 dígitos guardados, México). */
export function enlaceWhatsApp(telefono10: string, mensaje: string): string {
  return `https://wa.me/52${telefono10.replace(/\D/g, "")}?text=${encodeURIComponent(mensaje)}`;
}

export function mensajeReporte(o: { dueno: string | null; perro: string; negocio: string; url: string }): string {
  const saludo = o.dueno ? `Hola ${o.dueno}` : "Hola";
  return `${saludo}, te compartimos el reporte de comportamiento de ${o.perro} de hoy en ${o.negocio}: ${o.url}`;
}

export function mensajeGaleria(o: { dueno: string | null; perro: string; negocio: string; url: string }): string {
  const saludo = o.dueno ? `Hola ${o.dueno}` : "Hola";
  return `${saludo}, te compartimos fotos y videos de ${o.perro} en ${o.negocio}: ${o.url}`;
}

/** Teléfono principal del dueño del perro, o lo que falta. */
export async function contactoDelPerro(
  supabase: SupabaseClient,
  perroId: string
): Promise<{ perro: string; dueno: string | null; telefono: string | null; error: string | null }> {
  const { data } = await supabase
    .from("perros")
    .select("nombre, clientes(nombre, telefono)")
    .eq("id", perroId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return { perro: "", dueno: null, telefono: null, error: "No encontramos a ese perro." };
  const cliente = (Array.isArray(data.clientes) ? data.clientes[0] : data.clientes) as { nombre: string | null; telefono: string | null } | null;
  const telefono = (cliente?.telefono ?? "").replace(/\D/g, "");
  const nombre = (cliente?.nombre ?? "").trim();
  return {
    perro: data.nombre as string,
    dueno: nombre ? nombre.split(/\s+/)[0] : null,
    telefono: telefono.length === 10 ? telefono : null,
    error: telefono.length === 10 ? null : "Falta el teléfono del dueño: captúralo en su ficha para poder enviarlo por WhatsApp.",
  };
}

/** URLs firmadas de corta vida para rutas del bucket (servidor, secret key). */
export async function firmarRutas(
  admin: SupabaseClient,
  rutas: string[],
  opciones: { ttl?: number; descargar?: string | boolean } = {}
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (rutas.length === 0) return mapa;
  const { data } = await admin.storage
    .from(BUCKET_REPORTES)
    .createSignedUrls(rutas, opciones.ttl ?? TTL_URL_FIRMADA_S, opciones.descargar ? { download: opciones.descargar } : undefined);
  for (const fila of data ?? []) {
    if (fila.path && fila.signedUrl) mapa.set(fila.path, fila.signedUrl);
  }
  return mapa;
}

export type EnlaceResuelto =
  | { estado: "invalido" }
  | { estado: "vencido"; tipo: "reporte" | "galeria" }
  | { estado: "ok"; id: string; tipo: "reporte" | "galeria"; reporte_id: string | null; galeria_id: string | null; expira_at: string };

/**
 * Valida un token contra el negocio del dominio: token con la forma, hash
 * que exista PARA ESTE negocio, sin revocar y sin vencer. Un token de otro
 * negocio no se distingue de uno falso. Cuenta la visita.
 */
export async function resolverEnlace(
  admin: SupabaseClient,
  negocioId: string,
  token: string,
  tipo: "reporte" | "galeria"
): Promise<EnlaceResuelto> {
  if (!tokenPlausible(token)) return { estado: "invalido" };
  const { data } = await admin
    .from("enlaces_cliente")
    .select("id, tipo, reporte_id, galeria_id, expira_at, revocado_at, vistas")
    .eq("negocio_id", negocioId)
    .eq("token_hash", hashDeToken(token))
    .eq("tipo", tipo)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return { estado: "invalido" };
  if (data.revocado_at || new Date(data.expira_at as string).getTime() <= Date.now()) return { estado: "vencido", tipo };
  await admin
    .from("enlaces_cliente")
    .update({ vistas: ((data.vistas as number) ?? 0) + 1, ultima_vista_at: new Date().toISOString() })
    .eq("id", data.id as string)
    .eq("negocio_id", negocioId);
  return {
    estado: "ok",
    id: data.id as string,
    tipo,
    reporte_id: (data.reporte_id as string | null) ?? null,
    galeria_id: (data.galeria_id as string | null) ?? null,
    expira_at: data.expira_at as string,
  };
}
