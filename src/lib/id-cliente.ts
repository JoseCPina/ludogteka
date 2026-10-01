let contador = 0;

/**
 * Un id para claves de listas en pantalla (NO es un identificador de
 * seguridad). `crypto.randomUUID` solo existe en páginas seguras (https o
 * localhost) y en navegadores recientes (iOS 15.4+): abriendo la app por
 * http://<ip-de-la-red> o en un iPhone viejo truena. Cae a getRandomValues
 * y, en último caso, a Date.now() + Math.random().
 */
export function idCliente(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  contador += 1;
  return `id-${Date.now().toString(36)}-${contador}-${Math.random().toString(36).slice(2, 10)}`;
}
