import { unstable_cache } from "next/cache";
import { lugarDeGoogle } from "@/lib/web-negocio/google";
import type { LugarParaPagina } from "@/lib/prospectos/places";

/**
 * Lo de Google para una ficha del directorio: igual que /para (al mostrarla, con atribución, sin guardarse), pero
 * (1) solo para personas —un rastreador recibe la ficha con lo del CRM, porque indexar miles de fichas pidiendo Place
 * Details por cada una costaría cientos de dólares al día— y (2) recordado dos horas por lugar en la caché de datos de
 * Next (las URL temporales de las fotos no duran más).
 */
const ROBOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|facebot|whatsapp|telegram|twitter|discord|linkedin|skype|curl|wget|python|node-fetch|axios|go-http|java\/|lighthouse|headless/i;

const enCache = unstable_cache(async (placeId: string) => lugarDeGoogle(placeId, { fotos: 5, anchoFoto: 1000 }), ["directorio-lugar-google"], { revalidate: 7200 });

export async function lugarDeGoogleParaFicha(placeId: string | null | undefined, navegador: string | null): Promise<LugarParaPagina | null> {
  if (!placeId || !navegador || ROBOT.test(navegador)) return null;
  try {
    return await enCache(placeId);
  } catch (e) {
    console.error("[directorio] google", e instanceof Error ? e.message : e);
    return null;
  }
}
