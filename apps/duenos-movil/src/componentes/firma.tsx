import type React from "react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { PanResponder, Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import * as Haptics from "expo-haptics";
import { Texto } from "./ui";
import { radio, useColores } from "@/tema";

export type PadFirmaRef = { png: () => Promise<string | null>; vacia: () => boolean };

/** Firma con el dedo: trazos en SVG sobre fondo blanco; se entrega como PNG (data URL) igual que la firma de la web. */
export const PadFirma = forwardRef<PadFirmaRef, { alCambiar?: (vacia: boolean) => void }>(function PadFirma({ alCambiar }, ref) {
  const c = useColores();
  const lienzo = useRef<React.ComponentRef<typeof View>>(null);
  const [trazos, setTrazos] = useState<string[]>([]);
  const actual = useRef("");
  const [vivo, setVivo] = useState("");

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        actual.current = `M${x.toFixed(1)},${y.toFixed(1)}`;
        setVivo(actual.current);
        Haptics.selectionAsync().catch(() => {});
      },
      onPanResponderMove: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        actual.current += ` L${x.toFixed(1)},${y.toFixed(1)}`;
        setVivo(actual.current);
      },
      onPanResponderRelease: () => {
        const t = actual.current;
        actual.current = "";
        setVivo("");
        setTrazos((xs) => {
          const nuevos = [...xs, t];
          alCambiar?.(false);
          return nuevos;
        });
      },
    })
  ).current;

  useImperativeHandle(ref, () => ({
    vacia: () => trazos.length === 0,
    png: async () => {
      if (!trazos.length || !lienzo.current) return null;
      const base64 = await captureRef(lienzo as never, { format: "png", quality: 1, result: "base64" });
      return `data:image/png;base64,${base64}`;
    },
  }));

  return (
    <View style={{ gap: 8 }}>
      <View ref={lienzo} collapsable={false} {...responder.panHandlers} style={{ height: 200, borderRadius: radio.tarjeta, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: c.linea, overflow: "hidden" }} accessibilityLabel="Recuadro para firmar con el dedo">
        <Svg width="100%" height="100%">
          {trazos.map((d, i) => <Path key={i} d={d} stroke="#1B1530" strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
          {vivo ? <Path d={vivo} stroke="#1B1530" strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
        </Svg>
        {!trazos.length && !vivo ? <View pointerEvents="none" style={{ position: "absolute", left: 20, right: 20, bottom: 40, borderBottomWidth: 1, borderColor: "#C9C2D0" }} /> : null}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Texto v="pie">Firma dentro del recuadro</Texto>
        <Pressable onPress={() => { setTrazos([]); alCambiar?.(true); }} hitSlop={8}><Texto v="pie" color={c.primario}>Borrar</Texto></Pressable>
      </View>
    </View>
  );
});
