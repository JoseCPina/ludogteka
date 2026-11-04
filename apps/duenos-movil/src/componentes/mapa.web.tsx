import { forwardRef, type ReactElement, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";
import { Icono, type NombreIcono } from "./icono";
import { Texto } from "./ui";
import { useColores } from "@/tema";

/**
 * En web (capturas y pruebas del mismo código) no hay mapa nativo: se comporta como el APK de Android sin llave de
 * Google Maps (lista sin mapa).
 */
export const hayMapa = false;

export const Mapa = forwardRef<unknown, { children?: ReactNode; sinMapa?: ReactNode; style?: StyleProp<ViewStyle> } & Record<string, unknown>>(function Mapa({ sinMapa, style }, _ref) {
  const c = useColores();
  return (
    (sinMapa as ReactElement) ?? (
      <View style={[{ backgroundColor: c.superficieAlta, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 }, style as StyleProp<ViewStyle>]}>
        <Icono nombre="mapa" tamano={36} color={c.textoTenue} />
        <Texto v="secundario" centrado>Aquí abajo está la lista con la distancia de cada lugar.</Texto>
      </View>
    )
  );
});

export function Pin(_: { coordenada: { latitude: number; longitude: number }; color: string; icono: NombreIcono; elegido?: boolean; peludesk?: boolean; alTocar: () => void; titulo: string }) {
  return null;
}

export const regionDe = (lat: number, lng: number, km = 4) => ({ latitude: lat, longitude: lng, latitudeDelta: km / 111, longitudeDelta: km / 111 });
