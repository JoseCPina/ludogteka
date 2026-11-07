import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Application from "expo-application";
import * as Device from "expo-device";
import { File, Paths } from "expo-file-system";
import { Observe } from "expo-observe";

/**
 * Reporte de errores (EAS Observe, expo-observe): los cierres de JavaScript y los nativos de Android se guardan en el
 * celular y salen en el siguiente arranque, con la versión, el modelo y el sistema. Se ven en expo.dev, en Observe > Errors,
 * con la pantalla al inicio del mensaje. El mensaje sale del celular: por eso se limpia, sin persona, teléfonos, correos,
 * tokens ni ids en las rutas.
 *
 * Además, un registro propio: en el plan gratis de EAS, Observe recibe los errores pero el detalle pide suscripción. Cada
 * cierre de JavaScript se guarda en el celular y sale al siguiente arranque a /api/movil/errores, con versión, modelo y
 * pantalla; se ve en /plataforma/app-duenos. Los cierres nativos solo los ve Observe: matan la app antes de poder guardar.
 */
export const hayReporte = Platform.OS !== "web";

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

let pantallaActual = "";

/** La pantalla en la que está: acompaña a los errores que se reportan desde aquí. */
export function marcarPantalla(ruta: string) {
  pantallaActual = rutaSinIds(ruta);
}

export function reportarError(error: unknown, contexto: Record<string, string> = {}) {
  if (__DEV__) console.warn("[error]", error, contexto);
  if (!hayReporte) return;
  const original = error instanceof Error ? error : new Error(String(error));
  const limpio = new Error(sinDatosPersonales(`[${[pantallaActual, contexto.origen].filter(Boolean).join(" · ")}] ${original.message}`));
  limpio.name = original.name;
  limpio.stack = original.stack;
  Observe.reportError(limpio);
  guardarCierre(limpio, Boolean(contexto.fatal) || contexto.origen === "js_fatal");
}

// ── Registro propio ──────────────────────────────────────────────────────────────────────────────────────────────
type Cierre = { mensaje: string; stack: string | null; pantalla: string | null; version: string; modelo: string | null; sistema: string; fatal: boolean; ocurrido_at: string };
const MAXIMO = 10;
const archivo = () => new File(Paths.document, "cierres-pendientes.json");

function leerPendientes(): Cierre[] {
  try {
    const f = archivo();
    if (!f.exists) return [];
    const lista = JSON.parse(f.textSync()) as unknown;
    return Array.isArray(lista) ? (lista as Cierre[]) : [];
  } catch {
    return [];
  }
}

function guardarCierre(error: Error, fatal: boolean) {
  try {
    const cierre: Cierre = {
      mensaje: error.message.slice(0, 500),
      stack: error.stack ? sinDatosPersonales(error.stack).slice(0, 4000) : null,
      pantalla: pantallaActual || null,
      version: `${Constants.expoConfig?.version ?? "?"} (${Application.nativeBuildVersion ?? "?"})`,
      modelo: Device.modelName ?? null,
      sistema: `${Platform.OS} ${Device.osVersion ?? ""}`.trim(),
      fatal,
      ocurrido_at: new Date().toISOString(),
    };
    const f = archivo();
    if (!f.exists) f.create();
    f.write(JSON.stringify([...leerPendientes(), cierre].slice(-MAXIMO)));
  } catch {
    // Reportar nunca debe causar otro cierre.
  }
}

/** Al arrancar: manda lo guardado. Si el servidor no lo toma, se queda para el siguiente arranque. */
export async function enviarCierresPendientes() {
  if (!hayReporte) return;
  const lista = leerPendientes();
  if (!lista.length) return;
  const api = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "https://app.peludesk.mx";
  try {
    const r = await fetch(`${api}/api/movil/errores`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ args: [lista] }), signal: AbortSignal.timeout(10000) });
    if (r.ok) archivo().delete();
  } catch {
    // Sin conexión: al siguiente arranque.
  }
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
