import { Tabs } from "expo-router";
import { Icono } from "@/componentes/icono";
import { fuentes, useColores } from "@/tema";

/** En web (capturas y pruebas) no hay pestañas nativas: la misma barra inferior con las pestañas de expo-router. */
export default function PestanasWeb() {
  const c = useColores();
  const pestana = (titulo: string, icono: Parameters<typeof Icono>[0]["nombre"]) => ({
    title: titulo,
    headerShown: false,
    tabBarLabelStyle: { fontFamily: fuentes.media, fontSize: 12 },
    tabBarIcon: ({ color }: { color: import("react-native").ColorValue }) => <Icono nombre={icono} tamano={24} color={color} />,
  });
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: c.primario, tabBarInactiveTintColor: c.textoSuave, tabBarStyle: { backgroundColor: c.superficie, height: 64, paddingBottom: 8, borderTopColor: c.linea } }}>
      <Tabs.Screen name="(mascotas)" options={pestana("Mascotas", "mascota")} />
      <Tabs.Screen name="cerca" options={pestana("Cerca", "mapa")} />
      <Tabs.Screen name="alertas" options={pestana("Alertas", "alerta")} />
      <Tabs.Screen name="avisos" options={pestana("Avisos", "aviso")} />
      <Tabs.Screen name="yo" options={pestana("Yo", "persona")} />
    </Tabs>
  );
}
