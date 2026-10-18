import sharp from "sharp";
import { hexAHsl, hslAHex } from "./tema";

/**
 * El color con más presencia y viveza de una foto: se reduce a 24×24, se agrupan los pixeles por matiz (12
 * cubetas) descartando grises, casi blancos y casi negros, y gana la cubeta con más peso (cantidad × saturación).
 * Lo de Google se lee al mostrar la página y no se guarda; el color que sale es nuestro (se puede guardar como el
 * color de su página al registrarse). Sin foto o con una foto gris: null.
 */
export async function colorDeFoto(url: string | null | undefined, topeMs = 2500): Promise<string | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(topeMs), cache: "no-store" });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const { data, info } = await sharp(buf).resize(24, 24, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const cubetas = Array.from({ length: 12 }, () => ({ peso: 0, h: 0, s: 0, l: 0, n: 0 }));
    for (let i = 0; i < data.length; i += info.channels) {
      const hex = "#" + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("");
      const c = hexAHsl(hex);
      if (c.s < 22 || c.l < 14 || c.l > 88) continue;
      const k = Math.floor(c.h / 30) % 12;
      const b = cubetas[k];
      const w = c.s / 100;
      b.peso += w;
      b.h += c.h * w;
      b.s += c.s * w;
      b.l += c.l * w;
      b.n++;
    }
    const mejor = cubetas.reduce((a, b) => (b.peso > a.peso ? b : a));
    if (mejor.n < 6) return null;
    return hslAHex({ h: mejor.h / mejor.peso, s: mejor.s / mejor.peso, l: mejor.l / mejor.peso });
  } catch {
    return null;
  }
}

/** Para sacar el color basta una foto chica: las URL de fotos de Google aceptan el ancho al final («=w96»). */
export const fotoChica = (uri: string | undefined | null) =>
  uri && /=([a-z]\d+)(-[a-z]\d+)*$/.test(uri) ? uri.replace(/=([a-z]\d+)(-[a-z]\d+)*$/, "=w96") : uri;
