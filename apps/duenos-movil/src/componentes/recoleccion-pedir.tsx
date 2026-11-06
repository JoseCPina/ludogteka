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
type Cotizacion = { km: number | null; precio: number | null };

/**
 * «Incluir recolección» al pedir una cita o reservar: la dirección (la guardada o una nueva) y lo que cuesta antes de
 * confirmar. Los km los calcula el servidor por esa dirección; la ubicación del celular solo propone una dirección que la
 * persona confirma. Lo pide el dueño; el negocio lo ve en su tablero del día y entra a su cuenta.
 */
export function RecoleccionPedir({ negocioId, mascotaId, alCambiar }: { negocioId: string; mascotaId: string; alCambiar: (r: RecoleccionPedida | null) => void }) {
  const c = useColores();
  const [activa, setActiva] = useState(false);
  const [direccion, setDireccion] = useState("");
  const [cotizada, setCotizada] = useState<{ km: number; precio: number } | null>(null);
  const accion = useAccion();
  const ubicando = useAccion();

  const invalidar = () => {
    setCotizada(null);
    alCambiar(null);
  };
  const prender = () => {
    const nueva = !activa;
    setActiva(nueva);
    invalidar();
    if (nueva && !direccion) {
      llamar<{ direccion?: string | null }>("direccionGuardada", [negocioId, mascotaId])
        .then((r) => {
          if (r.direccion) setDireccion(r.direccion);
        })
        .catch(() => {});
    }
  };
  const usarUbicacion = () =>
    ubicando.ejecutar(async () => {
      const u = await miUbicacion({ precisa: true, avisar: true });
      if (!u) return { error: "No pudimos saber dónde estás. Escribe la dirección." };
      const r = await llamar<{ direccion?: string }>("direccionDeMiUbicacion", [negocioId, mascotaId, u.lat, u.lng]);
      if (r.direccion) {
        setDireccion(r.direccion);
        invalidar();
      }
      return r;
    });
  const cotizar = () =>
    accion.ejecutar(async () => {
      const r = await llamar<{ datos?: Cotizacion; lat?: number | null; lng?: number | null }>("cotizarRecoleccion", [negocioId, mascotaId, direccion, null, null, "negocio"]);
      if (r.error) return r;
      const q = r.datos;
      if (q?.km == null || q.precio == null) return { error: "No pudimos calcular la distancia. Pregúntale al negocio." };
      setCotizada({ km: Number(q.km), precio: Number(q.precio) });
      alCambiar({ direccion: direccion.trim(), lat: r.lat ?? null, lng: r.lng ?? null, punto: "negocio", km: Number(q.km), hora: null });
      return r;
    });

  return (
    <View style={{ gap: 12, backgroundColor: c.superficie, borderRadius: radio.tarjeta, padding: 16 }}>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: activa }}
        onPress={prender}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 }}
      >
        <Icono nombre="pin" tamano={22} color={c.primario} />
        <View style={{ flex: 1 }}>
          <Texto v="cuerpoFuerte">Incluir recolección</Texto>
          <Texto v="secundario">Pasan por tu mascota. Se cobra por kilómetro hasta esa dirección.</Texto>
        </View>
        <View style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: activa ? c.primario : c.linea, justifyContent: "center", paddingHorizontal: 2, alignItems: activa ? "flex-end" : "flex-start" }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFFFFF" }} />
        </View>
      </Pressable>
      {activa ? (
        <>
          <Campo etiqueta="¿Dónde pasan por ella?" value={direccion} onChangeText={(t) => { setDireccion(t); invalidar(); }} placeholder="Calle, número y colonia" />
          <Boton compacto ancho={false} variante="texto" titulo="¿Usar donde estás ahora?" alTocar={usarUbicacion} cargando={ubicando.ocupado} />
          <Mensaje texto={accion.error ?? ubicando.error} />
          {cotizada ? (
            <Texto v="cuerpoFuerte" color={c.exito}>{cotizada.km < 1 ? "Menos de 1 km" : `${cotizada.km} km`} · {pesos(cotizada.precio)}. Entra a tu cuenta al confirmar.</Texto>
          ) : (
            <Boton compacto variante="secundario" titulo="Ver cuánto cuesta" alTocar={cotizar} cargando={accion.ocupado} deshabilitado={direccion.trim().length < 5} />
          )}
        </>
      ) : null}
    </View>
  );
}
