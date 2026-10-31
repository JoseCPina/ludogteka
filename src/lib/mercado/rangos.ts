import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { esGiroMercado, esTalla, MINIMO_MUESTRAS, servicioMercado, slugDe, TEXTO_MINIMO, type GiroMercado, type Rango, type Talla } from "./catalogo";
import { ciudadPorNombre, ciudadPorSlug, type CiudadMercado } from "./ciudades";

/**
 * Lectura de los rangos del Índice de precios (precios_mercado_rangos: p25, mediana y p75 de la ciudad; con menos de
 * 8 precios o de 3 negocios distintos cae al estado y luego al país, y lo dice en `nivel`). Solo en el servidor, con
 * la secret key (las tablas son de la plataforma: ningún visitante las lee directo). Nunca lanza: sin base, «sin_datos».
 */
export type ConsultaRango = { giro: GiroMercado; servicio: string; ciudad: CiudadMercado | null; talla: Talla | null };

export type CiudadConDatos = { ciudad: string; estado: string; muestras: number; negocios: number; servicios: number; fecha: string };

/**
 * Las ciudades con rango y página propios de un giro (8 precios o más Y 3 negocios o más: lo decide la base). Una vez
 * por petición (`cache`): la herramienta, la página por ciudad, el sitemap y llms.txt la piden varias veces.
 */
export const ciudadesConDatos = cache(async (giro: GiroMercado, minimo = MINIMO_MUESTRAS): Promise<CiudadConDatos[]> => {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("precios_mercado_ciudades", { p_giro: giro, p_minimo: minimo });
    if (error) throw new Error(error.message);
    return ((data ?? []) as CiudadConDatos[]).map((x) => ({ ...x, muestras: Number(x.muestras), negocios: Number(x.negocios), servicios: Number(x.servicios) }));
  } catch (e) {
    console.error("[mercado] ciudades", e instanceof Error ? e.message : e);
    return [];
  }
});

/**
 * LA función que resuelve una ciudad del índice: la usan la herramienta (`leerConsulta`), la página por ciudad, la
 * imagen para compartir y la insignia, así las cuatro consultan por el mismo nombre. Acepta un slug
 * («naucalpan-de-juarez», «naucalpan», «ciudad-de-mexico») o un nombre («Naucalpan de Juárez», «Guadalajara, Jalisco»).
 *  1. Si una ciudad CON DATOS de ese giro tiene ese slug, es esa, con el nombre tal como está en la base (el que dio
 *     Google al prospecto), que es con el que se guardó cada precio y con el que se arman sitemap, llms.txt y enlaces.
 *  2. Si el texto es una ciudad del catálogo y hay una con datos que le corresponde («Naucalpan» → «Naucalpan de
 *     Juárez»), es la de la base: el rango sale de la ciudad, no del estado.
 *  3. Si es del catálogo y no tiene datos, es la del catálogo: el rango cae al estado o al país y lo dice.
 *  4. Si no es nada de eso, null.
 */
export async function resolverCiudad(giro: GiroMercado, texto: string | null | undefined): Promise<CiudadMercado | null> {
  const t = (texto ?? "").trim();
  if (!t) return null;
  const slug = slugDe(t.replace(/,\s*[^,]+$/, ""));
  const catalogo = ciudadPorSlug(slug) ?? ciudadPorNombre(t);
  const conDatos = await ciudadesConDatos(giro);
  const con = conDatos.find((x) => slugDe(x.ciudad) === slug) ?? (catalogo ? conDatos.find((x) => ciudadPorNombre(x.ciudad)?.slug === catalogo.slug) : undefined);
  if (con) return { ...(catalogo ?? ciudadPorNombre(con.ciudad) ?? { poblacion: 0, clave: "" }), nombre: con.ciudad, estado: con.estado, slug: slugDe(con.ciudad) };
  return catalogo;
}

export async function leerConsulta(p: { giro?: string | null; servicio?: string | null; ciudad?: string | null; talla?: string | null }): Promise<ConsultaRango | null> {
  if (!esGiroMercado(p.giro)) return null;
  const s = servicioMercado(p.servicio ?? "");
  if (!s || s.giro !== p.giro) return null;
  const ciudad = await resolverCiudad(p.giro, p.ciudad);
  const talla = s.conTalla && esTalla(p.talla) ? p.talla : null;
  return { giro: p.giro, servicio: s.clave, ciudad, talla };
}

export async function rangoDe(c: ConsultaRango): Promise<Rango> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("precios_mercado_rangos", {
      p_giro: c.giro,
      p_servicio: c.servicio,
      p_ciudad: c.ciudad?.nombre ?? null,
      p_estado: c.ciudad?.estado ?? null,
      p_talla: c.talla,
    });
    if (error) throw new Error(error.message);
    return (data as Rango) ?? { nivel: "sin_datos", muestras: 0 };
  } catch (e) {
    console.error("[mercado] rangos", e instanceof Error ? e.message : e);
    return { nivel: "sin_datos", muestras: 0 };
  }
}

/** El resumen en una frase, el que se manda por WhatsApp y el que lee el bot. */
export function fraseDeRango(c: ConsultaRango, r: Rango, pesos: (n: number) => string, mes: string | null): string {
  const s = servicioMercado(c.servicio)!;
  const talla = c.talla ? ` de perro ${c.talla}` : "";
  const lugar = c.ciudad ? ` en ${c.ciudad.nombre}` : "";
  if (r.nivel === "sin_datos" || r.p25 == null || r.p75 == null || r.mediana == null) return `${s.nombre}${talla}${lugar}: todavía no juntamos suficientes precios para dar un rango. Se actualiza cada mes.`;
  const donde = r.nivel === "ciudad" ? `en ${r.lugar}` : r.nivel === "estado" ? `en el estado de ${r.lugar} (tu ciudad aún no junta ${TEXTO_MINIMO})` : `en México (tu ciudad y tu estado aún no juntan ${TEXTO_MINIMO})`;
  return `${s.nombre}${talla}: la mitad de los negocios ${donde} cobra entre ${pesos(r.p25)} y ${pesos(r.p75)} ${s.unidad} (mediana ${pesos(r.mediana)}, ${r.muestras} precios${r.negocios ? ` de ${r.negocios} negocios` : ""}${mes ? ` a ${mes}` : ""}).`;
}
