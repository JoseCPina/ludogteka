import { Alert, Linking } from "react-native";
import * as Location from "expo-location";

/** ¿Ya dio permiso? Sirve para distinguir «sin permiso» de «con permiso, pero el GPS todavía no da señal». */
export async function hayPermisoUbicacion(): Promise<boolean> {
  try {
    return (await Location.getForegroundPermissionsAsync()).status === "granted";
  } catch {
    return false;
  }
}

/** La ubicación del celular (permiso «mientras se usa la app»). Null si la persona no la da. */
export async function miUbicacion(o: { precisa?: boolean; avisar?: boolean } = {}): Promise<{ lat: number; lng: number; precision: number | null } | null> {
  try {
    let { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted" && canAskAgain) ({ status, canAskAgain } = await Location.requestForegroundPermissionsAsync());
    if (status !== "granted") {
      if (o.avisar) Alert.alert("Sin permiso de ubicación", "Puedes darlo en los ajustes del celular.", [{ text: "Ahora no", style: "cancel" }, { text: "Abrir ajustes", onPress: () => Linking.openSettings() }]);
      return null;
    }
    const ultima = o.precisa ? null : await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
    const pos = ultima ?? (await Location.getCurrentPositionAsync({ accuracy: o.precisa ? Location.Accuracy.Highest : Location.Accuracy.Balanced }));
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy ?? null };
  } catch {
    return null;
  }
}
