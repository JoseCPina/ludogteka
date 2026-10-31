import { conectarSalidaExtra, type EventoPixel } from "@/lib/peludesk/pixel-cliente";

/**
 * El tag de Google Ads en el navegador: el hueco está listo y se enciende solo cuando exista GOOGLE_ADS_ID (variable
 * del servidor; vacía hasta que la cuenta exista) Y la persona aceptó «Marketing». Recibe los MISMOS eventos que el
 * píxel de Meta (enviarEventoPixel los reparte): PageView → page_view, ViewContent → view_item, Lead → generate_lead,
 * InitiateCheckout → begin_checkout, CompleteRegistration → sign_up. Solo nombres de página o de contenido: ningún
 * dato de una persona ni de un negocio. Sin consentimiento no se pide nada a Google.
 */
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const NOMBRE_GADS: Record<EventoPixel, string> = { PageView: "page_view", ViewContent: "view_item", Lead: "generate_lead", InitiateCheckout: "begin_checkout", CompleteRegistration: "sign_up" };

let idCargado: string | null = null;
let activo = false;

export function activarGoogleAds(id: string) {
  if (typeof window === "undefined" || !id) return;
  activo = true;
  if (idCargado) {
    window.gtag?.("consent", "update", { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted", analytics_storage: "denied" });
    return;
  }
  idCargado = id;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  window.gtag("consent", "default", { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted", analytics_storage: "denied" });
  window.gtag("js", new Date());
  window.gtag("config", id, { send_page_view: true, allow_ad_personalization_signals: true });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);
  conectarSalidaExtra((nombre, datos) => {
    if (!activo || !window.gtag) return;
    window.gtag("event", NOMBRE_GADS[nombre], { send_to: id, content_name: datos?.content_name, content_category: datos?.content_category });
  });
}

export function desactivarGoogleAds() {
  activo = false;
  if (typeof window === "undefined" || !idCargado) return;
  window.gtag?.("consent", "update", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" });
  for (const nombre of ["_gcl_au", "_gcl_aw", "_gcl_dc"]) {
    document.cookie = `${nombre}=; Max-Age=0; Path=/`;
    document.cookie = `${nombre}=; Max-Age=0; Path=/; Domain=.${location.hostname.replace(/^www./, "")}`;
  }
}
