import { View } from "react-native";
import { Texto } from "./ui";
import { radio, useColores } from "@/tema";

export type Requisito = { clave: string; titulo: string; explicacion: string; accion: string | null };
export type Revision = { faltan: Requisito[]; puedePedirLugar: boolean };

/**
 * Lo que falta para reservar o pedir cita, en palabras del dueño (el texto sale del catálogo del servidor,
 * src/lib/app/requisitos.ts). Nunca es una pared: se pide lugar y el negocio contesta. El contrato de alta no aparece
 * (se firma después de reservar o ahí mismo) y la cartilla de la app no se promete como registro del negocio.
 */
export function Requisitos({ revision }: { revision: Revision; negocioId?: string; mascotaId?: string }) {
  const c = useColores();
  return (
    <View style={{ backgroundColor: c.superficie, borderRadius: radio.tarjeta, padding: 16, gap: 14 }} accessibilityLabel="Antes de tu lugar">
      <Texto v="encabezado">{revision.puedePedirLugar ? "Antes de tu lugar" : "Esa fecha no se puede"}</Texto>
      {revision.faltan.map((f, i) => (
        <View key={`${f.clave}${i}`} style={{ gap: 6 }}>
          <Texto v="cuerpoFuerte">{f.titulo}</Texto>
          <Texto v="secundario">{f.explicacion}</Texto>
        </View>
      ))}
    </View>
  );
}
