import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { distancia, haceCuanto } from "@/lib/formato";
import { Insignia, Texto } from "./ui";
import { Icono } from "./icono";
import { coloresLugar, radio, useColores } from "@/tema";

export type AlertaLista = { id: string; tipo: "perdido" | "herido" | "peligro" | "abandonado"; especie: string; descripcion: string | null; lat: number; lng: number; estado: string; created_at: string; actualizaciones: number; distancia_m: number; es_mia: boolean; fotoUrl: string | null };
export const TIPO_ALERTA: Record<string, string> = { perdido: "Parece perdido", herido: "Herido", peligro: "En peligro", abandonado: "Abandonado" };
export const ESTADO_ALERTA: Record<string, { t: string; tono: "aviso" | "neutro" | "exito" | "primario" }> = {
  sigue_ahi: { t: "Sigue ahí", tono: "aviso" }, ya_no_esta: { t: "Ya no está", tono: "neutro" }, rescatado: { t: "Rescatado", tono: "exito" }, reunido: { t: "Con su familia", tono: "exito" }, caducada: { t: "Ya no está activa", tono: "neutro" },
};

export function TarjetaAlerta({ a }: { a: AlertaLista }) {
  const c = useColores();
  const e = ESTADO_ALERTA[a.estado] ?? ESTADO_ALERTA.sigue_ahi;
  return (
    <Pressable onPress={() => router.push(`/alertas/${a.id}`)} accessibilityRole="button" style={({ pressed }) => [{ backgroundColor: c.superficie, borderRadius: radio.tarjeta, overflow: "hidden" }, pressed && { opacity: 0.85 }]}>
      {a.fotoUrl ? <Image source={{ uri: a.fotoUrl }} style={{ width: "100%", aspectRatio: 16 / 10 }} contentFit="cover" transition={150} /> : null}
      <View style={{ padding: 14, gap: 6 }}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: coloresLugar[a.tipo === "perdido" ? "perdido" : a.tipo] }} />
          <Texto v="cuerpoFuerte" style={{ flex: 1 }}>{TIPO_ALERTA[a.tipo]} · {a.especie === "gato" ? "gato" : a.especie === "perro" ? "perro" : "animal"}</Texto>
          <Insignia texto={a.es_mia ? "Tu alerta" : e.t} tono={a.es_mia ? "primario" : e.tono} />
        </View>
        {a.descripcion ? <Texto v="secundario" lineas={2}>{a.descripcion}</Texto> : null}
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Icono nombre="pin" tamano={14} color={c.textoTenue} />
          <Texto v="pie" color={c.textoTenue}>{distancia(a.distancia_m)} · {haceCuanto(a.created_at)}{a.actualizaciones ? ` · ${a.actualizaciones} ${a.actualizaciones === 1 ? "novedad" : "novedades"}` : ""}</Texto>
        </View>
      </View>
    </Pressable>
  );
}
