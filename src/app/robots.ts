import type { MetadataRoute } from "next";
import { URL_PUBLICA } from "@/lib/landing/negocio";

// Solo la landing es para buscadores. Todo lo demás pide sesión o es un
// link personal (alta por invitación), y no tiene nada que indexar.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/$", "/_next/", "/opengraph-image"], disallow: "/" },
    sitemap: `${URL_PUBLICA}/sitemap.xml`,
    host: URL_PUBLICA,
  };
}
