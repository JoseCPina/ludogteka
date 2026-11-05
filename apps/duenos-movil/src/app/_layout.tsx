import { useEffect } from "react";
import { Platform } from "react-native";
import { Stack, router, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { useFonts, Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold } from "@expo-google-fonts/outfit";
import { ProveedorSesion, useSesion } from "@/lib/sesion";
import { rutaDeAviso, useUltimaNotificacion } from "@/lib/push";
import { atraparErroresGlobales, iniciarReporte, marcarPantalla } from "@/lib/errores";
import { FallaGlobal } from "@/componentes/limite-error";
import { fuentes, useColores, useEsOscuro } from "@/tema";

export { ErrorBoundary } from "@/componentes/limite-error";

iniciarReporte();
atraparErroresGlobales();
SplashScreen.preventAutoHideAsync().catch(() => {});

function Pilas() {
  const { cargando, conSesion } = useSesion();
  const c = useColores();
  const oscuro = useEsOscuro();
  const pantalla = usePathname();

  useEffect(() => {
    if (!cargando) SplashScreen.hideAsync().catch(() => {});
  }, [cargando]);

  useEffect(() => {
    marcarPantalla(pantalla);
  }, [pantalla]);

  // Tocar una notificación abre la pantalla que dice el aviso.
  const ultima = useUltimaNotificacion();
  useEffect(() => {
    if (!conSesion || !ultima) return;
    const ruta = rutaDeAviso(ultima.notification.request.content.data?.url as string | undefined);
    if (ruta) router.push(ruta as never);
  }, [ultima, conSesion]);

  if (cargando) return null;
  return (
    <>
      <StatusBar style={oscuro ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerTitleStyle: { fontFamily: fuentes.semi, fontSize: 17, color: c.texto },
          headerStyle: { backgroundColor: c.fondo },
          headerTintColor: c.primario,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: c.fondo },
          animation: Platform.OS === "android" ? "default" : undefined,
        }}
      >
        <Stack.Protected guard={!conSesion}>
          <Stack.Screen name="entrar" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={conSesion}>
          <Stack.Screen name="(pestanas)" options={{ headerShown: false }} />
          <Stack.Screen name="mascotas/nueva" options={{ title: "Nueva mascota", presentation: "modal" }} />
          <Stack.Screen name="mascotas/[id]/index" options={{ title: "" }} />
          <Stack.Screen name="mascotas/[id]/cartilla" options={{ title: "Cartilla" }} />
          <Stack.Screen name="mascotas/[id]/leer" options={{ title: "Leer cartilla", presentation: "fullScreenModal", headerShown: false }} />
          <Stack.Screen name="mascotas/[id]/seguimiento" options={{ title: "Peso, medicinas y gastos" }} />
          <Stack.Screen name="mascotas/[id]/qr" options={{ title: "Placa con QR" }} />
          <Stack.Screen name="mascotas/[id]/perdida" options={{ title: "Mascota perdida" }} />
          <Stack.Screen name="mascotas/[id]/cita" options={{ title: "Pedir cita" }} />
          <Stack.Screen name="mascotas/[id]/reservar" options={{ title: "Reservar" }} />
          <Stack.Screen name="mascotas/[id]/negocio/[negocio]" options={{ title: "" }} />
          <Stack.Screen name="visitas" options={{ title: "Mis visitas" }} />
          <Stack.Screen name="pagos" options={{ title: "Por pagar" }} />
          <Stack.Screen name="pases" options={{ title: "Mis pases" }} />
          <Stack.Screen name="contratos/index" options={{ title: "Contratos" }} />
          <Stack.Screen name="contratos/[negocio]/[id]" options={{ title: "Firmar contrato" }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  // Si las fuentes no cargan, la app sigue con las del sistema: nunca se queda en la pantalla de inicio.
  const [listas, errorFuentes] = useFonts({ Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold });
  if (!listas && !errorFuentes) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <FallaGlobal>
        <ProveedorSesion>
          <Pilas />
        </ProveedorSesion>
      </FallaGlobal>
    </GestureHandlerRootView>
  );
}
