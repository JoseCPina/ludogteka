import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { alCambiarSesion, cargarSesion, type Tokens } from "./api";

type EstadoSesion = { cargando: boolean; conSesion: boolean };
const Contexto = createContext<EstadoSesion>({ cargando: true, conSesion: false });

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>({ cargando: true, conSesion: false });
  useEffect(() => {
    let vivo = true;
    cargarSesion().then((t) => vivo && setEstado({ cargando: false, conSesion: Boolean(t) }));
    const quitar = alCambiarSesion((t: Tokens | null) => setEstado({ cargando: false, conSesion: Boolean(t) }));
    return () => {
      vivo = false;
      quitar();
    };
  }, []);
  return <Contexto value={estado}>{children}</Contexto>;
}

export const useSesion = () => use(Contexto);
