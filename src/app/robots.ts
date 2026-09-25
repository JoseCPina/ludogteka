import type { MetadataRoute } from "next";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { urlDelNegocio } from "@/lib/negocio/actual";

// Solo la landing es para buscadores. Todo lo demás pide sesión o es un
// link personal (alta por invitación), y no tiene nada que indexar.
// PeluDesk: la dirección es la del negocio del dominio.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const negocio = await cargarNegocioLanding();
  const url = (negocio.landing?.url_publica ?? urlDelNegocio(negocio)).replace(/\/$/, "");
  return {
    rules: { userAgent: "*", allow: ["/$", "/_next/", "/opengraph-image"], disallow: "/" },
    sitemap: `${url}/sitemap.xml`,
    host: url,
  };
}
