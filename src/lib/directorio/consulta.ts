import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { GIROS_MERCADO, esGiroMercado, normalizarTexto, slugDe, type GiroMercado } from "@/lib/mercado/catalogo";
import { ciudadPorNombre, ciudadPorSlug, type CiudadMercado } from "@/lib/mercado/ciudades";

/**
 * El directorio público (peludesk.mx/directorio): los prospectos vivos del CRM con lugar de Google, por giro y
 * ciudad, ordenados por calificación y número de reseñas (lo que ya guarda el CRM de la búsqueda en Google Maps,
 * con su atribución en pantalla). Solo en el servidor, con la secret key; lo de Google en vivo se pide solo en la
 * ficha (como /para/<slug>). Una ciudad con 10 negocios o más del giro se indexa; las demás salen con noindex.
 */
export const MINIMO_INDEXABLE = 10;

export type NegocioDirectorio = {
  id: string;
  slug: string;
  nombre: string;
  giro: string;
  ciudad: string;
  direccion: string | null;
  colonia: string | null;
  calificacion: number | null;
  resenas: number | null;
  servicios: GiroMercado[];
  etapa: string;
  verificado: boolean;
};

export type CiudadDirectorio = { giro: GiroMercado; ciudad: string; estado: string | null; n: number; slug: string };

const SERVICIOS_WEB: GiroMercado[] = ["guarderia", "hotel", "estetica", "veterinaria"];

export function serviciosDeFila(giro: string, clasificacion: { servicios?: string[] } | null): GiroMercado[] {
  const s = (clasificacion?.servicios ?? []).filter((x): x is GiroMercado => SERVICIOS_WEB.includes(x as GiroMercado));
  if (s.length) return s;
  return giro === "mixto" ? ["guarderia", "hotel"] : esGiroMercado(giro) ? [giro] : [];
}

/** La colonia de una dirección de Google («Av. X 123, Jardines del Bosque, 44520 Guadalajara, Jal.» → «Jardines del Bosque»). */
export function coloniaDe(direccion: string | null | undefined): string | null {
  if (!direccion) return null;
  const partes = direccion.split(",").map((x) => x.trim()).filter(Boolean);
  // La colonia suele ser la parte anterior a «CP Ciudad»; si no hay código postal, la segunda parte.
  const i = partes.findIndex((x) => /^\d{5}\b/.test(x));
  const candidata = i > 0 ? partes[i - 1] : partes.length >= 3 ? partes[1] : null;
  if (!candidata || /^\d/.test(candidata) || candidata.length < 3 || candidata.length > 50) return null;
  return candidata;
}

export async function ciudadesDirectorio(): Promise<CiudadDirectorio[]> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("directorio_ciudades");
    if (error) throw new Error(error.message);
    return ((data ?? []) as { giro: string; ciudad: string; estado: string | null; n: number }[])
      .filter((x) => esGiroMercado(x.giro))
      .map((x) => ({ giro: x.giro as GiroMercado, ciudad: x.ciudad, estado: x.estado, n: Number(x.n), slug: slugDe(x.ciudad) }));
  } catch (e) {
    console.error("[directorio] ciudades", e instanceof Error ? e.message : e);
    return [];
  }
}

/** La ciudad de una ruta: de la lista nacional o, si el CRM tiene negocios en una ciudad que no está en la lista, de ahí. */
export async function resolverCiudad(slug: string): Promise<{ nombre: string; estado: string | null; slug: string } | null> {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  const c: CiudadMercado | null = ciudadPorSlug(slug) ?? ciudadPorNombre(slug.replace(/-/g, " "));
  if (c) return { nombre: c.nombre, estado: c.estado, slug: c.slug };
  const delCrm = (await ciudadesDirectorio()).find((x) => x.slug === slug);
  return delCrm ? { nombre: delCrm.ciudad, estado: delCrm.estado, slug: delCrm.slug } : null;
}

const COLUMNAS = "id, slug, nombre, giro, ciudad, direccion, calificacion, resenas, clasificacion, etapa, negocio_cliente_id";

type Fila = { id: string; slug: string; nombre: string; giro: string; ciudad: string; direccion: string | null; calificacion: number | null; resenas: number | null; clasificacion: { servicios?: string[] } | null; etapa: string; negocio_cliente_id: string | null };

function aNegocio(f: Fila): NegocioDirectorio {
  return {
    id: f.id,
    slug: f.slug,
    nombre: f.nombre,
    giro: f.giro,
    ciudad: f.ciudad,
    direccion: f.direccion,
    colonia: coloniaDe(f.direccion),
    calificacion: f.calificacion != null ? Number(f.calificacion) : null,
    resenas: f.resenas != null ? Number(f.resenas) : null,
    servicios: serviciosDeFila(f.giro, f.clasificacion),
    etapa: f.etapa,
    verificado: Boolean(f.negocio_cliente_id) && (f.etapa === "en_prueba" || f.etapa === "pagando"),
  };
}

/** Los negocios de un giro en una ciudad (hasta 1,000), los mejor calificados primero. */
export async function negociosDe(giro: GiroMercado, ciudad: string): Promise<NegocioDirectorio[]> {
  const db = createSupabaseAdminClient();
  const salida: NegocioDirectorio[] = [];
  try {
    for (let desde = 0; desde < 3000; desde += 1000) {
      const { data, error } = await db
        .from("prospectos")
        .select(COLUMNAS)
        .is("deleted_at", null)
        .is("principal_id", null)
        .neq("etapa", "descartado")
        .not("google_place_id", "is", null)
        .ilike("ciudad", ciudad)
        .in("giro", [giro, "mixto"])
        .order("calificacion", { ascending: false, nullsFirst: false })
        .order("resenas", { ascending: false, nullsFirst: false })
        .order("id")
        .range(desde, desde + 999);
      if (error) throw new Error(error.message);
      for (const f of (data ?? []) as Fila[]) {
        const n = aNegocio(f);
        if (n.servicios.includes(giro)) salida.push(n);
      }
      if ((data ?? []).length < 1000) break;
    }
  } catch (e) {
    console.error("[directorio] negocios", e instanceof Error ? e.message : e);
  }
  return salida;
}

export async function negocioPorSlug(slug: string): Promise<NegocioDirectorio | null> {
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return null;
  const { data } = await createSupabaseAdminClient().from("prospectos").select(COLUMNAS).eq("slug", slug).is("deleted_at", null).maybeSingle();
  if (!data) return null;
  const n = aNegocio(data as Fila);
  return n.etapa === "descartado" ? null : n;
}

/** Las colonias con 2 negocios o más, para el filtro. */
export function coloniasDe(lista: NegocioDirectorio[]): { nombre: string; n: number }[] {
  const mapa = new Map<string, { nombre: string; n: number }>();
  for (const x of lista) {
    if (!x.colonia) continue;
    const k = normalizarTexto(x.colonia);
    const v = mapa.get(k) ?? { nombre: x.colonia, n: 0 };
    v.n++;
    mapa.set(k, v);
  }
  return [...mapa.values()].filter((c) => c.n >= 2).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, "es"));
}

export const textoGiroDirectorio = (giro: GiroMercado) => GIROS_MERCADO.find((g) => g.clave === giro)!;
