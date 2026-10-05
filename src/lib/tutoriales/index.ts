import type { SupabaseClient } from "@supabase/supabase-js";
import { articuloDeRuta } from "@/lib/ayuda/rutas";

/**
 * La serie de videos tutoriales (migración 20261005170000). El catálogo vive
 * en la base (tabla `tutoriales`, de la plataforma) y se llena desde
 * scripts/tutoriales/catalogo.mjs; los archivos, en el bucket público
 * `tutoriales` (MP4 de 720p, póster y subtítulos). Con `youtube_id`, el
 * reproductor es el de YouTube sin cookies.
 *
 * Quién ve cada video: solo lo publicado; solo si el negocio tiene prendidos
 * TODOS los módulos del video; y los grabados con la cuenta de admin, solo
 * admin o recepción con alguno de sus permisos.
 */
export const AREAS_TUTORIALES: Record<string, string> = {
  empieza: "Empieza aquí",
  clientes: "Clientes y perros",
  contratos: "Contratos",
  estetica: "Estética",
  guarderia: "Guardería y hotel",
  caja: "Caja y cobros",
  inventario: "Inventario",
  empleados: "Empleados y gastos",
  negocio: "Tu negocio",
};

export type Tutorial = {
  numero: string;
  slug: string;
  area: string;
  orden: number;
  titulo: string;
  resumen: string;
  descripcion: string;
  etiquetas: string[];
  modulos: string[];
  permisos: string[];
  articulos: string[];
  rutas: string[];
  siguiente: string | null;
  duracion_s: number | null;
  video_path: string | null;
  poster_path: string | null;
  vtt_path: string | null;
  youtube_id: string | null;
  con_voz: boolean;
  rol: "admin" | "recepcion" | "estetica" | "cliente";
};

export const COLUMNAS_TUTORIAL =
  "numero, slug, area, orden, titulo, resumen, descripcion, etiquetas, modulos, permisos, articulos, rutas, siguiente, duracion_s, video_path, poster_path, vtt_path, youtube_id, con_voz, rol";

export function urlArchivoTutorial(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tutoriales/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** ¿Se puede reproducir ya? (con archivo propio o con YouTube). */
export function tieneVideo(t: Pick<Tutorial, "video_path" | "youtube_id">): boolean {
  return Boolean(t.video_path || t.youtube_id);
}

export function visibleTutorial(
  t: Pick<Tutorial, "modulos" | "permisos" | "rol">,
  quien: { rol: string; permisos: readonly string[]; modulos: readonly string[] }
): boolean {
  if (quien.rol !== "admin" && quien.rol !== "recepcion") return false;
  if (!t.modulos.every((m) => quien.modulos.includes(m))) return false;
  if (quien.rol === "admin") return true;
  if (t.rol === "admin") return t.permisos.some((p) => quien.permisos.includes(p));
  return true;
}

/** Los videos que esta persona puede ver ahora (los publicados, con archivo). */
export async function cargarTutorialesVisibles(
  supabase: SupabaseClient,
  quien: { rol: string; permisos: readonly string[]; modulos: readonly string[] }
): Promise<Tutorial[]> {
  const { data } = await supabase
    .from("tutoriales")
    .select(COLUMNAS_TUTORIAL)
    .eq("publicado", true)
    .is("deleted_at", null)
    .order("orden", { ascending: true });
  return ((data ?? []) as unknown as Tutorial[]).filter((t) => tieneVideo(t) && visibleTutorial(t, quien));
}

/** El video de una pantalla (el de la ruta más específica), para «¿Cómo se hace?». */
export function tutorialDeRuta<T extends { slug: string; rutas: string[] }>(pathname: string, lista: T[]): T | null {
  return articuloDeRuta(pathname, lista);
}

export function duracionTexto(s: number | null): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const seg = Math.round(s % 60);
  return m > 0 ? `${m}:${String(seg).padStart(2, "0")} min` : `${seg} s`;
}
