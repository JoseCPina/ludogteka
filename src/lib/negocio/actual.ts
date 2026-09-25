import { headers } from "next/headers";
import { ENCABEZADOS_NEGOCIO, type NegocioBasico } from "./resolver";

/**
 * El negocio de esta petición, como lo resolvió el middleware por el
 * dominio. En el servidor (páginas, acciones, rutas de API). Si no hay
 * (una ruta que el middleware no cubre), truena: mejor un error que
 * operar sin negocio.
 */
export async function negocioActual(): Promise<NegocioBasico> {
  const h = await headers();
  const id = h.get(ENCABEZADOS_NEGOCIO.id);
  if (!id) throw new Error("La petición no trae negocio (¿el middleware no la cubrió?).");
  return {
    id,
    slug: h.get(ENCABEZADOS_NEGOCIO.slug) ?? "",
    nombre: decodeURIComponent(h.get(ENCABEZADOS_NEGOCIO.nombre) ?? ""),
    dominio: h.get(ENCABEZADOS_NEGOCIO.dominio) || null,
    url_publica: h.get(ENCABEZADOS_NEGOCIO.url) || null,
    zona_horaria: h.get(ENCABEZADOS_NEGOCIO.zona) ?? "America/Mexico_City",
  };
}

export async function negocioIdActual(): Promise<string> {
  return (await negocioActual()).id;
}

/**
 * La dirección pública del negocio, para los links que se le mandan a
 * alguien (alta, complemento, restablecer contraseña, pagos):
 *   dirección propia → negocios.url_publica (https://www.ludogteka.mx)
 *   dominio propio   → https://<dominio>
 *   sin dominio      → https://<slug>.peludesk.com
 * En desarrollo, PELUDESK_URL_DESARROLLO con {slug} (p. ej.
 * "http://{slug}.localhost:3001").
 */
export function urlDelNegocio(n: Pick<NegocioBasico, "slug" | "dominio" | "url_publica">): string {
  const plantillaDev = process.env.PELUDESK_URL_DESARROLLO;
  if (plantillaDev) return plantillaDev.replace("{slug}", n.slug).replace(/\/$/, "");
  if (n.url_publica) return n.url_publica.replace(/\/$/, "");
  if (n.dominio) return `https://${n.dominio}`;
  return `https://${n.slug}.${(process.env.PELUDESK_DOMINIO ?? "peludesk.com").toLowerCase()}`;
}

export async function urlDelNegocioActual(): Promise<string> {
  return urlDelNegocio(await negocioActual());
}
