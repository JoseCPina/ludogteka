// Comparación visual con tolerancia entre una pantalla VIVA y un fotograma GRABADO de un video tutorial.
//
// Qué tolera: compresión del video, antialiasing, el cursor y el resaltado del grabador, la etiqueta del paso
// (se enmascara), y los datos que cambian solos (una fecha, una hora, un contador): son manchas CHICAS y
// aisladas. Qué marca: una mancha GRANDE (una sección, un banner, una tarjeta, una columna que aparece o
// desaparece, texto movido porque algo se insertó arriba) o muchas manchas repartidas.
//
// Cómo: las dos imágenes se llevan a 960×540 en grises, se desenfocan un poco, se normalizan (media 0,
// desviación 1: absorbe el rango limitado del video) y se comparan por bloques de 24 px. Un bloque «difiere» si
// su diferencia media pasa el umbral; los bloques vecinos se juntan en manchas.
import { spawnSync } from "node:child_process";
import sharp from "sharp";

export const W = 960;
export const H = 540;
export const BLUR = Number(process.env.VIS_BLUR ?? 0.8);
export const TOL = 3;
export const BLOQUE = 24;
export const COLS = W / BLOQUE; // 40
export const FILAS = Math.ceil(H / BLOQUE); // 23 (la última, parcial)

// Umbrales (calibrados con los videos reales; ver README). Se pueden ajustar con --sensibilidad.
export const UMBRALES = {
  tinta: Number(process.env.VIS_TINTA ?? 0.02), // borde medio normalizado para considerar que un bloque «tiene tinta»
  brillo: Number(process.env.VIS_BRILLO ?? 0.1), // cambio de brillo medio (en desviaciones) que cuenta como un fondo nuevo
  mancha: Number(process.env.VIS_MANCHA ?? 12), // bloques juntos que hacen una mancha de diseño (una fecha o un contador ocupan 1 a 4)
  fraccion: 0.05, // o: fracción de la pantalla con bloques distintos, aunque estén sueltos
};

/** Máscara de lo que el grabador dibuja encima: la etiqueta del paso (arriba al centro). true = se ignora. */
function enmascarado(x, y) {
  return y < 40 && x > W * 0.18 && x < W * 0.82;
}

function normalizar(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  const m = s / a.length;
  let v = 0;
  for (let i = 0; i < a.length; i++) v += (a[i] - m) ** 2;
  const d = Math.sqrt(v / a.length) || 1;
  const o = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = (a[i] - m) / d;
  return o;
}

/** PNG/JPG (buffer) → grises normalizados W×H, desenfocados. */
export async function grisDe(buffer, { w = W, h = H, z = false } = {}) {
  const { data } = await sharp(buffer).resize(w, h, { fit: "fill", kernel: "lanczos3" }).greyscale().blur(BLUR).raw().toBuffer({ resolveWithObject: true });
  // Con z: media 0 y desviación 1 (para BUSCAR el fotograma parecido). Sin z: de 0 a 1 en valores absolutos (para comparar:
  // el brillo de un fondo y el borde del texto no dependen de qué más haya en la pantalla).
  if (z) return normalizar(Uint8Array.from(data));
  return Float32Array.from(data, (x) => x / 255);
}

/** Diferencia media (sin la máscara) entre dos grises del mismo tamaño: sirve para buscar el fotograma más parecido. */
export function distancia(a, b, w, h) {
  let s = 0, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (enmascarado((x * W) / w, (y * H) / h)) continue;
      s += Math.abs(a[y * w + x] - b[y * w + x]);
      n++;
    }
  }
  return s / n;
}

/** Fotogramas de [desde, hasta] segundos del master, a `fps`, en grises normalizados de w×h. */
export function fotogramasGris(master, { desde = 0, hasta = null, fps = 2, w = 480, h = 270 } = {}) {
  const args = ["-hide_banner", "-loglevel", "error", ...(desde ? ["-ss", String(desde)] : []), "-i", master, ...(hasta ? ["-t", String(Math.max(0.1, hasta - desde))] : []), "-an", "-vf", `fps=${fps},scale=${w}:${h}:flags=area,gblur=sigma=0.8,format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "-"];
  const r = spawnSync("ffmpeg", args, { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr?.toString().slice(0, 300)}`);
  const buf = r.stdout;
  const tam = w * h;
  const n = Math.floor(buf.length / tam);
  const sal = [];
  for (let i = 0; i < n; i++) sal.push({ t: desde + i / fps, gris: normalizar(Uint8Array.from(buf.subarray(i * tam, (i + 1) * tam))) });
  return sal;
}

/** Un fotograma del master en el segundo `t`, como PNG a color de W×H. */
export function fotogramaPng(master, t) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", String(Math.max(0, t)), "-i", master, "-frames:v", "1", "-an", "-vf", `scale=${W}:${H}:flags=area`, "-f", "image2pipe", "-c:v", "png", "-"], { maxBuffer: 1 << 26 });
  if (r.status !== 0 || !r.stdout.length) throw new Error(`ffmpeg: no pude sacar el fotograma ${t}`);
  return r.stdout;
}

/** Por bloque: cuánta «tinta» hay (borde medio) y el brillo medio. Es lo que se compara: la ESTRUCTURA de la pantalla. */
function mapas(g) {
  const ocupa = new Float32Array(COLS * FILAS);
  const brillo = new Float32Array(COLS * FILAS);
  const valido = new Uint8Array(COLS * FILAS);
  for (let by = 0; by < FILAS; by++) {
    for (let bx = 0; bx < COLS; bx++) {
      let gr = 0, br = 0, n = 0;
      for (let y = by * BLOQUE; y < Math.min(H - 1, (by + 1) * BLOQUE); y++) {
        for (let x = bx * BLOQUE; x < Math.min(W - 1, (bx + 1) * BLOQUE); x++) {
          if (enmascarado(x, y)) continue;
          const i = y * W + x;
          gr += Math.abs(g[i + 1] - g[i]) + Math.abs(g[i + W] - g[i]);
          br += g[i];
          n++;
        }
      }
      if (n < BLOQUE * 4) continue;
      const k = by * COLS + bx;
      valido[k] = 1;
      ocupa[k] = gr / n;
      brillo[k] = br / n;
    }
  }
  return { ocupa, brillo, valido };
}

/**
 * Compara la estructura de dos pantallas (grises W×H). Un bloque «difiere» si:
 *  · tiene tinta en una y no hay ninguna en los bloques vecinos de la otra (algo apareció o desapareció: una
 *    sección, un botón, una columna, un aviso). Un texto que cambia de palabras pero sigue siendo una línea de
 *    texto (una fecha, un contador, un nombre) ocupa lo mismo y NO cuenta; o
 *  · su brillo medio cambió mucho (un fondo de color nuevo, una tarjeta oscura).
 */
export function compararBloques(a, b, umbrales = UMBRALES) {
  const A = mapas(a), B = mapas(b);
  // El resaltado del grabador atenúa TODA la pantalla menos un recuadro: se quita el tono general (brillo y contraste) de una
  // respecto a la otra antes de comparar, para que solo cuente lo que cambió de un lado y no del otro.
  const mediana = (xs) => { xs.sort((m, n) => m - n); return xs.length ? xs[Math.floor(xs.length / 2)] : null; };
  const razones = [], deltas = [];
  for (let k = 0; k < A.valido.length; k++) {
    if (!A.valido[k] || !B.valido[k]) continue;
    deltas.push(B.brillo[k] - A.brillo[k]);
    if (A.ocupa[k] > umbrales.tinta * 2 && B.ocupa[k] > umbrales.tinta * 2) razones.push(A.ocupa[k] / B.ocupa[k]);
  }
  const ganancia = Math.min(3, Math.max(0.33, mediana(razones) ?? 1));
  const desvio = mediana(deltas) ?? 0;
  for (let k = 0; k < B.ocupa.length; k++) { B.ocupa[k] *= ganancia; B.brillo[k] -= desvio; }
  const dif = new Uint8Array(COLS * FILAS);
  const T = umbrales.tinta;
  const vecino = (M, bx, by) => {
    let m = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = bx + dx, y = by + dy;
      if (x < 0 || y < 0 || x >= COLS || y >= FILAS) continue;
      m = Math.max(m, M.ocupa[y * COLS + x]);
    }
    return m;
  };
  let validos = 0;
  for (let by = 0; by < FILAS; by++) {
    for (let bx = 0; bx < COLS; bx++) {
      const k = by * COLS + bx;
      if (!A.valido[k] || !B.valido[k]) continue;
      validos++;
      const solaA = A.ocupa[k] > T && vecino(B, bx, by) < T * 0.5;
      const solaB = B.ocupa[k] > T && vecino(A, bx, by) < T * 0.5;
      if (solaA || solaB || Math.abs(A.brillo[k] - B.brillo[k]) > umbrales.brillo) dif[k] = 1;
    }
  }

  // Manchas: bloques distintos vecinos (8 direcciones).
  const visto = new Uint8Array(dif.length);
  const manchas = [];
  for (let i = 0; i < dif.length; i++) {
    if (!dif[i] || visto[i]) continue;
    const pila = [i];
    visto[i] = 1;
    let n = 0, x0 = COLS, y0 = FILAS, x1 = 0, y1 = 0;
    while (pila.length) {
      const k = pila.pop();
      const x = k % COLS, y = Math.floor(k / COLS);
      n++;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= FILAS) continue;
          const j = ny * COLS + nx;
          if (dif[j] && !visto[j]) { visto[j] = 1; pila.push(j); }
        }
      }
    }
    manchas.push({ bloques: n, caja: { x: x0 * BLOQUE, y: y0 * BLOQUE, w: (x1 - x0 + 1) * BLOQUE, h: (y1 - y0 + 1) * BLOQUE } });
  }
  manchas.sort((p, q) => q.bloques - p.bloques);
  const total = dif.reduce((s, x) => s + x, 0);
  const fraccion = validos ? total / validos : 0;
  const grande = manchas[0]?.bloques ?? 0;
  const cambio = grande >= umbrales.mancha || fraccion >= umbrales.fraccion;
  return { cambio, manchaMayor: grande, bloquesDistintos: total, fraccion: Number(fraccion.toFixed(4)), manchas: manchas.slice(0, 8) };
}

/** Imagen para revisar rápido: grabado | vivo | vivo con las manchas marcadas. */
export async function imagenDiferencia({ grabadoPng, vivoPng, manchas, titulo }) {
  const grab = await sharp(grabadoPng).resize(W, H).png().toBuffer();
  const vivo = await sharp(vivoPng).resize(W, H).png().toBuffer();
  const cajas = manchas
    .filter((m) => m.bloques >= 2)
    .map((m) => `<rect x="${m.caja.x}" y="${m.caja.y}" width="${m.caja.w}" height="${m.caja.h}" fill="rgba(255,40,40,0.18)" stroke="#ff2d2d" stroke-width="3"/>`)
    .join("");
  const svg = (t) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${t}</svg>`);
  const marcado = await sharp(vivo).composite([{ input: svg(cajas), top: 0, left: 0 }]).png().toBuffer();
  const rotulo = (txt) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="34"><rect width="${W}" height="34" fill="#2b2447"/><text x="12" y="23" font-family="Arial" font-size="18" fill="#fff">${txt.replace(/&/g, "y").replace(/</g, "").slice(0, 110)}</text></svg>`);
  const lienzo = sharp({ create: { width: W * 3 + 20, height: H + 34, channels: 3, background: "#ffffff" } });
  return lienzo
    .composite([
      { input: rotulo("En el video grabado"), top: 0, left: 0 },
      { input: grab, top: 34, left: 0 },
      { input: rotulo("Hoy en la app (el demo)"), top: 0, left: W + 10 },
      { input: vivo, top: 34, left: W + 10 },
      { input: rotulo(titulo ?? "Diferencias marcadas"), top: 0, left: (W + 10) * 2 },
      { input: marcado, top: 34, left: (W + 10) * 2 },
    ])
    .jpeg({ quality: 82 })
    .toBuffer();
}
