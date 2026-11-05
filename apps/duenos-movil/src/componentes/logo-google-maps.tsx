import { Platform, View } from "react-native";
import { Image } from "expo-image";
import { useEsOscuro } from "@/tema";
import { hayMapa } from "@/componentes/mapa";

const gris = require("../../assets/images/google-maps-gris.png");
const blanco = require("../../assets/images/google-maps-blanco.png");

/**
 * El logo de Google Maps junto a datos de Places (políticas de atribución de Google: logo oficial sin modificar, de 16
 * a 19 dp de alto, con la etiqueta de accesibilidad «Google Maps»; el de fondo liso, gris en claro y blanco en oscuro).
 * En iOS el mapa es de Apple, así que el logo va siempre; en Android el mapa de Google ya lo trae, y sin mapa también.
 */
export function LogoGoogleMaps({ forzar = false }: { forzar?: boolean }) {
  const oscuro = useEsOscuro();
  if (!forzar && Platform.OS !== "ios" && hayMapa) return null;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Google Maps" style={{ paddingVertical: 6 }}>
      <Image source={oscuro ? blanco : gris} style={{ width: 98, height: 18 }} contentFit="contain" />
    </View>
  );
}
