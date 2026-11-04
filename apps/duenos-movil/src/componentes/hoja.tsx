import { useEffect, type ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radio, useColores } from "@/tema";
import { sombra as sombraVista } from "./ui";

/**
 * Hoja inferior deslizable sobre el mapa (como Apple Maps, Google Maps y Fresha): tres alturas (asomada, media y casi
 * completa). Se arrastra desde su encabezado; el contenido de adentro se desplaza solo. `indice` la mueve desde fuera
 * (al tocar un pin sube a la media).
 */
const RESORTE = { damping: 22, stiffness: 220, mass: 0.9 };

export function HojaInferior({ encabezado, children, indice, alCambiarIndice, alturaAsomada = 150 }: { encabezado: ReactNode; children: ReactNode; indice: number; alCambiarIndice: (i: number) => void; alturaAsomada?: number }) {
  const c = useColores();
  const { height } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const alturas = [alturaAsomada + inset.bottom, Math.round(height * 0.48), Math.round(height - inset.top - 72)];
  const alto = useSharedValue(alturas[indice] ?? alturas[0]);
  const inicio = useSharedValue(0);

  useEffect(() => {
    alto.set(withSpring(alturas[indice] ?? alturas[0], RESORTE));
  }, [indice, height]); // eslint-disable-line react-hooks/exhaustive-deps

  const elegir = (i: number) => {
    Haptics.selectionAsync().catch(() => {});
    alCambiarIndice(i);
  };

  const arrastre = usePanGesture({
    onActivate: () => {
      "worklet";
      inicio.set(alto.get());
    },
    onUpdate: (e) => {
      "worklet";
      alto.set(Math.min(alturas[2] + 20, Math.max(alturas[0] - 30, inicio.get() - e.translationY)));
    },
    onDeactivate: (e) => {
      "worklet";
      // Con velocidad, sigue la dirección; si no, la altura más cercana.
      const destino = alto.get() - e.velocityY * 0.18;
      let mejor = 0;
      for (let i = 1; i < alturas.length; i++) if (Math.abs(alturas[i] - destino) < Math.abs(alturas[mejor] - destino)) mejor = i;
      alto.set(withSpring(alturas[mejor], RESORTE));
      scheduleOnRN(elegir, mejor);
    },
  });

  const estilo = useAnimatedStyle(() => ({ height: alto.get() }));
  return (
    <Animated.View style={[{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: c.superficie, borderTopLeftRadius: radio.hoja, borderTopRightRadius: radio.hoja, overflow: "hidden" }, sombraVista(c.sombra), { shadowOffset: { width: 0, height: -4 }, elevation: 16 }, estilo]}>
      <GestureDetector gesture={arrastre}>
        <View accessibilityRole="adjustable" accessibilityLabel="Lista de lugares; desliza para subirla o bajarla" accessibilityActions={[{ name: "increment" }, { name: "decrement" }]} onAccessibilityAction={(e) => alCambiarIndice(e.nativeEvent.actionName === "increment" ? Math.min(2, indice + 1) : Math.max(0, indice - 1))}>
          <View style={{ alignItems: "center", paddingTop: 8, paddingBottom: 6 }}>
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.linea }} />
          </View>
          {encabezado}
        </View>
      </GestureDetector>
      <View style={{ flex: 1 }}>{children}</View>
    </Animated.View>
  );
}

