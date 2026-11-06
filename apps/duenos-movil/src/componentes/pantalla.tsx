import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { espacio, useColores } from "@/tema";
import { useFocusEffect } from "expo-router";
import { Boton, Esqueleto, Mensaje } from "./ui";

/**
 * Lo que envuelve cada pantalla: desplazable, con «jalar para actualizar», el fondo cálido y el margen de la barra
 * nativa. Mientras carga la primera vez enseña la forma de la pantalla; si falla, el mensaje y «Reintentar».
 */
export function Pantalla({ children, cargando, error, refrescando, alRefrescar, alReintentar, pie, sinMargen, style }: {
  children?: ReactNode; cargando?: boolean; error?: string | null; refrescando?: boolean; alRefrescar?: () => void; alReintentar?: () => void; pie?: ReactNode; sinMargen?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const c = useColores();
  const inset = useSafeAreaInsets();
  const lista = useRef<ComponentRef<typeof ScrollView>>(null);
  const desplazado = useRef(0);
  const [conTeclado, setConTeclado] = useState(false);
  // Hay varias pantallas montadas en la pila: solo la que se está viendo responde al teclado.
  const enfocada = useRef(false);
  useFocusEffect(
    useCallback(() => {
      enfocada.current = true;
      return () => {
        enfocada.current = false;
      };
    }, [])
  );
  // Con el teclado abierto se esconde el botón fijo y el campo enfocado sube a la vista.
  useEffect(() => {
    const abre = Keyboard.addListener("keyboardDidShow", (e) => {
      if (!enfocada.current) return;
      setConTeclado(true);
      setTimeout(() => {
        const campo = TextInput.State.currentlyFocusedInput();
        if (!campo) return lista.current?.scrollToEnd({ animated: true });
        campo.measureInWindow((_x, y, _w, alto) => {
          const sobra = y + alto + 24 - e.endCoordinates.screenY;
          if (sobra > 0) lista.current?.scrollTo({ y: desplazado.current + sobra, animated: true });
        });
      }, 300);
    });
    const cierra = Keyboard.addListener("keyboardDidHide", () => setConTeclado(false));
    return () => {
      abre.remove();
      cierra.remove();
    };
  }, []);
  return (
    // Con el teclado abierto, la pantalla se encoge: el campo y su botón siguen a la vista en Android y en iPhone.
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: c.fondo }}>
      <ScrollView
        ref={lista}
        onScroll={(e) => { desplazado.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={64}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        refreshControl={alRefrescar ? <RefreshControl refreshing={Boolean(refrescando)} onRefresh={alRefrescar} tintColor={c.primario} colors={[c.primario]} /> : undefined}
        contentContainerStyle={[{ padding: sinMargen ? 0 : espacio.l, paddingBottom: (pie ? 120 : 40) + inset.bottom, gap: espacio.xl }, style]}
      >
        {cargando ? (
          <View style={{ gap: 14 }}>
            <Esqueleto alto={120} />
            <Esqueleto alto={64} />
            <Esqueleto alto={64} />
            <Esqueleto alto={180} />
          </View>
        ) : error && !children ? (
          <View style={{ gap: 12, paddingTop: 24 }}>
            <Mensaje texto={error} />
            {alReintentar ? <Boton titulo="Reintentar" variante="secundario" icono="refrescar" alTocar={alReintentar} /> : null}
          </View>
        ) : (
          <>
            {error ? <Mensaje texto={error} /> : null}
            {children}
          </>
        )}
      </ScrollView>
      {pie && !conTeclado ? (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: espacio.l, paddingTop: 12, paddingBottom: inset.bottom + 12, backgroundColor: c.fondo, borderTopWidth: 0.5, borderTopColor: c.linea }}>{pie}</View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
