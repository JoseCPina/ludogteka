import type { MetadataRoute } from "next";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { headers } from "next/headers";
import { ENCABEZADO_PLATAFORMA } from "@/lib/negocio/resolver";
import { SITIO } from "@/lib/peludesk/seo";

// Rastreadores que arman la vista previa de un link (WhatsApp, Facebook,
// Instagram, X, LinkedIn, Slack, Telegram…). Nunca se bloquean, en ninguna
// ruta: un link a /alta/<token> o a la landing tiene que poder mostrar su
// imagen. Lo que no debe indexarse lleva noindex en el HTML, no aquí.
const VISTAS_PREVIAS = [
  "facebookexternalhit",
  "meta-externalagent",
  "meta-externalfetcher",
  "facebookcatalog",
  "WhatsApp",
  "Twitterbot",
  "LinkedInBot",
  "Slackbot",
  "Slack-ImgProxy",
  "TelegramBot",
  "Discordbot",
  "Pinterestbot",
];

// Íconos e imágenes de vista previa: se pueden pedir siempre.
const SIEMPRE_PUBLICO = [
  "/favicon.ico",
  "/icono-negocio", "/manifest.webmanifest",
  "/iconos/",
  "/opengraph-image",
  "/imagen-negocio",
  "/marca/",
  "/_next/",
];

// Pantallas con sesión o con datos de alguien.
const PRIVADAS = [
  "/login",
  "/alta",
  "/portal",
  "/admin",
  "/api",
  "/auth",
  "/sin-acceso",
  "/modulo-apagado",
  "/demo",
  "/plataforma",
  "/bienvenida",
  "/caja",
  "/clientes",
  "/contratos",
  "/empleados",
  "/estetica",
  "/gastos",
  "/guarderia",
  "/hotel",
  "/inventario",
  "/mi-trabajo",
  "/perros",
  "/recepcion",
  "/reportes",
  "/reservas",
  "/servicios",
  "/vinculacion",
  "/ayuda",
  "/veterinaria",
  "/e/",
  "/c/",
  "/rx/",
];

// Buscadores y asistentes de IA que SÍ pueden leer el sitio público de
// peludesk.mx. Cada uno lleva su propio grupo porque un rastreador que
// nombra su grupo ignora el de «*». Para entrenamiento (GPTBot, ClaudeBot,
// Google-Extended), búsqueda (OAI-SearchBot, Claude-SearchBot, PerplexityBot)
// y consultas de un usuario (ChatGPT-User, Claude-User, Perplexity-User).
const BUSCADORES_E_IA = [
  "Googlebot", "Google-Extended", "Bingbot", "Applebot", "Applebot-Extended", "DuckDuckBot",
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",
  "ClaudeBot", "Claude-SearchBot", "Claude-User",
  "PerplexityBot", "Perplexity-User",
];

// Lo privado o interno del dominio de la plataforma: ni se indexa ni se lee.
const PRIVADAS_PLATAFORMA = [
  "/plataforma", "/demo", "/peludesk/redes", "/api", "/auth",
  "/admin", "/portal", "/login", "/bienvenida", "/alta", "/activar",
  "/e/", "/c/", "/rx/", "/t/", "/r/", "/f/", "/fac/",
  // La vista previa de cada prospecto (/para/<slug>): solo se llega por el link que se le manda.
  "/para/",
];

// Solo la landing de un negocio con plan activo y landing propia es para
// buscadores. El demo (plan demo) y los negocios en prueba no se indexan.
// PeluDesk: la dirección es la del negocio del dominio.
export default async function robots(): Promise<MetadataRoute.Robots> {
  // En peludesk.mx (la plataforma) se indexa el sitio público —landing,
  // registro, ayuda, blog, aterrizajes y legales— y se excluye lo interno.
  const h = await headers();
  if (h.get(ENCABEZADO_PLATAFORMA) === "1") {
    return {
      rules: [
        { userAgent: VISTAS_PREVIAS, allow: "/" },
        { userAgent: BUSCADORES_E_IA, allow: "/", disallow: PRIVADAS_PLATAFORMA },
        { userAgent: "*", allow: "/", disallow: PRIVADAS_PLATAFORMA },
      ],
      sitemap: `${SITIO}/sitemap.xml`,
      host: SITIO,
    };
  }
  const negocio = await cargarNegocioLanding();
  const url = (negocio.landing?.url_publica ?? urlDelNegocio(negocio)).replace(/\/$/, "");
  const indexable = negocio.plan === "activo" && !!negocio.landing;
  return {
    rules: [
      { userAgent: VISTAS_PREVIAS, allow: "/" },
      indexable
        ? { userAgent: "*", allow: ["/", ...SIEMPRE_PUBLICO], disallow: PRIVADAS }
        : { userAgent: "*", allow: SIEMPRE_PUBLICO, disallow: "/" },
    ],
    ...(indexable ? { sitemap: `${url}/sitemap.xml`, host: url } : {}),
  };
}
