import type { MetadataRoute } from "next";
import { URL_PUBLICA } from "@/lib/landing/negocio";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${URL_PUBLICA}/`, changeFrequency: "monthly", priority: 1 }];
}
