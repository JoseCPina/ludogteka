import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { esGiroMercado, esTalla, servicioMercado, type GiroMercado, type Rango, type Talla } from "./catalogo";
import { ciudadPorNombre, ciudadPorSlug, type CiudadMercado } from "./ciudades";

/**
 * Lectura de los rangos del Índice de precios (precios_mercado_rangos: p25, mediana y p75 de la ciudad, o del estado
 * o del país con menos de 8 muestras). Solo en el servidor, con la secret key (las tablas son de la plataforma: ningún
 * visitante las lee directo). Nunca lanza: sin base, «sin_datos».
 */
export type ConsultaRango = { giro: GiroMercado; servicio: string; ciudad: CiudadMercado | null; talla: Talla | null };

export function leerConsulta(p: { giro?: string | null; servicio?: string | null; ciudad?: string | null; talla?: string | null }): ConsultaRango | null {
  if (!esGiroMercado(p.giro)) return null;
  const s = servicioMercado(p.servicio ?? "");
  if (!s || s.giro !== p.giro) return null;
  const ciudad = p.ciudad ? (ciudadPorSlug(p.ciudad) ?? ciudadPorNombre(p.ciudad)) : null;
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

export type CiudadConDatos = { ciudad: string; estado: string; muestras: number; servicios: number; fecha: string };

/** Las ciudades con 8 muestras o más de un giro (las que tienen página propia). */
export async function ciudadesConDatos(giro: GiroMercado, minimo = 8): Promise<CiudadConDatos[]> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("precios_mercado_ciudades", { p_giro: giro, p_minimo: minimo });
    if (error) throw new Error(error.message);
    return ((data ?? []) as CiudadConDatos[]).map((x) => ({ ...x, muestras: Number(x.muestras), servicios: Number(x.servicios) }));
  } catch (e) {
    console.error("[mercado] ciudades", e instanceof Error ? e.message : e);
    return [];
  }
}

/** El resumen en una frase, el que se manda por WhatsApp y el que lee el bot. */
export function fraseDeRango(c: ConsultaRango, r: Rango, pesos: (n: number) => string, mes: string | null): string {
  const s = servicioMercado(c.servicio)!;
  const talla = c.talla ? ` de perro ${c.talla}` : "";
  const lugar = c.ciudad ? ` en ${c.ciudad.nombre}` : "";
  if (r.nivel === "sin_datos" || r.p25 == null || r.p75 == null || r.mediana == null) return `${s.nombre}${talla}${lugar}: todavía no juntamos suficientes precios para dar un rango. Se actualiza cada mes.`;
  const donde = r.nivel === "ciudad" ? `en ${r.lugar}` : r.nivel === "estado" ? `en el estado de ${r.lugar} (tu ciudad aún no junta 8 precios)` : "en México (tu ciudad y tu estado aún no juntan 8 precios)";
  return `${s.nombre}${talla}: la mitad de los negocios ${donde} cobra entre ${pesos(r.p25)} y ${pesos(r.p75)} ${s.unidad} (mediana ${pesos(r.mediana)}, ${r.muestras} precios${mes ? ` a ${mes}` : ""}).`;
}
