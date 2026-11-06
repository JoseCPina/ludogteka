import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, Platform, Pressable, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import * as Haptics from "expo-haptics";
import { hoyLocal } from "@/lib/formato";
import { Boton, Chip, Texto } from "./ui";
import { Icono } from "./icono";
import { fuentes, radio, useColores } from "@/tema";

/**
 * Ruedas (referencias: TikTok y Cal AI, banda en el renglón elegido): el mismo control en Android y en iPhone, con los
 * colores del tema claro u oscuro. Es para fechas de hace años o meses; nunca el calendario de meses. Las citas y
 * reservas cercanas siguen con su propia cuadrícula.
 */
const ALTO = 44;
const VISIBLES = 5;

export type OpcionRueda = { valor: number; texto: string };

export function Rueda({ opciones, valor, alCambiar, etiqueta, ancho }: { opciones: OpcionRueda[]; valor: number; alCambiar: (v: number) => void; etiqueta: string; ancho?: number }) {
  const c = useColores();
  const lista = useRef<FlatList<OpcionRueda>>(null);
  const indice = Math.max(0, opciones.findIndex((o) => o.valor === valor));
  const moviendo = useRef(false);

  // Lo que cambie desde fuera (un atajo, otra rueda que recorta los días) mueve esta rueda.
  useEffect(() => {
    if (moviendo.current) return;
    lista.current?.scrollToOffset({ offset: indice * ALTO, animated: false });
  }, [indice]);

  const alTerminar = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    moviendo.current = false;
    const i = Math.min(opciones.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.y / ALTO)));
    if (opciones[i] && opciones[i].valor !== valor) {
      Haptics.selectionAsync().catch(() => {});
      alCambiar(opciones[i].valor);
    }
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={etiqueta}
      accessibilityValue={{ text: opciones[indice]?.texto ?? "" }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => {
        const i = indice + (e.nativeEvent.actionName === "increment" ? 1 : -1);
        if (opciones[i]) alCambiar(opciones[i].valor);
      }}
      style={{ height: ALTO * VISIBLES, width: ancho, flex: ancho ? undefined : 1 }}
    >
      <FlatList
        ref={lista}
        data={opciones}
        extraData={indice}
        keyExtractor={(o) => String(o.valor)}
        initialScrollIndex={indice}
        getItemLayout={(_, i) => ({ length: ALTO, offset: ALTO * i, index: i })}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        snapToInterval={ALTO}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: ALTO * Math.floor(VISIBLES / 2) }}
        onScrollBeginDrag={() => { moviendo.current = true; }}
        onMomentumScrollEnd={alTerminar}
        onScrollEndDrag={Platform.OS === "android" ? undefined : (e) => { if (!e.nativeEvent.velocity?.y) alTerminar(e); }}
        renderItem={({ item, index }) => {
          const d = Math.abs(index - indice);
          return (
            <View style={{ height: ALTO, alignItems: "center", justifyContent: "center" }}>
              <Text numberOfLines={1} style={{ fontFamily: d === 0 ? fuentes.semi : fuentes.normal, fontSize: d === 0 ? 19 : 17, color: d === 0 ? c.texto : c.textoTenue, opacity: d > 1 ? 0.55 : 1 }}>{item.texto}</Text>
            </View>
          );
        }}
      />
    </View>
  );
}

/** La banda detrás del renglón elegido, y las ruedas encima. */
export function MarcoRuedas({ children }: { children: React.ReactNode }) {
  const c = useColores();
  return (
    <View style={{ height: ALTO * VISIBLES, justifyContent: "center" }}>
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, height: ALTO, backgroundColor: c.primarioSuave, borderRadius: radio.control }} />
      <View style={{ flexDirection: "row", gap: 4, paddingHorizontal: 8 }}>{children}</View>
    </View>
  );
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** Con año: aquí se escogen fechas de hace años o de años que vienen. */
const fechaConAnio = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
const partes = (iso: string) => iso.split("-").map(Number) as [number, number, number];
const armar = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const diasDelMes = (a: number, m: number) => new Date(a, m, 0).getDate();

/** Tres ruedas: día, mes y año, dentro del rango. Nunca deja una fecha inexistente ni fuera de `minimo`–`maximo`. */
export function RuedasFecha({ valor, alCambiar, minimo, maximo }: { valor: string; alCambiar: (v: string) => void; minimo: string; maximo: string }) {
  const [a, m, d] = partes(valor);
  const [aMin] = partes(minimo);
  const [aMax] = partes(maximo);
  const anios = useMemo(() => {
    const r: OpcionRueda[] = [];
    for (let x = aMax; x >= aMin; x--) r.push({ valor: x, texto: String(x) });
    return r;
  }, [aMin, aMax]);
  const meses = useMemo(() => MESES.map((t, i) => ({ valor: i + 1, texto: t })), []);
  const dias = useMemo(() => Array.from({ length: diasDelMes(a, m) }, (_, i) => ({ valor: i + 1, texto: String(i + 1) })), [a, m]);
  const poner = (na: number, nm: number, nd: number) => {
    const f = armar(na, nm, Math.min(nd, diasDelMes(na, nm)));
    alCambiar(f < minimo ? minimo : f > maximo ? maximo : f);
  };
  return (
    <MarcoRuedas>
      <Rueda etiqueta="Día" ancho={64} opciones={dias} valor={d} alCambiar={(v) => poner(a, m, v)} />
      <Rueda etiqueta="Mes" opciones={meses} valor={m} alCambiar={(v) => poner(a, v, d)} />
      <Rueda etiqueta="Año" ancho={88} opciones={anios} valor={a} alCambiar={(v) => poner(v, m, d)} />
    </MarcoRuedas>
  );
}

export const restarDiasIso = (iso: string, n: number) => {
  const [a, m, d] = partes(iso);
  const x = new Date(a, m - 1, d - n);
  return armar(x.getFullYear(), x.getMonth() + 1, x.getDate());
};
export const sumarMesesIso = (iso: string, n: number) => {
  const [a, m, d] = partes(iso);
  const x = new Date(a, m - 1 + n, 1);
  return armar(x.getFullYear(), x.getMonth() + 1, Math.min(d, diasDelMes(x.getFullYear(), x.getMonth() + 1)));
};

/** Atajos para las fechas recientes de la cartilla. */
const ATAJOS: { texto: string; fecha: (hoy: string) => string }[] = [
  { texto: "Hoy", fecha: (h) => h },
  { texto: "Ayer", fecha: (h) => restarDiasIso(h, 1) },
  { texto: "Hace una semana", fecha: (h) => restarDiasIso(h, 7) },
  { texto: "Hace un mes", fecha: (h) => sumarMesesIso(h, -1) },
];

/** Campo que abre una hoja con las ruedas. Valor AAAA-MM-DD. */
export function CampoFechaRuedas({ etiqueta, valor, alCambiar, minimo, maximo, ayuda, conAtajos, sinQuitar }: {
  etiqueta: string; valor: string | null; alCambiar: (v: string | null) => void; minimo?: string; maximo?: string; ayuda?: string; conAtajos?: boolean; sinQuitar?: boolean;
}) {
  const c = useColores();
  const hoy = hoyLocal();
  const min = minimo ?? armar(partes(hoy)[0] - 40, 1, 1);
  const max = maximo ?? armar(partes(hoy)[0] + 5, 12, 31);
  const [abierto, setAbierto] = useState(false);
  const inicial = valor ?? (hoy > max ? max : hoy < min ? min : hoy);
  const [borrador, setBorrador] = useState(inicial);
  const abrir = () => {
    setBorrador(inicial);
    setAbierto(true);
  };
  return (
    <View style={{ gap: 6 }}>
      <Texto v="secundario" color={c.texto} style={{ fontFamily: fuentes.media }}>{etiqueta}</Texto>
      <Pressable onPress={abrir} accessibilityRole="button" accessibilityLabel={`${etiqueta}: ${valor ? fechaConAnio(valor) : "sin escoger"}`} style={{ minHeight: 50, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, backgroundColor: c.superficie, borderRadius: radio.control, borderWidth: 1, borderColor: c.linea }}>
        <Icono nombre="calendario" tamano={18} color={c.primario} />
        <Texto color={valor ? c.texto : c.textoTenue} style={{ flex: 1 }}>{valor ? fechaConAnio(valor) : "Escoger fecha"}</Texto>
        {valor && !sinQuitar ? (
          <Pressable onPress={() => alCambiar(null)} hitSlop={10} accessibilityLabel="Quitar la fecha">
            <Icono nombre="cerrar" tamano={16} color={c.textoTenue} />
          </Pressable>
        ) : null}
      </Pressable>
      {ayuda ? <Texto v="secundario">{ayuda}</Texto> : null}
      <Modal visible={abierto} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setAbierto(false)}>
        <Pressable accessibilityLabel="Cerrar" onPress={() => setAbierto(false)} style={{ flex: 1, backgroundColor: c.velo }} />
        <View style={{ backgroundColor: c.superficie, borderTopLeftRadius: radio.hoja, borderTopRightRadius: radio.hoja, padding: 20, paddingBottom: 32, gap: 14 }}>
          <Texto v="encabezado" centrado>{etiqueta}</Texto>
          {conAtajos ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {ATAJOS.map((x) => {
                const f = x.fecha(hoy);
                return <Chip key={x.texto} texto={x.texto} activo={borrador === f} alTocar={() => setBorrador(f)} />;
              })}
            </View>
          ) : null}
          <RuedasFecha valor={borrador} alCambiar={setBorrador} minimo={min} maximo={max} />
          <Boton titulo="Listo" alTocar={() => { alCambiar(borrador); setAbierto(false); }} />
        </View>
      </Modal>
    </View>
  );
}
