import { forwardRef, useState, type ReactNode } from "react";
import { Platform, View } from "react-native";
import Constants from "expo-constants";
import MapView, { Marker, type MapViewProps, type Region } from "react-native-maps";
import { LimiteDeParte } from "./limite-error";
import { Icono, type NombreIcono } from "./icono";
import { Texto } from "./ui";
import { useColores, useEsOscuro } from "@/tema";

/**
 * El mapa nativo: Apple Maps en iOS y Google Maps en Android (react-native-maps). En Android, Google Maps necesita la
 * llave del proyecto (GOOGLE_MAPS_ANDROID_KEY en EAS); sin ella, en lugar de tronar, se enseña un aviso y la pantalla
 * trabaja con la lista.
 */
export const hayMapa = Platform.OS !== "android" || Boolean(Constants.expoConfig?.extra?.hayMapaAndroid);

export const Mapa = forwardRef<MapView, MapViewProps & { children?: ReactNode; sinMapa?: ReactNode }>(function Mapa({ children, sinMapa, ...props }, ref) {
  const c = useColores();
  const oscuro = useEsOscuro();
  const alternativa = sinMapa ?? (
    <View style={[{ backgroundColor: c.superficieAlta, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 }, props.style]}>
      <Icono nombre="mapa" tamano={36} color={c.textoTenue} />
      <Texto v="secundario" centrado>Aquí abajo está la lista con la distancia de cada lugar.</Texto>
    </View>
  );
  if (!hayMapa) return alternativa;
  return (
    <LimiteDeParte nombre="mapa" alternativa={alternativa}>
      <MapView ref={ref} showsUserLocation showsMyLocationButton={false} showsCompass={false} toolbarEnabled={false} userInterfaceStyle={oscuro ? "dark" : "light"} {...props}>
        {children}
      </MapView>
    </LimiteDeParte>
  );
});

/** Un pin de un color por tipo, con su ícono; el de PeluDesk lleva anillo morado y el elegido crece. */
export function Pin({ coordenada, color, icono, elegido, peludesk, alTocar, titulo }: { coordenada: { latitude: number; longitude: number }; color: string; icono: NombreIcono; elegido?: boolean; peludesk?: boolean; alTocar: () => void; titulo: string }) {
  // En Android un marcador con vista propia se vuelve a dibujar en cada cambio si sigue «rastreando»: se apaga al pintar.
  const [rastrear, setRastrear] = useState(true);
  const tam = elegido ? 44 : 34;
  // Una coordenada vacía en un marcador cierra la app desde el lado nativo: ese lugar simplemente no se pinta.
  if (!Number.isFinite(coordenada.latitude) || !Number.isFinite(coordenada.longitude)) return null;
  return (
    <Marker coordinate={coordenada} onPress={alTocar} tracksViewChanges={rastrear} accessibilityLabel={titulo} anchor={{ x: 0.5, y: 0.5 }} zIndex={elegido ? 10 : peludesk ? 5 : 1}>
      <View onLayout={() => setTimeout(() => setRastrear(false), 400)} style={{ width: tam + 8, height: tam + 8, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: tam, height: tam, borderRadius: tam / 2, backgroundColor: color, borderWidth: peludesk ? 3 : 2, borderColor: peludesk ? "#ECE8F5" : "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
          <Icono nombre={icono} tamano={elegido ? 22 : 17} color="#FFFFFF" />
        </View>
      </View>
    </Marker>
  );
}

export const regionDe = (lat: number, lng: number, km = 4): Region => ({ latitude: lat, longitude: lng, latitudeDelta: km / 111, longitudeDelta: km / 111 });
