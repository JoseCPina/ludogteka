/**
 * La sesión que el middleware YA comprobó, firmada, para que el layout y la página no vuelvan a preguntarle a Auth ni a
 * la base en la misma petición (fix/layout-cascaron, 3 de noviembre de 2026; docs/rendimiento-panel.md, quinta vuelta).
 *
 * El middleware valida la sesión con `getUserConReintento` (la única puerta) y lee la membresía con `sesion_actual()`
 * en CADA petición; solo si la ruta pasó todas sus revisiones pone el encabezado `x-peludesk-sesion` en la petición
 * hacia la app (nunca en la respuesta). Un encabezado con ese nombre que llegue de afuera se tira antes.
 *
 * No se puede falsificar ni reutilizar:
 *   · firma HMAC-SHA256 con una llave derivada de la secret key de Supabase (solo existe en el servidor);
 *   · caduca a los 15 segundos (vive lo que tarda en pintarse la petición que la trae);
 *   · ligada a la persona (id de Auth), al negocio de la petición, al área de sesión (personal o portal) y a la HUELLA
 *     de la cookie de sesión de esa misma petición: con otra cookie (otra persona, otra sesión o un token renovado) no
 *     cuadra y el servidor pregunta como siempre.
 * Un cambio de rol o la baja de un empleado se respetan de inmediato: la firma no guarda nada entre peticiones; cada
 * petición vuelve a leer la membresía en el middleware. Y no autoriza nada por sí misma: la base sigue revisando rol,
 * permiso y negocio en cada consulta con el JWT.
 * Prueba: `permisos-pantalla-dev.mjs` (sección «Sesión firmada»; `--solo-sesion` la corre sola).
 */
export const ENCABEZADO_SESION = "x-peludesk-sesion";
const VIGENCIA_MS = 15_000;

export type DatosSesion = Record<string, unknown>;
export type SesionFirmada = {
  u: string; // id de la persona (Auth)
  e: string | null; // correo
  c: boolean; // debe cambiar la contraseña (app_metadata)
  n: string; // negocio de la petición
  a: string; // área de sesión (personal o portal)
  k: string; // huella de la cookie de sesión
  t: number; // cuándo se firmó
  s: DatosSesion | null; // lo que devolvió sesion_actual()
};

let llave: Promise<CryptoKey> | null = null;
function llaveHmac(): Promise<CryptoKey> {
  llave ??= (async () => {
    const secreto = process.env.SUPABASE_SECRET_KEY;
    if (!secreto) throw new Error("Falta SUPABASE_SECRET_KEY para firmar la sesión.");
    const base = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`peludesk-sesion|${secreto}`));
    return crypto.subtle.importKey("raw", base, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  })();
  return llave;
}

const aB64 = (s: string) => {
  let bin = "";
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const deB64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0)));
const aHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const firmar = async (cuerpo: string) => aHex(await crypto.subtle.sign("HMAC", await llaveHmac(), new TextEncoder().encode(cuerpo)));

/** Prefijo de la cookie de sesión del área (la misma regla que el middleware y `src/lib/supabase/area.ts`). */
export function prefijoCookieSesion(nombreDelArea: string | null | undefined): string {
  return nombreDelArea ?? `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0]}-auth-token`;
}

/** Huella de la cookie de sesión (todas sus partes, en orden): liga la firma a la sesión de ESTA petición. */
export async function huellaDeCookies(cookies: { name: string; value: string }[], prefijo: string): Promise<string> {
  const partes = cookies
    .filter((c) => c.name === prefijo || c.name.startsWith(`${prefijo}.`))
    .sort((x, y) => x.name.localeCompare(y.name))
    .map((c) => `${c.name}=${c.value}`)
    .join(";");
  if (!partes) return "";
  return aHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(partes))).slice(0, 32);
}

export async function firmarSesion(datos: Omit<SesionFirmada, "t">): Promise<string> {
  const cuerpo = aB64(JSON.stringify({ ...datos, t: Date.now() }));
  return `${cuerpo}.${await firmar(cuerpo)}`;
}

export async function leerSesionFirmada(
  valor: string | null,
  esperado: { negocioId: string | null; area: string | null; huella: string },
): Promise<SesionFirmada | null> {
  if (!valor || !esperado.negocioId || !esperado.huella) return null;
  const punto = valor.lastIndexOf(".");
  if (punto < 1) return null;
  const cuerpo = valor.slice(0, punto);
  const firma = valor.slice(punto + 1);
  if (!/^[0-9a-f]{64}$/.test(firma)) return null;
  const esperada = await firmar(cuerpo);
  // Comparación de largo fijo sin cortar en la primera diferencia.
  let dif = 0;
  for (let i = 0; i < 64; i++) dif |= esperada.charCodeAt(i) ^ firma.charCodeAt(i);
  if (dif !== 0) return null;
  try {
    const d = JSON.parse(deB64(cuerpo)) as SesionFirmada;
    if (!d.u || typeof d.t !== "number") return null;
    if (d.n !== esperado.negocioId || d.a !== (esperado.area ?? "personal") || d.k !== esperado.huella) return null;
    const edad = Date.now() - d.t;
    if (edad < -1_000 || edad > VIGENCIA_MS) return null;
    return d;
  } catch {
    return null;
  }
}
