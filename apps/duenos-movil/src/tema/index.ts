import { useColorScheme } from "react-native";
import { colores, type Colores } from "./tokens";

export * from "./tokens";

/** Los colores del modo del celular (claro u oscuro). */
export function useColores(): Colores {
  return useColorScheme() === "dark" ? colores.oscuro : colores.claro;
}

export function useEsOscuro(): boolean {
  return useColorScheme() === "dark";
}
