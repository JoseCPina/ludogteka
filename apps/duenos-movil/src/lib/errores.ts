import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Sentry from "@sentry/react-native";

/**
 * Reporte de errores (Sentry): los cierres nativos y de JavaScript llegan solos, con la versión, el modelo del celular
 * y la pantalla, SIN datos personales: ni persona, ni nombres de mascotas, ni teléfonos, ni correos, ni capturas de
 * pantalla, ni ids en las rutas. Sin DSN (EXPO_PUBLIC_SENTRY_DSN) todo esto queda apagado y la app funciona igual.
 */
const dsn = (Constants.expoConfig?.extra?.sentryDsn as string | undefined) || "";
export const hayReporte = Boolean(dsn) && Platform.OS !== "web";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Quita de un texto lo que pueda identificar a alguien: correos, teléfonos, tokens e ids. */
export function sinDatosPersonales(texto: string): string {
  return texto
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[correo]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]")
    .replace(UUID, ":id")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[numero]");
}

export const rutaSinIds = (ruta: string) => ruta.split("?")[0].replace(UUID, ":id");

export function iniciarReporte() {
  if (!hayReporte) return;
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    tracesSampleRate: 0,
    enableAutoSessionTracking: true,
    // Lo que tocó la persona y la consola pueden traer nombres: solo queda el rastro de navegación y de peticiones, sin datos.
    beforeBreadcrumb(b) {
      if (b.category === "console" || b.category === "touch" || b.category === "ui.click") return null;
      if (b.category === "navigation" && b.data) {
        b.data = { from: rutaSinIds(String(b.data.from ?? "")), to: rutaSinIds(String(b.data.to ?? "")) };
      }
      if (b.category === "xhr" || b.category === "fetch") {
        b.data = { url: rutaSinIds(String(b.data?.url ?? "")), status_code: b.data?.status_code, method: b.data?.method };
      }
      if (b.message) b.message = sinDatosPersonales(b.message);
      return b;
    },
    beforeSend(e) {
      delete e.user;
      delete e.server_name;
      delete e.request;
      if (e.contexts?.device) delete e.contexts.device.name;
      if (e.message) e.message = sinDatosPersonales(e.message);
      for (const x of e.exception?.values ?? []) if (x.value) x.value = sinDatosPersonales(x.value);
      return e;
    },
  });
}

/** La pantalla en la que está: acompaña a cualquier error, también a un cierre nativo. */
export function marcarPantalla(ruta: string) {
  if (hayReporte) Sentry.setTag("pantalla", rutaSinIds(ruta));
}

export function reportarError(error: unknown, contexto: Record<string, string> = {}) {
  if (__DEV__) console.warn("[error]", error, contexto);
  if (hayReporte) Sentry.captureException(error, { tags: contexto });
}

// Un error de JavaScript fuera de React: en producción, React Native cierra la app. Aquí se reporta y se enseña la
// pantalla de «Algo falló, reintentar».
const oyentes = new Set<(e: unknown) => void>();
let pendiente: unknown = null;

export function alFallarLaApp(fn: (e: unknown) => void): () => void {
  oyentes.add(fn);
  if (pendiente) {
    fn(pendiente);
    pendiente = null;
  }
  return () => oyentes.delete(fn);
}

type ManejadorErrores = { setGlobalHandler: (fn: (e: unknown, fatal?: boolean) => void) => void };

export function atraparErroresGlobales() {
  const eu = (globalThis as unknown as { ErrorUtils?: ManejadorErrores }).ErrorUtils;
  if (!eu || __DEV__) return;
  eu.setGlobalHandler((error, fatal) => {
    reportarError(error, { origen: fatal ? "js_fatal" : "js" });
    if (!fatal) return;
    if (oyentes.size) oyentes.forEach((fn) => fn(error));
    else pendiente = error;
  });
}
