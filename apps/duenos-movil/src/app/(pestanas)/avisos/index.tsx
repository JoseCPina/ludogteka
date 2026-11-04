import { useEffect, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { Stack, router } from "expo-router";
import { llamar } from "@/lib/api";
import { usePantalla, useAccion } from "@/lib/datos";
import { haceCuanto } from "@/lib/formato";
import { activarPush, rutaDeAviso, type EstadoPush } from "@/lib/push";
import { Pantalla } from "@/componentes/pantalla";
import { Boton, Mensaje, Texto, Vacio } from "@/componentes/ui";
import { Icono, type NombreIcono } from "@/componentes/icono";
import { radio, useColores } from "@/tema";

type Aviso = { id: string; tipo: string; titulo: string; cuerpo: string; url: string | null; leidoAt: string | null; createdAt: string };
const ICONO: Record<string, NombreIcono> = { recordatorio: "vacuna", vacuna: "vacuna", medicamento: "medicina", perdida: "alerta", alerta: "alerta", hallazgo: "chat", negocio: "tienda2", bienvenida: "mascota", prueba: "aviso" };

/** Avisos: lo que le llegó (recordatorios, su negocio, mascotas perdidas cerca), con el estado de las notificaciones. */
export default function Avisos() {
  const c = useColores();
  const p = usePantalla<{ avisos: Aviso[]; dispositivos: number }>("avisos");
  const [push, setPush] = useState<EstadoPush | null>(null);
  const accion = useAccion();
  useEffect(() => {
    activarPush(false).then(setPush);
  }, []);
  const sinLeer = (p.datos?.avisos ?? []).filter((a) => !a.leidoAt).length;

  const abrir = async (a: Aviso) => {
    if (!a.leidoAt) llamar("marcarLeido", [a.id]).then(() => p.recargar()).catch(() => {});
    const ruta = rutaDeAviso(a.url);
    if (ruta && ruta !== "/avisos") router.push(ruta as never);
  };

  return (
    <>
      <Stack.Screen options={{ headerRight: () => (sinLeer ? <Pressable hitSlop={8} onPress={async () => { await accion.ejecutar(() => llamar("marcarTodosLeidos")); p.recargar(); }}><Texto v="secundario" color={c.primario}>Marcar leídos</Texto></Pressable> : null) }} />
      <Pantalla cargando={p.cargando} error={p.error} refrescando={p.refrescando} alRefrescar={p.refrescar} alReintentar={p.refrescar}>
        {push && push !== "activas" ? (
          <View style={{ backgroundColor: c.primarioSuave, borderRadius: radio.tarjeta, padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <Icono nombre="aviso" tamano={24} color={c.primario} />
              <View style={{ flex: 1 }}>
                <Texto v="cuerpoFuerte">{push === "denegadas" ? "Las notificaciones están apagadas" : "Activa las notificaciones"}</Texto>
                <Texto v="secundario">{push === "sin_configurar" ? "Este celular todavía no puede recibirlas. Te seguimos avisando aquí y por WhatsApp." : "Para enterarte de sus vacunas, de tu negocio y de mascotas perdidas cerca."}</Texto>
              </View>
            </View>
            {push === "denegadas" ? <Boton compacto variante="secundario" titulo="Abrir ajustes" alTocar={() => Linking.openSettings()} /> : push !== "sin_configurar" && push !== "simulador" ? <Boton compacto titulo="Activar" alTocar={async () => setPush(await activarPush(true))} /> : null}
          </View>
        ) : null}
        <Mensaje texto={accion.error} />
        {p.datos && p.datos.avisos.length === 0 ? <Vacio icono="aviso" titulo="Sin avisos todavía" texto="Aquí te llegan sus recordatorios, lo que te diga tu negocio y las mascotas perdidas cerca." /> : null}
        <View style={{ gap: 8 }}>
          {(p.datos?.avisos ?? []).map((a) => (
            <Pressable key={a.id} onPress={() => abrir(a)} accessibilityRole="button" style={({ pressed }) => [{ flexDirection: "row", gap: 12, padding: 14, borderRadius: radio.tarjeta, backgroundColor: a.leidoAt ? "transparent" : c.superficie }, pressed && { opacity: 0.75 }]}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: a.tipo === "perdida" || a.tipo === "alerta" ? c.peligroSuave : c.primarioSuave, alignItems: "center", justifyContent: "center" }}>
                <Icono nombre={ICONO[a.tipo] ?? "aviso"} tamano={20} color={a.tipo === "perdida" || a.tipo === "alerta" ? c.peligro : c.primario} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Texto v="cuerpoFuerte" style={{ flex: 1 }} lineas={2}>{a.titulo}</Texto>
                  <Texto v="pie" color={c.textoTenue}>{haceCuanto(a.createdAt)}</Texto>
                </View>
                <Texto v="secundario" lineas={3}>{a.cuerpo}</Texto>
              </View>
              {!a.leidoAt ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primario, marginTop: 6 }} /> : null}
            </Pressable>
          ))}
        </View>
      </Pantalla>
    </>
  );
}
