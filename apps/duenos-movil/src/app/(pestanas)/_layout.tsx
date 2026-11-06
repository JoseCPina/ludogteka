import { NativeTabs } from "expo-router/native-tabs";
import { fuentes, useColores } from "@/tema";
import { ProveedorOnboarding } from "@/lib/onboarding";
import { Bienvenida } from "@/componentes/onboarding";

/**
 * Cinco pestañas nativas (barra inferior del sistema: Liquid Glass en iOS, Material en Android): Mis mascotas, Cerca,
 * Alertas, Avisos y Yo. Lo demás se abre encima, con su gesto de regreso.
 */
export default function Pestanas() {
  const c = useColores();
  return (
    <ProveedorOnboarding>
    <Bienvenida />
    <NativeTabs
      backgroundColor={c.superficie}
      indicatorColor={c.primarioSuave}
      iconColor={{ default: c.textoSuave, selected: c.primario }}
      labelStyle={{ default: { color: c.textoSuave, fontFamily: fuentes.media }, selected: { color: c.primario, fontFamily: fuentes.semi } }}
    >
      <NativeTabs.Trigger name="(mascotas)">
        <NativeTabs.Trigger.Label>Mascotas</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "pawprint", selected: "pawprint.fill" }} md="pets" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cerca">
        <NativeTabs.Trigger.Label>Cerca</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "map", selected: "map.fill" }} md="map" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="alertas">
        <NativeTabs.Trigger.Label>Alertas</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "exclamationmark.bubble", selected: "exclamationmark.bubble.fill" }} md="campaign" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="avisos">
        <NativeTabs.Trigger.Label>Avisos</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "bell", selected: "bell.fill" }} md="notifications" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="yo">
        <NativeTabs.Trigger.Label>Yo</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
    </ProveedorOnboarding>
  );
}
