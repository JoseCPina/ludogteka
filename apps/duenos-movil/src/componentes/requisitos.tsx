import { View } from "react-native";
import { router } from "expo-router";
import { llamar } from "@/lib/api";
import { useAccion } from "@/lib/datos";
import { Boton, Mensaje, Texto } from "./ui";
import { radio, useColores } from "@/tema";

export type Requisito = { clave: string; titulo: string; explicacion: string; accion: "cartilla" | "contrato" | null };
export type Revision = { faltan: Requisito[]; puedePedirLugar: boolean };

/**
 * Lo que falta para reservar o pedir cita, en palabras del dueño (el texto sale del catálogo del servidor,
 * src/lib/app/requisitos.ts). Nunca es una pared: se resuelve aquí mismo o se pide lugar y el negocio contesta.
 */
export function Requisitos({ revision, negocioId, mascotaId }: { revision: Revision; negocioId: string; mascotaId: string }) {
  const c = useColores();
  const firmar = useAccion();
  const irAFirmar = () =>
    firmar.ejecutar(async () => {
      const r = await llamar<{ datos?: { id: string; tipo_nombre: string }[] }>("prepararContratos", [negocioId, mascotaId]);
      const primero = r.datos?.[0];
      if (primero) router.push(`/contratos/${negocioId}/${primero.id}`);
      return r;
    });
  return (
    <View style={{ backgroundColor: c.superficie, borderRadius: radio.tarjeta, padding: 16, gap: 14 }} accessibilityLabel="Antes de tu lugar">
      <Texto v="encabezado">{revision.puedePedirLugar ? "Antes de tu lugar" : "Esa fecha no se puede"}</Texto>
      {revision.faltan.map((f, i) => (
        <View key={`${f.clave}${i}`} style={{ gap: 6 }}>
          <Texto v="cuerpoFuerte">{f.titulo}</Texto>
          <Texto v="secundario">{f.explicacion}</Texto>
          {f.accion === "cartilla" ? <Boton compacto ancho={false} variante="secundario" titulo="Subir su cartilla" alTocar={() => router.push(`/mascotas/${mascotaId}/cartilla`)} /> : null}
          {f.accion === "contrato" ? <Boton compacto ancho={false} variante="secundario" titulo="Firmar aquí" alTocar={irAFirmar} cargando={firmar.ocupado} /> : null}
        </View>
      ))}
      <Mensaje texto={firmar.error} />
    </View>
  );
}
