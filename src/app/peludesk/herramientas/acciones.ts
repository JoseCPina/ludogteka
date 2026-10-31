"use server";

import { cookies, headers } from "next/headers";
import { capturarTelefono, type SalidaCaptura } from "@/lib/herramientas/captura";
import { COOKIE_CONSENTIMIENTO, leerConsentimiento } from "@/lib/peludesk/cookies";
import { origenDeParametros } from "@/lib/herramientas/telemetria";
import { fraseDeRango, leerConsulta, rangoDe } from "@/lib/mercado/rangos";
import { mesEnTexto, pesosMercado, type Rango } from "@/lib/mercado/catalogo";
import { SITIO } from "@/lib/peludesk/seo";

/**
 * Las acciones de las herramientas públicas (sin sesión): consultar un rango del índice y dejar el WhatsApp para
 * recibir el resultado. Todo lo que llega del navegador se valida aquí; nada de lo que la persona escribe se guarda
 * sin pasar por captura.ts.
 */
export async function consultarRango(p: { giro: string; servicio: string; ciudad: string | null; talla: string | null }): Promise<{ error: string | null; rango?: Rango; frase?: string }> {
  const c = leerConsulta(p);
  if (!c) return { error: "Escoge un giro y un servicio." };
  const rango = await rangoDe(c);
  return { error: null, rango, frase: fraseDeRango(c, rango, pesosMercado, mesEnTexto(rango.fecha)) };
}

export type EntradaRecibelo = {
  herramienta: string;
  telefono: string;
  nombre?: string;
  negocio?: string;
  giro?: string | null;
  ciudad?: string | null;
  resumen: string;
  /** Ruta dentro de peludesk.mx (se completa con el sitio): «/precios-mercado?…». */
  ruta: string;
  datos?: Record<string, unknown>;
  origen?: Record<string, string>;
};

export async function recibirPorWhatsApp(e: EntradaRecibelo): Promise<SalidaCaptura> {
  // Un campo trampa que una persona no ve: si viene lleno, es un robot.
  if (typeof (e as Record<string, unknown>).sitio_web === "string" && (e as Record<string, unknown>).sitio_web) return { error: null, enviado: false };
  const ruta = typeof e.ruta === "string" && e.ruta.startsWith("/") && !e.ruta.startsWith("//") ? e.ruta.slice(0, 400) : "/herramientas";
  const h = await headers();
  const jar = await cookies();
  const consentimiento = leerConsentimiento(jar.get(COOKIE_CONSENTIMIENTO)?.value);
  return capturarTelefono({
    conversion: {
      marketing: consentimiento.marketing,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
      userAgent: h.get("user-agent")?.slice(0, 400) ?? null,
      fbp: jar.get("_fbp")?.value ?? null,
      fbc: jar.get("_fbc")?.value ?? null,
    },
    herramienta: String(e.herramienta ?? ""),
    telefono: String(e.telefono ?? ""),
    nombre: typeof e.nombre === "string" ? e.nombre.slice(0, 80) : null,
    negocio: typeof e.negocio === "string" ? e.negocio.slice(0, 120) : null,
    giro: typeof e.giro === "string" ? e.giro : null,
    ciudad: typeof e.ciudad === "string" ? e.ciudad.slice(0, 80) : null,
    resumen: String(e.resumen ?? "").slice(0, 600),
    url: `${SITIO}${ruta}`,
    datos: e.datos && typeof e.datos === "object" ? e.datos : {},
    origen: origenDeParametros(e.origen ?? {}),
  });
}
