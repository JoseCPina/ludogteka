import { type ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { espacio, radio, tipo, useColores, type EstiloTexto } from "@/tema";
import { Icono, type NombreIcono } from "./icono";

// ── Texto ─────────────────────────────────────────────────────────────────
export function Texto({ v = "cuerpo", color, children, style, lineas, centrado }: { v?: EstiloTexto; color?: string; children: ReactNode; style?: StyleProp<TextStyle>; lineas?: number; centrado?: boolean }) {
  const c = useColores();
  const porOmision = v === "secundario" || v === "pie" ? c.textoSuave : c.texto;
  return (
    <Text numberOfLines={lineas} style={[tipo[v], { color: color ?? porOmision }, centrado && { textAlign: "center" }, style]} maxFontSizeMultiplier={1.6}>
      {children}
    </Text>
  );
}

// ── Botón: primario (relleno), secundario (suave), texto, peligro ─────────
type VarianteBoton = "primario" | "secundario" | "texto" | "peligro";
export function Boton({ titulo, alTocar, variante = "primario", icono, cargando, deshabilitado, compacto, ancho = true, style }: {
  titulo: string; alTocar: () => void; variante?: VarianteBoton; icono?: NombreIcono; cargando?: boolean; deshabilitado?: boolean; compacto?: boolean; ancho?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const c = useColores();
  const fondo = { primario: c.primario, secundario: c.primarioSuave, texto: "transparent", peligro: c.peligro }[variante];
  const tinta = { primario: c.sobrePrimario, secundario: c.primario, texto: c.primario, peligro: "#FFFFFF" }[variante];
  const inactivo = deshabilitado || cargando;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactivo, busy: cargando }}
      disabled={inactivo}
      onPress={() => {
        Haptics.impactAsync(variante === "texto" ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        alTocar();
      }}
      android_ripple={{ color: "rgba(255,255,255,0.18)", borderless: false }}
      style={({ pressed }) => [
        { backgroundColor: fondo, minHeight: compacto ? 40 : 52, paddingHorizontal: compacto ? 14 : 20, borderRadius: radio.pastilla, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, overflow: "hidden", alignSelf: ancho ? "stretch" : "flex-start" },
        Platform.OS === "ios" && pressed && { opacity: 0.75 },
        inactivo && !cargando && { opacity: 0.45 },
        style,
      ]}
    >
      {cargando ? <ActivityIndicator color={tinta} /> : icono ? <Icono nombre={icono} tamano={18} color={tinta} /> : null}
      <Text style={[tipo.boton, { color: tinta }, compacto && { fontSize: 15 }]}>{cargando ? "Un momento…" : titulo}</Text>
    </Pressable>
  );
}

// ── Botón redondo de ícono (barra del mapa, cerrar) ───────────────────────
export function BotonIcono({ icono, alTocar, etiqueta, tamano = 44, relleno }: { icono: NombreIcono; alTocar: () => void; etiqueta: string; tamano?: number; relleno?: boolean }) {
  const c = useColores();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        alTocar();
      }}
      hitSlop={8}
      style={({ pressed }) => [{ width: tamano, height: tamano, borderRadius: tamano / 2, alignItems: "center", justifyContent: "center", backgroundColor: relleno ? c.superficie : c.superficieAlta }, relleno && sombra(c.sombra), pressed && { opacity: 0.7 }]}
    >
      <Icono nombre={icono} tamano={20} color={c.texto} />
    </Pressable>
  );
}

export const sombra = (color: string): ViewStyle => ({ shadowColor: color, shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4 });

// ── Grupo de filas (lista nativa): como Ajustes en iOS y las listas de Material ──
export function Grupo({ titulo, pie, children, style }: { titulo?: string; pie?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColores();
  return (
    <View style={[{ gap: 8 }, style]}>
      {titulo ? <Texto v="encabezado" style={{ paddingHorizontal: 4 }}>{titulo}</Texto> : null}
      <View style={{ backgroundColor: c.superficie, borderRadius: radio.tarjeta, overflow: "hidden" }}>{children}</View>
      {pie ? <Texto v="secundario" style={{ paddingHorizontal: 4 }}>{pie}</Texto> : null}
    </View>
  );
}

export function Fila({ titulo, detalle, icono, colorIcono, imagen, derecha, alTocar, ultima, destacado, peligro }: {
  titulo: string; detalle?: string | null; icono?: NombreIcono; colorIcono?: string; imagen?: string | null; derecha?: ReactNode; alTocar?: () => void; ultima?: boolean; destacado?: string; peligro?: boolean;
}) {
  const c = useColores();
  const contenido = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: espacio.l, paddingVertical: 13, minHeight: 56 }}>
      {imagen ? (
        <Image source={{ uri: imagen }} style={{ width: 40, height: 40, borderRadius: 12 }} contentFit="cover" transition={150} />
      ) : icono ? (
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: (colorIcono ?? c.primario) + "1F", alignItems: "center", justifyContent: "center" }}>
          <Icono nombre={icono} tamano={19} color={colorIcono ?? c.primario} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Texto v="cuerpoFuerte" color={peligro ? c.peligro : undefined} lineas={2}>{titulo}</Texto>
        {detalle ? <Texto v="secundario" lineas={3}>{detalle}</Texto> : null}
      </View>
      {destacado ? <Insignia texto={destacado} /> : null}
      {derecha}
      {alTocar && !derecha ? <Icono nombre="siguiente" tamano={16} color={c.textoTenue} /> : null}
    </View>
  );
  return (
    <View>
      {alTocar ? (
        <Pressable onPress={alTocar} android_ripple={{ color: c.superficieAlta }} style={({ pressed }) => [Platform.OS === "ios" && pressed && { backgroundColor: c.superficieAlta }]}>
          {contenido}
        </Pressable>
      ) : (
        contenido
      )}
      {!ultima ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.linea, marginLeft: icono || imagen ? 64 : espacio.l }} /> : null}
    </View>
  );
}

// ── Insignia y chip ──────────────────────────────────────────────────────
export type Tono = "neutro" | "primario" | "exito" | "aviso" | "peligro";
export function Insignia({ texto, tono = "primario" }: { texto: string; tono?: Tono }) {
  const c = useColores();
  const [fondo, tinta] = {
    neutro: [c.superficieAlta, c.textoSuave], primario: [c.primarioSuave, c.primario], exito: [c.exitoSuave, c.exito], aviso: [c.avisoSuave, c.aviso], peligro: [c.peligroSuave, c.peligro],
  }[tono];
  return (
    <View style={{ backgroundColor: fondo, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radio.pastilla, alignSelf: "flex-start" }}>
      <Texto v="pie" color={tinta}>{texto}</Texto>
    </View>
  );
}

export function Chip({ texto, activo, alTocar, icono, color }: { texto: string; activo?: boolean; alTocar: () => void; icono?: NombreIcono; color?: string }) {
  const c = useColores();
  const tinta = activo ? c.sobrePrimario : c.texto;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        alTocar();
      }}
      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 36, borderRadius: radio.pastilla, backgroundColor: activo ? c.primario : c.superficie, borderWidth: activo ? 0 : StyleSheet.hairlineWidth, borderColor: c.linea }, sombra(c.sombra), { shadowOpacity: 0.06, elevation: 1 }, pressed && { opacity: 0.8 }]}
    >
      {icono ? <Icono nombre={icono} tamano={15} color={activo ? tinta : (color ?? c.primario)} /> : null}
      <Text style={[tipo.secundario, { fontFamily: "Outfit_500Medium", color: tinta }]}>{texto}</Text>
    </Pressable>
  );
}

// ── Avatar de mascota: su foto, o su inicial sobre un color que sale de su nombre ──
const PALETA_AVATAR = ["#A7D8C8", "#F28C82", "#F5B85C", "#B9ABF0", "#9CC9E8", "#E6B8D8"];
export function AvatarMascota({ nombre, foto, tamano = 56 }: { nombre: string; foto?: string | null; tamano?: number }) {
  if (foto) return <Image source={{ uri: foto }} style={{ width: tamano, height: tamano, borderRadius: tamano * 0.32 }} contentFit="cover" transition={200} accessibilityLabel={`Foto de ${nombre}`} />;
  const fondo = PALETA_AVATAR[[...nombre].reduce((t, ch) => t + ch.charCodeAt(0), 0) % PALETA_AVATAR.length];
  return (
    <View style={{ width: tamano, height: tamano, borderRadius: tamano * 0.32, backgroundColor: fondo, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: "Outfit_700Bold", fontSize: tamano * 0.42, color: "#2B2A33" }}>{nombre.trim().charAt(0).toUpperCase()}</Text>
    </View>
  );
}

// ── Mensaje en línea (error, éxito, aviso) ────────────────────────────────
export function Mensaje({ texto, tono = "peligro" }: { texto: string | null | undefined; tono?: Exclude<Tono, "neutro" | "primario"> | "info" }) {
  const c = useColores();
  if (!texto) return null;
  const [fondo, tinta, icono] = ({
    peligro: [c.peligroSuave, c.peligro, "cuidado"], exito: [c.exitoSuave, c.exito, "listo"], aviso: [c.avisoSuave, c.aviso, "info"], info: [c.primarioSuave, c.primario, "info"],
  } as const)[tono];
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", gap: 10, padding: 14, borderRadius: radio.control, backgroundColor: fondo, alignItems: "flex-start" }}>
      <Icono nombre={icono} tamano={18} color={tinta} />
      <Texto v="secundario" color={tinta} style={{ flex: 1 }}>{texto}</Texto>
    </View>
  );
}

// ── Estado vacío: ícono grande, una frase, una acción ─────────────────────
export function Vacio({ icono, titulo, texto, accion }: { icono: NombreIcono; titulo: string; texto?: string; accion?: ReactNode }) {
  const c = useColores();
  return (
    <View style={{ alignItems: "center", paddingVertical: 36, paddingHorizontal: 24, gap: 10 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.primarioSuave, alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
        <Icono nombre={icono} tamano={34} color={c.primario} />
      </View>
      <Texto v="encabezado" centrado>{titulo}</Texto>
      {texto ? <Texto v="secundario" centrado>{texto}</Texto> : null}
      {accion ? <View style={{ marginTop: 10, alignSelf: "stretch" }}>{accion}</View> : null}
    </View>
  );
}

// ── Campo de texto ───────────────────────────────────────────────────────
export function Campo({ etiqueta, ayuda, error, ...props }: TextInputProps & { etiqueta: string; ayuda?: string; error?: string | null }) {
  const c = useColores();
  return (
    <View style={{ gap: 6 }}>
      <Texto v="secundario" color={c.texto} style={{ fontFamily: "Outfit_500Medium" }}>{etiqueta}</Texto>
      <TextInput
        placeholderTextColor={c.textoTenue}
        selectionColor={c.primario}
        {...props}
        style={[tipo.cuerpo, { color: c.texto, backgroundColor: c.superficie, borderRadius: radio.control, borderWidth: 1, borderColor: error ? c.peligro : c.linea, paddingHorizontal: 14, paddingVertical: props.multiline ? 12 : 0, minHeight: props.multiline ? 96 : 50, textAlignVertical: props.multiline ? "top" : "center" }, props.style]}
      />
      {error ? <Texto v="secundario" color={c.peligro}>{error}</Texto> : ayuda ? <Texto v="secundario">{ayuda}</Texto> : null}
    </View>
  );
}

// ── Selector segmentado (pocas opciones a la vista) ──────────────────────
export function Segmentos<T extends string>({ opciones, valor, alCambiar }: { opciones: { valor: T; texto: string }[]; valor: T | null; alCambiar: (v: T) => void }) {
  const c = useColores();
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.superficieAlta, borderRadius: radio.control, padding: 4, gap: 4 }}>
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <Pressable
            key={o.valor}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              alCambiar(o.valor);
            }}
            style={[{ flex: 1, height: 40, borderRadius: 9, alignItems: "center", justifyContent: "center" }, activo && { backgroundColor: c.superficie }, activo && sombra(c.sombra), activo && { shadowOpacity: 0.08, elevation: 1 }]}
          >
            <Text style={[tipo.secundario, { fontFamily: activo ? "Outfit_600SemiBold" : "Outfit_500Medium", color: activo ? c.texto : c.textoSuave }]}>{o.texto}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Esqueleto mientras carga ─────────────────────────────────────────────
export function Esqueleto({ alto = 72, ancho = "100%" as ViewStyle["width"], redondo = radio.tarjeta }: { alto?: number; ancho?: ViewStyle["width"]; redondo?: number }) {
  const c = useColores();
  return <View style={{ height: alto, width: ancho, borderRadius: redondo, backgroundColor: c.superficieAlta }} />;
}
