import { Stack } from "expo-router";
import { fuentes, useColores } from "@/tema";

/** La pila de cada pestaña: barra nativa con título chico (17, seminegrita), sin sombra y con el fondo cálido. */
export function PilaDePestana({ titulo, sinBarra, pantallas = [] }: { titulo: string; sinBarra?: boolean; pantallas?: { nombre: string; titulo: string; modal?: boolean }[] }) {
  const c = useColores();
  return (
    <Stack
      screenOptions={{
        headerTitleStyle: { fontFamily: fuentes.semi, fontSize: 17, color: c.texto },
        headerStyle: { backgroundColor: c.fondo },
        headerTintColor: c.primario,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: c.fondo },
      }}
    >
      <Stack.Screen name="index" options={{ title: titulo, headerShown: !sinBarra }} />
      {pantallas.map((p) => <Stack.Screen key={p.nombre} name={p.nombre} options={{ title: p.titulo, presentation: p.modal ? "modal" : undefined }} />)}
    </Stack>
  );
}
