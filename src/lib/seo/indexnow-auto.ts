// IndexNow automático: de las URL del sitemap manda SOLO las nuevas o cambiadas. Sin imports a propósito (lo usa la
// tarea /api/cron/indexnow y lo prueba scripts/auditoria/indexnow-dev.mjs con dobles): la base, el sitio y IndexNow
// entran por parámetro.

export type Almacen = {
  /** URL → última huella avisada. */
  huellas(): Promise<Map<string, string>>;
  /** Anota las URL que IndexNow ya recibió (solo cuando respondió 200/202). */
  guardar(filas: { url: string; huella: string }[]): Promise<void>;
  /** Un renglón por envío, con su respuesta. */
  registrar(envio: Envio): Promise<void>;
};

export type Envio = {
  origen: "cron" | "manual";
  urls_total: number;
  urls_nuevas: number;
  urls_cambiadas: number;
  urls: string[];
  estado_http: number | null;
  respuesta: string;
  ok: boolean;
};

export type Opciones = {
  sitio: string; // https://peludesk.mx
  llave: string;
  apiUrl: string; // https://api.indexnow.org/IndexNow
  almacen: Almacen;
  origen: "cron" | "manual";
  fetch?: typeof fetch;
  concurrencia?: number;
};

export type Resultado = {
  estado: "sin_cambios" | "enviado" | "fallido" | "sitio_no_listo";
  revisadas: number;
  nuevas: number;
  cambiadas: number;
  no_leidas: number;
  http?: number | null;
};

/** Lo que una persona o un buscador lee de la página: título, descripción, datos estructurados y texto visible. */
export function huellaDeHtml(html: string): string {
  const un = (re: RegExp) => html.match(re)?.[1]?.trim() ?? "";
  const titulo = un(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descripcion = un(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || un(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const ld = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim()).join("|");
  const texto = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/i, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return sha256Hex(`${titulo}\n${descripcion}\n${ld}\n${texto}`);
}

// SHA-256 en JS puro: así el archivo no importa nada (corre igual en Node y en las pruebas).
function sha256Hex(texto: string): string {
  const k = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const datos = new TextEncoder().encode(texto);
  const largo = datos.length;
  const total = (((largo + 9 + 63) >> 6) << 6);
  const m = new Uint8Array(total);
  m.set(datos);
  m[largo] = 0x80;
  const vista = new DataView(m.buffer);
  vista.setUint32(total - 8, Math.floor((largo * 8) / 0x100000000));
  vista.setUint32(total - 4, (largo * 8) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rot = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < total; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = vista.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rot(w[t - 15], 7) ^ rot(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rot(w[t - 2], 17) ^ rot(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const t1 = (hh + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + k[t] + w[t]) >>> 0;
      const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return [...h].map((x) => x.toString(16).padStart(8, "0")).join("");
}

async function conTope<T>(tareas: (() => Promise<T>)[], concurrencia: number): Promise<T[]> {
  const salida: T[] = new Array(tareas.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrencia, tareas.length) }, async () => {
      while (i < tareas.length) {
        const n = i++;
        salida[n] = await tareas[n]();
      }
    })
  );
  return salida;
}

export async function correrIndexNow(o: Opciones): Promise<Resultado> {
  const pedir = o.fetch ?? fetch;
  const sitio = o.sitio.replace(/\/$/, "");
  const vacio: Resultado = { estado: "sitio_no_listo", revisadas: 0, nuevas: 0, cambiadas: 0, no_leidas: 0 };

  // El archivo de llave tiene que estar en producción: IndexNow lo lee para comprobar que el sitio es nuestro.
  const archivo = await pedir(`${sitio}/indexnow-key.txt`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!archivo?.ok || (await archivo.text()).trim() !== o.llave) return vacio;
  const mapa = await pedir(`${sitio}/sitemap.xml`, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!mapa?.ok) return vacio;
  const urls = [...new Set([...(await mapa.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()))];
  if (urls.length === 0) return vacio;

  const leidas = await conTope(
    urls.map((url) => async () => {
      try {
        const r = await pedir(url, { signal: AbortSignal.timeout(20_000), redirect: "follow" });
        if (!r.ok) return null;
        return { url, huella: huellaDeHtml(await r.text()) };
      } catch {
        return null;
      }
    }),
    o.concurrencia ?? 6
  );
  const buenas = leidas.filter((x): x is { url: string; huella: string } => x !== null);
  const noLeidas = urls.length - buenas.length;

  const antes = await o.almacen.huellas();
  const nuevas = buenas.filter((x) => !antes.has(x.url));
  const cambiadas = buenas.filter((x) => antes.has(x.url) && antes.get(x.url) !== x.huella);
  const aEnviar = [...nuevas, ...cambiadas];
  if (aEnviar.length === 0) return { estado: "sin_cambios", revisadas: buenas.length, nuevas: 0, cambiadas: 0, no_leidas: noLeidas };

  let http: number | null = null;
  let respuesta = "";
  let ok = true;
  for (let i = 0; i < aEnviar.length; i += 9000) {
    const lote = aEnviar.slice(i, i + 9000).map((x) => x.url);
    try {
      const r = await pedir(o.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ host: new URL(sitio).host, key: o.llave, keyLocation: `${sitio}/indexnow-key.txt`, urlList: lote }),
        signal: AbortSignal.timeout(30_000),
      });
      http = r.status;
      respuesta = (await r.text().catch(() => "")).slice(0, 500) || `HTTP ${r.status}`;
      if (![200, 202].includes(r.status)) ok = false;
    } catch (e) {
      ok = false;
      respuesta = `Sin respuesta: ${e instanceof Error ? e.message : "error de red"}`.slice(0, 500);
    }
    if (!ok) break;
  }

  await o.almacen.registrar({
    origen: o.origen,
    urls_total: aEnviar.length,
    urls_nuevas: nuevas.length,
    urls_cambiadas: cambiadas.length,
    urls: aEnviar.map((x) => x.url),
    estado_http: http,
    respuesta,
    ok,
  });
  // Solo lo que IndexNow recibió se da por avisado: si falló, la siguiente hora lo vuelve a intentar.
  if (ok) await o.almacen.guardar(aEnviar);
  return { estado: ok ? "enviado" : "fallido", revisadas: buenas.length, nuevas: nuevas.length, cambiadas: cambiadas.length, no_leidas: noLeidas, http };
}
