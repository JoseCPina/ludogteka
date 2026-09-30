import { EVENTO_CONSENTIMIENTO } from "@/lib/peludesk/cookies";

/**
 * El píxel de Meta en el navegador. Solo peludesk.mx y solo con el
 * consentimiento de marketing: `cargarPixel` no se llama antes, así que
 * connect.facebook.net ni siquiera se pide.
 *
 * Lo único que sale hacia Meta son los eventos de abajo, con nombre de
 * página o de contenido: ningún dato de un negocio ni de sus clientes, ni el
 * teléfono ni el nombre de quien se registra (no se manda ni con «advanced
 * matching»: autoConfig apagado y sin datos de usuario).
 *
 * Los eventos que se piden antes de que el píxel exista (la página se pinta
 * antes de que la persona acepte) esperan en memoria y salen, en orden, en
 * cuanto se carga. Si rechaza, se tiran. Nada se guarda en el navegador.
 */
type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue: unknown[][]; loaded: boolean; version: string; push: unknown };
declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

export type EventoPixel = "PageView" | "ViewContent" | "Lead" | "InitiateCheckout" | "CompleteRegistration";
type Pendiente = { nombre: EventoPixel; datos?: Record<string, string | number>; eventId?: string };

const MAX_COLA = 25;
let cola: Pendiente[] = [];
let idCargado: string | null = null;
// activo: el píxel está cargado Y la persona lo permite ahora.
// bloqueado: la persona ya dijo que no; no sale nada ni se guarda nada en cola.
let activo = false;
let bloqueado = false;

function llamar(p: Pendiente) {
  if (!window.fbq) return;
  if (p.eventId) window.fbq("track", p.nombre, p.datos ?? {}, { eventID: p.eventId });
  else window.fbq("track", p.nombre, p.datos ?? {});
}

/** Pide un evento: sale ya si el píxel está cargado, o cuando se cargue. */
export function enviarEventoPixel(nombre: EventoPixel, datos?: Record<string, string | number>, eventId?: string) {
  if (typeof window === "undefined") return;
  if (bloqueado) return;
  const p = { nombre, datos, eventId };
  if (activo) return llamar(p);
  if (cola.length < MAX_COLA) cola.push(p);
}

export function pixelCargado(): boolean {
  return activo;
}

/** Marketing aceptado: carga el píxel (la primera vez) o lo vuelve a permitir, y suelta lo que esperaba. */
export function activarPixel(id: string) {
  if (typeof window === "undefined") return;
  bloqueado = false;
  if (idCargado) {
    if (activo) return;
    activo = true;
    window.fbq?.("consent", "grant");
    const pendientes = cola;
    cola = [];
    for (const p of pendientes) llamar(p);
    return;
  }
  cargarPixel(id);
}

function cargarPixel(id: string) {
  idCargado = id;
  // El fragmento oficial de Meta, sin el <script> en línea.
  const f: Fbq = function (...args: unknown[]) {
    if (f.callMethod) f.callMethod(...args);
    else f.queue.push(args);
  } as Fbq;
  window.fbq = f;
  window._fbq = f;
  f.push = f;
  f.loaded = true;
  f.version = "2.0";
  f.queue = [];
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);
  // Sin detección automática de botones ni de metadatos, y sin datos de la persona.
  window.fbq("set", "autoConfig", false, id);
  window.fbq("init", id);
  window.fbq("track", "PageView");
  activo = true;
  const pendientes = cola;
  cola = [];
  for (const p of pendientes) llamar(p);
}

/** Marketing rechazado o revocado: no sale nada más, se tira lo que esperaba y se borran las cookies del píxel. */
export function desactivarPixel() {
  activo = false;
  bloqueado = true;
  cola = [];
  if (typeof window === "undefined") return;
  if (window.fbq && idCargado) {
    try {
      window.fbq("consent", "revoke");
    } catch {
      // ya no hay píxel que avisar
    }
    (window as unknown as Record<string, unknown>)[`fb-disable-${idCargado}`] = true;
  }
  for (const nombre of ["_fbp", "_fbc"]) {
    document.cookie = `${nombre}=; Max-Age=0; Path=/`;
    document.cookie = `${nombre}=; Max-Age=0; Path=/; Domain=${location.hostname}`;
    document.cookie = `${nombre}=; Max-Age=0; Path=/; Domain=.${location.hostname.replace(/^www./, "")}`;
  }
}

/** Lee la cookie _fbp / _fbc (para mandarlas al servidor y deduplicar). Vacías si no hay consentimiento. */
export function cookieDePixel(nombre: "_fbp" | "_fbc"): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function alCambiarConsentimiento(fn: (detalle: { decidido: boolean; analitica: boolean; marketing: boolean }) => void): () => void {
  const oyente = (e: Event) => fn((e as CustomEvent).detail);
  window.addEventListener(EVENTO_CONSENTIMIENTO, oyente);
  return () => window.removeEventListener(EVENTO_CONSENTIMIENTO, oyente);
}
