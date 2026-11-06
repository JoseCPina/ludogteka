import { useState } from "react";
import { Pressable, View } from "react-native";
import { llamar } from "@/lib/api";
import { useAccion } from "@/lib/datos";
import { pesos } from "@/lib/formato";
import { miUbicacion } from "@/lib/ubicacion";
import { Boton, Campo, Mensaje, Texto } from "./ui";
import { Icono } from "./icono";
import { radio, useColores } from "@/tema";

export type RecoleccionPedida = { direccion: string; lat: number | null; lng: number | null; punto: "negocio"; km: number; hora: string | null };
type Cotizacion = { km: number | null; precio: number | null; precio_km: number | null; sin_tarifa: string | null };

/**
 * «Incluir recolección» al pedir una cita o reservar: la dirección (escrita, con tu ubicación para calcular los km) y lo
 * que cuesta antes de confirmar. Lo pide el dueño; el negocio lo ve en su tablero del día y entra a su cuenta.
 */
export function RecoleccionPedir({ negocioId, mascotaId, alCambiar }: { negocioId: string; mascotaId: string; alCambiar: (r: RecoleccionPedida | null) => void }) {
  const c = useColores();
  const [activa, setActiva] = useState(false);
  const [direccion, setDireccion] = useState("");
  const [cotizada, setCotizada] = useState<{ km: number; precio: number } | null>(null);
  const accion = useAccion();

  const invalidar = () => {
    setCotizada(null);
    alCambiar(null);
  };
  const cotizar = () =>
    accion.ejecutar(async () => {
      const u = await miUbicacion({ precisa: true, avisar: true });
      const r = await llamar<{ datos?: Cotizacion }>("cotizarRecoleccion", [negocioId, mascotaId, direccion, u?.lat ?? null, u?.lng ?? null, "negocio"]);
      if (r.error) return r;
      const q = r.datos;
      if (q?.sin_tarifa) return { error: "Este negocio todavía no tiene precio de recolección. Pregúntale por WhatsApp." };
      if (q?.km == null || q.precio == null) return { error: "No pudimos calcular la distancia. Da permiso de ubicación desde tu casa o pregúntale al negocio." };
      setCotizada({ km: Number(q.km), precio: Number(q.precio) });
      alCambiar({ direccion: direccion.trim(), lat: u?.lat ?? null, lng: u?.lng ?? null, punto: "negocio", km: Number(q.km), hora: null });
      return r;
    });

  return (
    <View style={{ gap: 12, backgroundColor: c.superficie, borderRadius: radio.tarjeta, padding: 16 }}>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: activa }}
        onPress={() => {
          setActiva(!activa);
          invalidar();
        }}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 }}
      >
        <Icono nombre="pin" tamano={22} color={c.primario} />
        <View style={{ flex: 1 }}>
          <Texto v="cuerpoFuerte">Incluir recolección</Texto>
          <Texto v="secundario">Pasan por tu mascota. Se cobra por kilómetro.</Texto>
        </View>
        <View style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: activa ? c.primario : c.linea, justifyContent: "center", paddingHorizontal: 2, alignItems: activa ? "flex-end" : "flex-start" }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFFFFF" }} />
        </View>
      </Pressable>
      {activa ? (
        <>
          <Campo etiqueta="¿Dónde pasan por ella?" value={direccion} onChangeText={(t) => { setDireccion(t); invalidar(); }} placeholder="Calle, número y colonia" />
          <Mensaje texto={accion.error} />
          {cotizada ? (
            <Texto v="cuerpoFuerte" color={c.exito}>{cotizada.km} km · {pesos(cotizada.precio)}. Entra a tu cuenta al confirmar.</Texto>
          ) : (
            <Boton compacto variante="secundario" titulo="Ver cuánto cuesta" alTocar={cotizar} cargando={accion.ocupado} deshabilitado={direccion.trim().length < 5} />
          )}
        </>
      ) : null}
    </View>
  );
}
