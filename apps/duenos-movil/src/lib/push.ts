import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import * as Application from "expo-application";
import * as SecureStore from "expo-secure-store";
import { llamar } from "./api";

/**
 * Notificaciones nativas (expo-notifications: FCM en Android, APNs en iOS). El token del celular se registra en la
 * base (/api/movil/registrarDispositivo) y el servidor manda por el servicio de push de Expo (src/lib/movil/push.ts).
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const LLAVE_TOKEN = "peludesk.push";

export async function canalAndroid() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("avisos", { name: "Avisos de tus mascotas", importance: AndroidImportance.HIGH, lightColor: "#4B3F72", vibrationPattern: [0, 200, 120, 200] });
  await Notifications.setNotificationChannelAsync("alertas", { name: "Alertas de animales cerca", importance: AndroidImportance.HIGH, lightColor: "#D2483E", vibrationPattern: [0, 300, 150, 300] });
}

export type EstadoPush = "activas" | "denegadas" | "sin_configurar" | "simulador";

/** Pide permiso (si hace falta) y registra el token. No vuelve a preguntar si la persona ya dijo que no. */
export async function activarPush(preguntar: boolean): Promise<EstadoPush> {
  if (!Device.isDevice) return "simulador";
  await canalAndroid();
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted" && preguntar) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return "denegadas";
  try {
    const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const r = await llamar("registrarDispositivo", [{ token, plataforma: Platform.OS, modelo: Device.modelName ?? null, versionApp: Application.nativeApplicationVersion ?? null }]);
    if (r.error) return "sin_configurar";
    await SecureStore.setItemAsync(LLAVE_TOKEN, token);
    return "activas";
  } catch {
    // Android sin la configuración de Firebase del proyecto, o sin servicios de Google: no hay token.
    return "sin_configurar";
  }
}

/** Al salir de la cuenta: este celular deja de recibir los avisos de esa persona. */
export async function soltarPush() {
  const token = await SecureStore.getItemAsync(LLAVE_TOKEN).catch(() => null);
  if (token) await llamar("quitarDispositivo", [token]).catch(() => null);
  await SecureStore.deleteItemAsync(LLAVE_TOKEN).catch(() => null);
}

/** Las direcciones de los avisos son las de la web (app.peludesk.mx); aquí se traducen a las pantallas nativas. */
export function rutaDeAviso(url: string | null | undefined): string | null {
  if (!url) return null;
  const ruta = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  const m = /^\/mascotas\/([0-9a-f-]{36})(?:\/(cartilla\/leer|cartilla|seguimiento|qr|perdida|cita|reservar|negocio\/[0-9a-f-]{36}))?/.exec(ruta);
  if (m) {
    const sub = m[2] === "cartilla/leer" ? "leer" : m[2];
    return sub ? `/mascotas/${m[1]}/${sub}` : `/mascotas/${m[1]}`;
  }
  const a = /^\/alertas\/([0-9a-f-]{36})/.exec(ruta);
  if (a) return `/alertas/${a[1]}`;
  if (/^\/(avisos|visitas|pagos|pases|contratos|cerca|alertas|yo)(\/|$)/.test(ruta)) return ruta;
  return "/avisos";
}
