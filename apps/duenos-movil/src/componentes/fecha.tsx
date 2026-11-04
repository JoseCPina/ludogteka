import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { fechaLarga } from "@/lib/formato";
import { Texto } from "./ui";
import { Icono } from "./icono";
import { radio, useColores } from "@/tema";

const aIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const deIso = (s: string) => {
  const [a, m, d] = s.split("-").map(Number);
  return new Date(a, m - 1, d);
};

/** Campo de fecha con el selector del sistema (diálogo en Android, rueda en iOS). Valor AAAA-MM-DD. */
export function CampoFecha({ etiqueta, valor, alCambiar, minimo, maximo, ayuda }: { etiqueta: string; valor: string | null; alCambiar: (v: string | null) => void; minimo?: string; maximo?: string; ayuda?: string }) {
  const c = useColores();
  const [abierto, setAbierto] = useState(false);
  const abrir = () => {
    const base = valor ? deIso(valor) : maximo ? deIso(maximo) : new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({ value: base, mode: "date", minimumDate: minimo ? deIso(minimo) : undefined, maximumDate: maximo ? deIso(maximo) : undefined, onChange: (e, d) => e.type === "set" && d && alCambiar(aIso(d)) });
    } else setAbierto((x) => !x);
  };
  return (
    <View style={{ gap: 6 }}>
      <Texto v="secundario" color={c.texto} style={{ fontFamily: "Outfit_500Medium" }}>{etiqueta}</Texto>
      <Pressable onPress={abrir} accessibilityRole="button" accessibilityLabel={`${etiqueta}: ${valor ? fechaLarga(valor) : "sin escoger"}`} style={{ minHeight: 50, borderRadius: radio.control, borderWidth: 1, borderColor: c.linea, backgroundColor: c.superficie, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Icono nombre="calendario" tamano={18} color={c.primario} />
        <Texto color={valor ? c.texto : c.textoTenue} style={{ flex: 1 }}>{valor ? fechaLarga(valor) : "Escoger fecha"}</Texto>
        {valor ? (
          <Pressable onPress={() => alCambiar(null)} hitSlop={10} accessibilityLabel="Quitar la fecha">
            <Icono nombre="cerrar" tamano={16} color={c.textoTenue} />
          </Pressable>
        ) : null}
      </Pressable>
      {Platform.OS === "ios" && abierto ? (
        <DateTimePicker value={valor ? deIso(valor) : new Date()} mode="date" display="spinner" locale="es-MX" minimumDate={minimo ? deIso(minimo) : undefined} maximumDate={maximo ? deIso(maximo) : undefined} onChange={(_, d) => d && alCambiar(aIso(d))} />
      ) : null}
      {ayuda ? <Texto v="secundario">{ayuda}</Texto> : null}
    </View>
  );
}
