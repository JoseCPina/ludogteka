import type { MetadataRoute } from "next";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { urlDelNegocio } from "@/lib/negocio/actual";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const negocio = await cargarNegocioLanding();
  const url = (negocio.landing?.url_publica ?? urlDelNegocio(negocio)).replace(/\/$/, "");
  return [{ url: `${url}/`, changeFrequency: "monthly", priority: 1 }];
}
