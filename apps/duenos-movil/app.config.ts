import type { ExpoConfig } from "expo/config";

/**
 * La app nativa de PeluDesk para dueños (docs/app-duenos/APP-NATIVA.md). Nada secreto vive aquí: la API es la de
 * app.peludesk.mx (o EXPO_PUBLIC_API_URL en desarrollo) y la llave de Google Maps para Android llega en el entorno de
 * EAS (GOOGLE_MAPS_ANDROID_KEY, restringida al paquete mx.peludesk.app); sin ella, Cerca de mí y Alertas usan la
 * lista en lugar del mapa en Android (Google Maps truena sin llave). En iOS el mapa es Apple Maps y no pide llave.
 */
const llaveMapaAndroid = process.env.GOOGLE_MAPS_ANDROID_KEY ?? "";
const PAQUETE = "mx.peludesk.app";

const config: ExpoConfig = {
  name: "PeluDesk",
  slug: "peludesk-duenos",
  owner: "menteo",
  version: "1.0.0",
  runtimeVersion: { policy: "appVersion" },
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "peludesk",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: PAQUETE,
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription: "Para tomar la foto de tu mascota, de su cartilla o de un animal que viste en la calle.",
      NSPhotoLibraryUsageDescription: "Para escoger la foto de tu mascota, de su cartilla o de una alerta.",
      NSLocationWhenInUseUsageDescription: "Para enseñarte lo que hay cerca y ubicar las alertas de animales en la calle.",
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: PAQUETE,
    adaptiveIcon: {
      backgroundColor: "#4B3F72",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: true,
    // Push nativo en Android (FCM): el google-services.json del proyecto de Firebase de PeluDesk vive en EAS como
    // variable de tipo archivo (GOOGLE_SERVICES_JSON); nunca en el repo. Sin él, la app compila sin push nativo.
    ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
    permissions: ["CAMERA", "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "POST_NOTIFICATIONS", "VIBRATE"],
    blockedPermissions: ["android.permission.RECORD_AUDIO", "android.permission.ACCESS_BACKGROUND_LOCATION"],
  },
  web: { favicon: "./assets/images/favicon.png" },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-sharing",
    ["expo-splash-screen", { backgroundColor: "#4B3F72", image: "./assets/images/splash-icon.png", imageWidth: 120 }],
    ["expo-notifications", { color: "#4B3F72", defaultChannel: "avisos" }],
    ["expo-location", { locationWhenInUsePermission: "Para enseñarte lo que hay cerca y ubicar las alertas de animales en la calle." }],
    ["expo-image-picker", { photosPermission: "Para escoger la foto de tu mascota, de su cartilla o de una alerta.", cameraPermission: "Para tomar la foto de tu mascota, de su cartilla o de un animal que viste en la calle." }],
    ["expo-camera", { cameraPermission: "Para tomar la foto de tu mascota, de su cartilla o de un animal que viste en la calle.", recordAudioAndroid: false }],
    ["react-native-maps", llaveMapaAndroid ? { androidGoogleMapsApiKey: llaveMapaAndroid } : {}],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "https://app.peludesk.mx",
    hayMapaAndroid: Boolean(llaveMapaAndroid),
    eas: { projectId: "ba752b19-16a4-4a08-8f01-86ef13f6c1f9" },
  },
};

export default config;
