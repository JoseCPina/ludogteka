import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import * as SecureStoreNativo from "expo-secure-store";
import { cuentaDeLaSesion } from "./api";

/**
 * Lo que ya vio esta persona en este celular (por cuenta y por dispositivo): la bienvenida de tres pasos y la hoja de cada
 * pestaña. Si el almacén del celular falla, no pasa nada: a lo mucho se enseña otra vez.
 */
export type Seccion = "mascotas" | "cerca" | "alertas" | "avisos" | "yo";
const SECCIONES: Seccion[] = ["mascotas", "cerca", "alertas", "avisos", "yo"];
type Vistos = Partial<Record<Seccion | "bienvenida", boolean>>;

const web = Platform.OS === "web";
const leer = async (k: string) => (web ? globalThis.localStorage?.getItem(k) ?? null : SecureStoreNativo.getItemAsync(k).catch(() => null));
const escribir = async (k: string, v: string) => {
  if (web) globalThis.localStorage?.setItem(k, v);
  else await SecureStoreNativo.setItemAsync(k, v).catch(() => {});
};

const Contexto = createContext<{ listo: boolean; vistos: Vistos; marcar: (s: Seccion | "bienvenida") => void; marcarTodas: () => void }>({ listo: false, vistos: {}, marcar: () => {}, marcarTodas: () => {} });

export function ProveedorOnboarding({ children }: { children: ReactNode }) {
  const llave = useMemo(() => `peludesk.visto.${(cuentaDeLaSesion() ?? "sin_cuenta").replace(/[^A-Za-z0-9._-]/g, "")}`, []);
  const [vistos, setVistos] = useState<Vistos>({});
  const [listo, setListo] = useState(false);
  useEffect(() => {
    let vivo = true;
    leer(llave).then((t) => {
      if (!vivo) return;
      try {
        setVistos(t ? (JSON.parse(t) as Vistos) : {});
      } catch {
        setVistos({});
      }
      setListo(true);
    });
    return () => {
      vivo = false;
    };
  }, [llave]);
  const guardar = useCallback(
    (cambio: Vistos) =>
      setVistos((v) => {
        const n = { ...v, ...cambio };
        void escribir(llave, JSON.stringify(n));
        return n;
      }),
    [llave]
  );
  const marcar = useCallback((s: Seccion | "bienvenida") => guardar({ [s]: true }), [guardar]);
  const marcarTodas = useCallback(() => guardar(Object.fromEntries(SECCIONES.map((s) => [s, true]))), [guardar]);
  return <Contexto value={{ listo, vistos, marcar, marcarTodas }}>{children}</Contexto>;
}

export const useOnboarding = () => use(Contexto);
