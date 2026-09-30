import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { ENCABEZADOS_NEGOCIO, ENCABEZADO_PLATAFORMA } from "@/lib/negocio/resolver";
import { SLUG_DEMO } from "@/lib/peludesk/landing";
import { SITIO } from "@/lib/peludesk/seo";

// Solo la landing es para buscadores. Todo lo demás pide sesión o es un
// link personal (alta por invitación), y no tiene nada que indexar.
// PeluDesk: la dirección es la del negocio del dominio.
//
// En peludesk.mx (la plataforma) se indexa el sitio público —landing, registro,
// ayuda, blog, aterrizajes y legales— y se excluye lo interno: /plataforma,
// /demo, /peludesk/redes (los videos, que también llevan X-Robots-Tag) y /api.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  if (h.get(ENCABEZADO_PLATAFORMA) === "1") {
    return {
      rules: { userAgent: "*", allow: "/", disallow: ["/plataforma", "/demo", "/peludesk/redes", "/api", "/auth"] },
      sitemap: `${SITIO}/sitemap.xml`,
      host: SITIO,
    };
  }
  // El demo no se indexa, ni su sitemap se publica.
  if (h.get(ENCABEZADOS_NEGOCIO.slug) === SLUG_DEMO) return { rules: { userAgent: "*", disallow: "/" } };
  const negocio = await cargarNegocioLanding();
  const url = (negocio.landing?.url_publica ?? urlDelNegocio(negocio)).replace(/\/$/, "");
  return {
    rules: { userAgent: "*", allow: ["/$", "/_next/", "/opengraph-image"], disallow: "/" },
    sitemap: `${url}/sitemap.xml`,
    host: url,
  };
}
