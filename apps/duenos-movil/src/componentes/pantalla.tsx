import { type ReactNode } from "react";
import { RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { espacio, useColores } from "@/tema";
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
  return (
    <View style={{ flex: 1, backgroundColor: c.fondo }}>
      <ScrollView
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
      {pie ? (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: espacio.l, paddingTop: 12, paddingBottom: inset.bottom + 12, backgroundColor: c.fondo, borderTopWidth: 0.5, borderTopColor: c.linea }}>{pie}</View>
      ) : null}
    </View>
  );
}
