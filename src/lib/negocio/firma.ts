import type { NegocioBasico } from "./resolver";

/**
 * Firma de los encabezados de negocio que pone el middleware.
 *
 * Por qué existe: cuando una acción de servidor termina en redirect(), Next
 * pide la página de destino POR DENTRO, a su propio origen (`initURL`: en
 * `next start` es localhost), reenviando los encabezados de la petición
 * original. Esa petición interna llega con Host = localhost; resuelta por
 * host, caería en el negocio por omisión y el personal de otro negocio
 * vería la marca equivocada o terminaría en /sin-acceso.
 *
 * El middleware SIEMPRE tira los x-negocio-* que llegan de afuera (el
 * negocio lo decide el dominio). La excepción es esta: si traen la firma
 * del propio middleware y cuadra, son los que él mismo puso en la petición
 * original y se respetan. La firma es HMAC con una llave derivada de la
 * secret key de Supabase, que solo existe en el servidor; los encabezados
 * firmados viajan en la petición hacia la app, nunca en la respuesta.
 *
 * Aun sin esto nada se abriría: el encabezado de negocio no autoriza (lo
 * decide la membresía). La firma evita la confusión, no un acceso.
 */
export const ENCABEZADO_FIRMA = "x-negocio-firma";

let llave: Promise<CryptoKey> | null = null;
function llaveHmac(): Promise<CryptoKey> {
  llave ??= (async () => {
    const secreto = process.env.SUPABASE_SECRET_KEY;
    if (!secreto) throw new Error("Falta SUPABASE_SECRET_KEY para firmar el negocio.");
    const base = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`peludesk-negocio|${secreto}`));
    return crypto.subtle.importKey("raw", base, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  })();
  return llave;
}

function contenido(n: NegocioBasico): string {
  return [n.id, n.slug, n.nombre, n.dominio ?? "", n.url_publica ?? "", n.zona_horaria].join("|");
}

const aHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function firmarNegocio(n: NegocioBasico): Promise<string> {
  return aHex(await crypto.subtle.sign("HMAC", await llaveHmac(), new TextEncoder().encode(contenido(n))));
}

export async function firmaValida(n: NegocioBasico, firma: string | null): Promise<boolean> {
  if (!firma || !/^[0-9a-f]{64}$/.test(firma)) return false;
  const esperada = await firmarNegocio(n);
  // Comparación de largo fijo sin cortar en la primera diferencia.
  let dif = 0;
  for (let i = 0; i < esperada.length; i++) dif |= esperada.charCodeAt(i) ^ firma.charCodeAt(i);
  return dif === 0;
}
