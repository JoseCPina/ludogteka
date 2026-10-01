import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createElement } from "react";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { negocioActual } from "@/lib/negocio/actual";
import { BUCKET_REPORTES } from "./constantes";
import { cargarPlantilla } from "./carga";
import { coloresDeTarjeta } from "./colores";
import { ALTO, ANCHO, TarjetaReporte, type DatosTarjeta, type MarcaTarjeta } from "./tarjeta";
import type { ContenidoReporte } from "./tipos";

/**
 * Solo servidor. La imagen del reporte: satori (next/og) → PNG → sharp →
 * JPEG 1080×1350. Sin navegador: corre en Vercel. Las fuentes (Montserrat,
 * SIL OFL) viven en ./fuentes y next.config.ts las incluye en la función.
 */
const DIR_FUENTES = path.join(process.cwd(), "src", "lib", "reporte", "fuentes");
const PESOS = [400, 600, 700, 800] as const;

let fuentesEnMemoria: { name: string; data: Buffer; weight: (typeof PESOS)[number]; style: "normal" }[] | null = null;
async function fuentes() {
  fuentesEnMemoria ??= await Promise.all(
    PESOS.map(async (weight) => ({ name: "Montserrat", data: await readFile(path.join(DIR_FUENTES, `montserrat-latin-${weight}-normal.woff`)), weight, style: "normal" as const }))
  );
  return fuentesEnMemoria;
}

const TIPOS: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

/** El logo como data URI (satori no sale a buscar rutas). PNG/JPG/WebP/GIF; un SVG remoto no. */
async function logoComoDataUri(logo: string | null | undefined): Promise<string | null> {
  if (!logo) return null;
  try {
    if (logo.startsWith("https://")) {
      const r = await fetch(logo, { signal: AbortSignal.timeout(8_000) });
      const tipo = (r.headers.get("content-type") ?? "").split(";")[0];
      if (!r.ok || !tipo.startsWith("image/") || tipo.includes("svg")) return null;
      return `data:${tipo};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
    }
    const limpio = path.posix.normalize(logo);
    const tipo = TIPOS[path.posix.extname(limpio).toLowerCase()];
    if (!limpio.startsWith("/") || limpio.includes("..") || !tipo) return null;
    return `data:${tipo};base64,${(await readFile(path.join(process.cwd(), "public", limpio))).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function marcaParaTarjeta(): Promise<{ marca: MarcaTarjeta; marcaColor: string | null }> {
  const n = await cargarNegocioLanding();
  const color = n.marca?.color && /^#[0-9a-fA-F]{6}$/.test(n.marca.color) ? n.marca.color : null;
  return {
    marcaColor: color,
    marca: {
      nombre: n.nombre,
      color: color ?? "#4B3F72",
      logoDataUri: await logoComoDataUri(n.marca?.logo),
      logoTexto: n.marca?.logo_texto?.length ? n.marca.logo_texto : null,
    },
  };
}

export function fechaTextoDeDia(dia: string): string {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${dia}T12:00:00Z`));
}

export async function renderizarTarjetaJpeg(datos: DatosTarjeta): Promise<Buffer> {
  const respuesta = new ImageResponse(createElement(TarjetaReporte, { datos }), { width: ANCHO, height: ALTO, fonts: await fuentes() });
  const png = Buffer.from(await respuesta.arrayBuffer());
  return await sharp(png).flatten({ background: "#ffffff" }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

/** Arma los datos de pintado de un contenido guardado con la marca y colores del negocio. */
export async function datosDeTarjeta(contenido: ContenidoReporte, perro: string, dia: string): Promise<DatosTarjeta> {
  const supabase = await createSupabaseServerClient();
  const [{ config }, { marca, marcaColor }] = await Promise.all([cargarPlantilla(supabase), marcaParaTarjeta()]);
  return { contenido, perro, fechaTexto: fechaTextoDeDia(dia), colores: coloresDeTarjeta(config, { color: marcaColor }), marca };
}

/**
 * Dibuja la imagen del reporte, la sube al bucket privado y la registra
 * (la RPC devuelve la ruta anterior, que se borra). Con la sesión de quien
 * llama para leer y registrar (la base comprueba el permiso); la secret key
 * solo toca Storage, atada al negocio de la petición.
 */
export async function generarTarjeta(reporteId: string): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: r } = await supabase
    .from("reportes_guarderia")
    .select("id, fecha, version, contenido, perros(nombre)")
    .eq("id", reporteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!r) return { ok: false, error: "No encontramos ese reporte." };
  const perro = (Array.isArray(r.perros) ? r.perros[0] : r.perros) as { nombre: string } | null;
  const negocio = await negocioActual();
  const jpeg = await renderizarTarjetaJpeg(await datosDeTarjeta(r.contenido as ContenidoReporte, perro?.nombre ?? "", r.fecha as string));
  const ruta = `${negocio.id}/tarjetas/${r.id}/${r.version}-${randomBytes(6).toString("hex")}.jpg`;
  const admin = createSupabaseAdminClient(negocio.id);
  const { error: errSubida } = await admin.storage.from(BUCKET_REPORTES).upload(ruta, jpeg, { contentType: "image/jpeg", upsert: false });
  if (errSubida) return { ok: false, error: "No pudimos guardar la imagen. Intenta de nuevo." };
  const { data: anterior, error } = await supabase.rpc("reporte_registrar_tarjeta", { p_reporte_id: r.id, p_path: ruta, p_bytes: jpeg.byteLength });
  if (error) {
    await admin.storage.from(BUCKET_REPORTES).remove([ruta]);
    return { ok: false, error: error.message };
  }
  if (typeof anterior === "string" && anterior && anterior !== ruta) await admin.storage.from(BUCKET_REPORTES).remove([anterior]);
  return { ok: true, path: ruta };
}
