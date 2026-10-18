import type { ReactNode } from "react";
import { detallesParaPagina, PLACES_URL, type FotoGoogle, type LugarParaPagina } from "@/lib/prospectos/places";
import type { ResenaWeb } from "@/components/web-negocio/pagina-web";

// Lo de Google para una página web: se pide al mostrarla y no se guarda (términos de Places: solo el place_id).
// Fuera de producción PLACES_API_URL puede apuntar a un doble (las auditorías); en producción se ignora.

export async function lugarDeGoogle(placeId: string | null | undefined, o: { fotos?: number; anchoFoto?: number } = {}): Promise<LugarParaPagina | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!placeId || !apiKey) return null;
  const url = process.env.VERCEL_ENV !== "production" ? process.env.PLACES_API_URL?.trim() || PLACES_URL : PLACES_URL;
  try {
    return await detallesParaPagina({ apiKey, id: placeId, url, fotos: o.fotos ?? 5, anchoFoto: o.anchoFoto ?? 1000 });
  } catch (e) {
    console.error("[web-negocio] google", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Las mejores reseñas para destacar: 4 o 5 estrellas, con texto que diga algo, hasta 3. */
export function resenasDestacadas(lugar: LugarParaPagina | null): ResenaWeb[] {
  if (!lugar) return [];
  return lugar.opiniones
    .filter((r) => r.calificacion >= 4 && r.texto.length >= 30)
    .sort((a, b) => b.calificacion - a.calificacion || Math.min(b.texto.length, 320) - Math.min(a.texto.length, 320))
    .slice(0, 3)
    .map((r) => ({ ...r, texto: r.texto.length > 420 ? `${r.texto.slice(0, 400).replace(/\s+\S*$/, "")}…` : r.texto }));
}

/** «Foto: <autor> · Google Maps», con el link al perfil de quien la tomó (lo piden los términos de Places). */
export function creditoFoto(f: FotoGoogle): ReactNode {
  return (
    <>
      Foto:{" "}
      {f.autores.map((a, k) => (
        <span key={k}>
          {k > 0 && ", "}
          {a.uri ? (
            <a href={a.uri} target="_blank" rel="noopener noreferrer" className="underline">
              {a.nombre}
            </a>
          ) : (
            a.nombre
          )}
        </span>
      ))}{" "}
      · Google Maps
    </>
  );
}

/** Fecha (AAAA-MM-DD) y minutos del día en una zona. */
export function hoyEn(zona: string): { fecha: string; minutos: number } {
  const p = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zona }).formatToParts(new Date());
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { fecha: `${v("year")}-${v("month")}-${v("day")}`, minutos: Number(v("hour")) * 60 + Number(v("minute")) };
}
