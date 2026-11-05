import { Component, useEffect, type ReactNode } from "react";
import { Pressable, Text, View, useColorScheme } from "react-native";
import type { ErrorBoundaryProps } from "expo-router";
import { alFallarLaApp, reportarError } from "@/lib/errores";
import { colores } from "@/tema/tokens";

/**
 * Lo que se ve cuando algo truena: nunca se cierra la app. A propósito sin fuentes propias ni componentes de la app:
 * tiene que pintarse aunque lo que falló sea justo eso.
 */
export function PantallaDeError({ alReintentar, texto }: { alReintentar: () => void; texto?: string }) {
  const c = useColorScheme() === "dark" ? colores.oscuro : colores.claro;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12, backgroundColor: c.fondo }} testID="pantalla-de-error">
      <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: "700", color: c.texto, textAlign: "center" }}>Algo falló</Text>
      <Text style={{ fontSize: 16, lineHeight: 22, color: c.textoSuave, textAlign: "center" }}>{texto ?? "Esta pantalla tuvo un problema. Tus datos están bien; intenta de nuevo."}</Text>
      <Pressable accessibilityRole="button" onPress={alReintentar} style={({ pressed }) => ({ marginTop: 8, minHeight: 48, paddingHorizontal: 28, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? c.primarioPresionado : c.primario })}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: c.sobrePrimario }}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

/** El límite de errores de una ruta (expo-router lo toma de `export { ErrorBoundary }` en la raíz y en cada pestaña). */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportarError(error, { origen: "pantalla" });
  }, [error]);
  return <PantallaDeError alReintentar={() => void retry()} />;
}

/** Un error de JavaScript fuera de React (un temporizador, un evento): se enseña la misma pantalla en lugar de cerrar. */
export class FallaGlobal extends Component<{ children: ReactNode }, { fallo: boolean; vuelta: number }> {
  state = { fallo: false, vuelta: 0 };
  private quitar?: () => void;
  componentDidMount() {
    this.quitar = alFallarLaApp(() => this.setState({ fallo: true }));
  }
  componentWillUnmount() {
    this.quitar?.();
  }
  render() {
    if (this.state.fallo) return <PantallaDeError texto="La app tuvo un problema. Tus datos están bien; intenta de nuevo." alReintentar={() => this.setState((s) => ({ fallo: false, vuelta: s.vuelta + 1 }))} />;
    return <View key={this.state.vuelta} style={{ flex: 1 }}>{this.props.children}</View>;
  }
}

/** Para una parte de una pantalla (el mapa): si truena, enseña `alternativa` y lo demás sigue. */
export class LimiteDeParte extends Component<{ nombre: string; alternativa: ReactNode; children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false };
  static getDerivedStateFromError() {
    return { fallo: true };
  }
  componentDidCatch(error: unknown) {
    reportarError(error, { origen: this.props.nombre });
  }
  render() {
    return this.state.fallo ? this.props.alternativa : this.props.children;
  }
}
