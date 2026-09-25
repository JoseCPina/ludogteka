/**
 * De qué negocio es una petición, por el dominio con el que entró.
 *
 *   ludogteka.mx, www.ludogteka.mx      → dominio propio "ludogteka.mx"
 *   ludogteka.peludesk.mx              → slug "ludogteka"
 *   huellitas.localhost:3001            → slug "huellitas" (desarrollo)
 *   localhost, 127.0.0.1, *.vercel.app  → el negocio por omisión
 *                                          (NEGOCIO_POR_OMISION, "ludogteka")
 *
 * Solo decide QUÉ buscar; la base dice si existe (negocio_por_host).
 */
export type Busqueda = { slug: string | null; dominio: string | null };

export const DOMINIO_PLATAFORMA = (process.env.PELUDESK_DOMINIO ?? "peludesk.mx").toLowerCase();
export const NEGOCIO_POR_OMISION = (process.env.NEGOCIO_POR_OMISION ?? "ludogteka").toLowerCase();

// Subdominios de la plataforma que no son negocios (la base tampoco deja
// usarlos de slug).
export const SLUGS_RESERVADOS = new Set(["www", "app", "api", "admin", "mail", "static", "plataforma", "soporte", "demo", "registro", "ayuda", "blog", "precios"]);
const RESERVADOS = SLUGS_RESERVADOS;

/**
 * ¿Es el dominio de la PLATAFORMA (la administración de PeluDesk)?
 *   peludesk.mx, www.peludesk.mx, app.peludesk.mx → sí
 *   plataforma.localhost                             → sí (desarrollo)
 * Más dominios: PELUDESK_HOSTS_PLATAFORMA (separados por coma).
 */
export function esHostPlataforma(hostCrudo: string | null | undefined): boolean {
  const host = (hostCrudo ?? "").toLowerCase().split(":")[0].trim().replace(/\.$/, "");
  const extra = (process.env.PELUDESK_HOSTS_PLATAFORMA ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return (
    host === DOMINIO_PLATAFORMA ||
    host === `www.${DOMINIO_PLATAFORMA}` ||
    host === `app.${DOMINIO_PLATAFORMA}` ||
    host === "plataforma.localhost" ||
    extra.includes(host)
  );
}

export function busquedaPorHost(hostCrudo: string | null | undefined): Busqueda | null {
  const host = (hostCrudo ?? "").toLowerCase().split(":")[0].trim().replace(/\.$/, "");
  if (!host) return { slug: NEGOCIO_POR_OMISION, dominio: null };

  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app")) {
    return { slug: NEGOCIO_POR_OMISION, dominio: null };
  }
  if (host.endsWith(".localhost")) {
    return { slug: host.slice(0, -".localhost".length).split(".").pop() ?? null, dominio: null };
  }
  if (host === DOMINIO_PLATAFORMA) return null;
  if (host.endsWith(`.${DOMINIO_PLATAFORMA}`)) {
    const sub = host.slice(0, -(DOMINIO_PLATAFORMA.length + 1));
    if (!sub || sub.includes(".") || RESERVADOS.has(sub)) return null;
    return { slug: sub, dominio: null };
  }
  return { slug: null, dominio: host.replace(/^www\./, "") };
}
