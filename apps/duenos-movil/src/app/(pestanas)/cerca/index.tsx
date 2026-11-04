import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type MapView from "react-native-maps";
import { llamar } from "@/lib/api";
import { distancia, pesos } from "@/lib/formato";
import { miUbicacion } from "@/lib/ubicacion";
import { Mapa, Pin, hayMapa, regionDe } from "@/componentes/mapa";
import { HojaInferior } from "@/componentes/hoja";
import { Boton, BotonIcono, Chip, Insignia, Mensaje, Texto, Vacio } from "@/componentes/ui";
import { Icono, type NombreIcono } from "@/componentes/icono";
import { coloresLugar, fuentes, radio, useColores } from "@/tema";

type Categoria = "veterinaria" | "abiertas" | "urgencias" | "estetica" | "guarderia" | "hotel" | "petfriendly" | "tienda";
type Lugar = {
  id: string; fuente: "directorio" | "google"; nombre: string; tipo: keyof typeof coloresLugar; subtipo: string | null; lat: number; lng: number; distanciaM: number; direccion: string | null;
  calificacion: number | null; resenas: number | null; telefono: string | null; whatsapp: string | null; abiertoAhora: boolean | null; enPeluDesk: boolean; negocioId: string | null;
  mascotasConVinculo: string[]; cupoEstaNoche: { hayCupo: boolean; disponible: number } | null; googlePlaceId: string | null; mapsUri: string | null; fichaUrl: string | null;
};
type Respuesta = { lugares: Lugar[]; precio: { servicio: string; desde: number; hasta: number; lugar: string } | null; atribucionGoogle: boolean };
type Ficha = { google: { horario: string[]; resumen: string | null; fotos: { uri: string; autor: string | null }[]; opiniones: { autor: string; calificacion: number; texto: string; cuando: string | null }[] } | null; resenasPeluDesk: { total: number; promedio: number | null; ultimas: { estrellas: number; texto: string | null; quien: string }[] } | null };

const CHIPS: { clave: Categoria; texto: string; icono: NombreIcono }[] = [
  { clave: "veterinaria", texto: "Veterinarias", icono: "veterinaria" },
  { clave: "abiertas", texto: "Abiertas ahora", icono: "reloj" },
  { clave: "urgencias", texto: "Urgencias 24 h", icono: "urgencias" },
  { clave: "estetica", texto: "Estéticas", icono: "estetica" },
  { clave: "guarderia", texto: "Guarderías", icono: "guarderia" },
  { clave: "hotel", texto: "Hoteles con cupo hoy", icono: "hotel" },
  { clave: "petfriendly", texto: "Pet friendly", icono: "parque" },
  { clave: "tienda", texto: "Tiendas", icono: "tienda" },
];
const ICONO_TIPO: Record<string, NombreIcono> = { veterinaria: "veterinaria", urgencias: "urgencias", estetica: "estetica", guarderia: "guarderia", hotel: "hotel", petfriendly: "parque", tienda: "tienda" };
const ICONO_SUBTIPO: Record<string, NombreIcono> = { parque: "parque", restaurante: "restaurante", cafe: "cafe", hotel: "hotel" };
const SUBTIPO: Record<string, string> = { parque: "Parque", restaurante: "Restaurante", cafe: "Café", hotel: "Hotel que acepta mascotas" };
const icono = (l: Lugar): NombreIcono => (l.subtipo ? (ICONO_SUBTIPO[l.subtipo] ?? "parque") : (ICONO_TIPO[l.tipo] ?? "pin"));
const CENTRO_MX = { lat: 22.1565, lng: -100.9855 }; // si no da su ubicación: San Luis Potosí

/**
 * Cerca de mí (Fase 4): el mapa a pantalla completa con la ubicación del dueño, chips de qué buscar arriba y la hoja
 * inferior con la lista sincronizada (tocar un pin sube la hoja con su ficha; tocar un renglón centra el mapa).
 * Referencias: TikTok «Places in this area» y Fresha (chips sobre el mapa, hoja con la lista), Apple Maps (ficha).
 */
export default function Cerca() {
  const c = useColores();
  const inset = useSafeAreaInsets();
  const mapa = useRef<MapView>(null);
  const lista = useRef<FlatList<Lugar>>(null);
  const [aqui, setAqui] = useState<{ lat: number; lng: number } | null>(null);
  const [sinPermiso, setSinPermiso] = useState(false);
  const [categoria, setCategoria] = useState<Categoria>("veterinaria");
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elegido, setElegido] = useState<Lugar | null>(null);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [hoja, setHoja] = useState(1);

  const pedida = useRef(0);
  const buscar = useCallback(async (punto: { lat: number; lng: number }, cat: Categoria) => {
    const n = ++pedida.current;
    setCargando(true);
    setElegido(null);
    try {
      const r = await llamar<Respuesta>("cercaDeMi", [punto.lat, punto.lng, cat]);
      if (n !== pedida.current) return; // ya se pidió otra cosa
      if (r.error) setError(r.error);
      else {
        setError(null);
        setDatos(r);
      }
    } catch {
      if (n === pedida.current) setError("No hay conexión. Revisa tu internet.");
    } finally {
      if (n === pedida.current) setCargando(false);
    }
  }, []);

  const ubicar = useCallback(async (cat: Categoria) => {
    const u = await miUbicacion({ avisar: false });
    const punto = u ? { lat: u.lat, lng: u.lng } : CENTRO_MX;
    setSinPermiso(!u);
    setAqui(punto);
    if (u) {
      mapa.current?.animateToRegion(regionDe(u.lat, u.lng), 500);
      llamar("guardarZona", [u.lat, u.lng]).catch(() => {}); // su zona (a ~1 km) para avisarle de mascotas perdidas y alertas
    }
    buscar(punto, cat);
  }, [buscar]);

  useEffect(() => {
    const t = setTimeout(() => ubicar("veterinaria"), 0);
    return () => clearTimeout(t);
  }, [ubicar]);

  const cambiarCategoria = (cat: Categoria) => {
    setCategoria(cat);
    if (aqui) buscar(aqui, cat);
  };

  const elegir = (l: Lugar, desdeLista = false) => {
    setElegido(l);
    setFicha(null);
    setHoja(1);
    mapa.current?.animateToRegion({ ...regionDe(l.lat, l.lng, 1.6), latitude: l.lat - 0.004 }, 400);
    if (!desdeLista) {
      const i = datos?.lugares.findIndex((x) => x.id === l.id) ?? -1;
      if (i >= 0) setTimeout(() => lista.current?.scrollToIndex({ index: i, animated: true, viewPosition: 0 }), 50);
    }
    if (l.googlePlaceId || l.negocioId) llamar<Ficha>("fichaLugar", [{ googlePlaceId: l.googlePlaceId, negocioId: l.negocioId }]).then((f) => !f.error && setFicha(f)).catch(() => {});
  };

  const lugares = datos?.lugares ?? [];
  const encabezado = (
    <View style={{ paddingHorizontal: 16, paddingBottom: 10, gap: 6 }}>
      {elegido ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable onPress={() => setElegido(null)} hitSlop={10} accessibilityLabel="Volver a la lista"><Icono nombre="lista" tamano={20} color={c.primario} /></Pressable>
          <Texto v="encabezado" lineas={1} style={{ flex: 1 }}>{elegido.nombre}</Texto>
          <BotonIcono icono="cerrar" etiqueta="Cerrar la ficha" tamano={32} alTocar={() => setElegido(null)} />
        </View>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Texto v="encabezado">{cargando ? "Buscando…" : lugares.length ? `${lugares.length} ${lugares.length === 1 ? "lugar" : "lugares"} cerca` : "Cerca de ti"}</Texto>
            {cargando ? <ActivityIndicator color={c.primario} /> : null}
          </View>
          {datos?.precio ? (
            <Texto v="secundario">{datos.precio.servicio} en {datos.precio.lugar}: de {pesos(datos.precio.desde)} a {pesos(datos.precio.hasta)} · Índice de precios PeluDesk</Texto>
          ) : null}
        </>
      )}
    </View>
  );

  const chips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
      {CHIPS.map((ch) => <Chip key={ch.clave} texto={ch.texto} icono={ch.icono} color={coloresLugar[ch.clave === "abiertas" ? "veterinaria" : ch.clave === "urgencias" ? "urgencias" : (ch.clave as keyof typeof coloresLugar)] ?? c.primario} activo={categoria === ch.clave} alTocar={() => cambiarCategoria(ch.clave)} />)}
    </ScrollView>
  );
  const contenido = elegido ? (
      <FichaLugar l={elegido} ficha={ficha} />
    ) : (
      <FlatList
        ref={lista}
        data={lugares}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: inset.bottom + 90, gap: 10 }}
        onScrollToIndexFailed={() => {}}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            {sinPermiso ? <Mensaje tono="info" texto="Sin tu ubicación te enseñamos San Luis Potosí. Para ver lo que hay cerca de ti, da permiso de ubicación." /> : null}
            <Mensaje texto={error} />
          </View>
        }
        ListEmptyComponent={!cargando && !error ? <Vacio icono="explorar" titulo="Nada por aquí" texto={hayMapa ? "Prueba con otra categoría o muévete en el mapa." : "Prueba con otra categoría."} /> : undefined}
        ListFooterComponent={datos?.atribucionGoogle ? <Texto v="pie" color={c.textoTenue} style={{ paddingVertical: 8 }}>Algunos datos son de Google Maps.</Texto> : undefined}
        renderItem={({ item: l }) => <RenglonLugar l={l} alTocar={() => elegir(l, true)} />}
      />
    );

  // Sin mapa (Android sin la llave de Google Maps): chips arriba y la lista abajo, sin hoja.
  if (!hayMapa) {
    return (
      <View style={{ flex: 1, backgroundColor: c.fondo, paddingTop: inset.top + 10, gap: 10 }}>
        {chips}
        {encabezado}
        <View style={{ flex: 1 }}>{contenido}</View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.fondo }}>
      <Mapa ref={mapa} style={{ flex: 1 }} initialRegion={regionDe((aqui ?? CENTRO_MX).lat, (aqui ?? CENTRO_MX).lng, 6)} onPress={() => elegido && setElegido(null)} mapPadding={{ top: inset.top + 60, right: 0, bottom: 0, left: 0 }}>
        {lugares.map((l) => (
          <Pin key={l.id} coordenada={{ latitude: l.lat, longitude: l.lng }} color={l.enPeluDesk ? coloresLugar.peludesk : coloresLugar[l.tipo]} icono={icono(l)} peludesk={l.enPeluDesk} elegido={elegido?.id === l.id} alTocar={() => elegir(l)} titulo={l.nombre} />
        ))}
      </Mapa>
      {/* Chips arriba, sobre el mapa */}
      <View style={{ position: "absolute", top: inset.top + 10, left: 0, right: 0 }} pointerEvents="box-none">
        {chips}
      </View>
      <View style={{ position: "absolute", right: 16, top: inset.top + 64 }}>
        <BotonIcono icono="ubicacion" etiqueta="Ir a mi ubicación" relleno alTocar={() => ubicar(categoria)} />
      </View>
      <HojaInferior indice={hoja} alCambiarIndice={setHoja} encabezado={encabezado} alturaAsomada={120}>
        {contenido}
      </HojaInferior>
    </View>
  );
}

function RenglonLugar({ l, alTocar }: { l: Lugar; alTocar: () => void }) {
  const c = useColores();
  const color = l.enPeluDesk ? coloresLugar.peludesk : coloresLugar[l.tipo];
  return (
    <Pressable onPress={alTocar} accessibilityRole="button" style={({ pressed }) => [{ flexDirection: "row", gap: 12, padding: 12, borderRadius: radio.tarjeta, backgroundColor: l.enPeluDesk ? c.primarioSuave : c.fondo }, pressed && { opacity: 0.8 }]}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
        <Icono nombre={icono(l)} tamano={22} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Texto v="cuerpoFuerte" lineas={1}>{l.nombre}</Texto>
        <Texto v="secundario" lineas={1}>
          {[distancia(l.distanciaM), l.calificacion ? `★ ${l.calificacion.toFixed(1)}${l.resenas ? ` (${l.resenas})` : ""}` : null, l.subtipo ? SUBTIPO[l.subtipo] : null].filter(Boolean).join(" · ")}
        </Texto>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {l.enPeluDesk ? <Insignia texto="PeluDesk" tono="primario" /> : null}
          {l.cupoEstaNoche ? <Insignia texto={l.cupoEstaNoche.hayCupo ? "Hay cupo esta noche" : "Lleno esta noche"} tono={l.cupoEstaNoche.hayCupo ? "exito" : "peligro"} /> : null}
          {l.abiertoAhora === true ? <Insignia texto="Abierto ahora" tono="exito" /> : l.abiertoAhora === false ? <Insignia texto="Cerrado" tono="neutro" /> : null}
          {l.mascotasConVinculo.length ? <Insignia texto="Ya te conocen" tono="aviso" /> : null}
        </View>
      </View>
    </Pressable>
  );
}

function FichaLugar({ l, ficha }: { l: Lugar; ficha: Ficha | null }) {
  const c = useColores();
  const inset = useSafeAreaInsets();
  const comoLlegar = () => {
    const url = Platform.OS === "ios" ? `http://maps.apple.com/?daddr=${l.lat},${l.lng}&q=${encodeURIComponent(l.nombre)}` : `google.navigation:q=${l.lat},${l.lng}`;
    Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`));
  };
  const mascota = l.mascotasConVinculo[0];
  const reservable = l.tipo === "hotel" || l.tipo === "guarderia";
  const accionPrincipal = l.enPeluDesk
    ? mascota
      ? { titulo: reservable ? "Reservar" : "Pedir cita", alTocar: () => router.push(`/mascotas/${mascota}/${reservable ? "reservar" : "cita"}`) }
      : l.whatsapp
        ? { titulo: reservable ? "Reservar por WhatsApp" : "Pedir cita por WhatsApp", alTocar: () => Linking.openURL(`https://wa.me/${l.whatsapp}?text=${encodeURIComponent(`Hola, los encontré en la app PeluDesk. Quiero ${reservable ? "reservar" : "pedir una cita"} para mi mascota.`)}`) }
        : l.fichaUrl
          ? { titulo: "Ver su página", alTocar: () => Linking.openURL(l.fichaUrl!) }
          : null
    : null;
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: inset.bottom + 100, gap: 14 }}>
      <Texto v="secundario">{[l.subtipo ? SUBTIPO[l.subtipo] : null, distancia(l.distanciaM), l.direccion].filter(Boolean).join(" · ")}</Texto>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {l.enPeluDesk ? <Insignia texto="Negocio PeluDesk" tono="primario" /> : null}
        {l.cupoEstaNoche ? <Insignia texto={l.cupoEstaNoche.hayCupo ? `Hay cupo esta noche` : "Lleno esta noche"} tono={l.cupoEstaNoche.hayCupo ? "exito" : "peligro"} /> : null}
        {l.abiertoAhora === true ? <Insignia texto="Abierto ahora" tono="exito" /> : null}
      </View>
      {ficha?.google?.fotos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {ficha.google.fotos.map((f) => (
            <View key={f.uri}>
              <Image source={{ uri: f.uri }} style={{ width: 220, height: 150, borderRadius: 14 }} contentFit="cover" transition={150} />
              {f.autor ? <Text style={{ fontFamily: fuentes.normal, fontSize: 11, color: c.textoTenue, marginTop: 2 }}>Foto: {f.autor}</Text> : null}
            </View>
          ))}
        </ScrollView>
      ) : null}
      {accionPrincipal ? <Boton titulo={accionPrincipal.titulo} icono={reservable ? "hotel" : "calendario"} alTocar={accionPrincipal.alTocar} /> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {l.telefono ? <Boton style={{ flex: 1 }} compacto variante="secundario" icono="llamar" titulo="Llamar" alTocar={() => Linking.openURL(`tel:${l.telefono}`)} /> : null}
        {l.whatsapp ? <Boton style={{ flex: 1 }} compacto variante="secundario" icono="chat" titulo="WhatsApp" alTocar={() => Linking.openURL(`https://wa.me/${l.whatsapp}`)} /> : null}
        <Boton style={{ flex: 1 }} compacto variante="secundario" icono="llegar" titulo="Cómo llegar" alTocar={comoLlegar} />
      </View>
      {ficha?.resenasPeluDesk ? (
        <View style={{ gap: 8 }}>
          <Texto v="encabezado">★ {ficha.resenasPeluDesk.promedio?.toFixed(1)} · {ficha.resenasPeluDesk.total} opiniones verificadas</Texto>
          {ficha.resenasPeluDesk.ultimas.map((r, i) => (r.texto ? <Texto key={i} v="secundario">«{r.texto}» · {r.quien}</Texto> : null))}
          <Texto v="pie" color={c.textoTenue}>Solo opina quien tuvo cita o estancia registrada en PeluDesk.</Texto>
        </View>
      ) : null}
      {ficha?.google?.horario.length ? (
        <View style={{ gap: 4 }}>
          <Texto v="encabezado">Horario</Texto>
          {ficha.google.horario.map((h) => <Texto key={h} v="secundario">{h}</Texto>)}
        </View>
      ) : null}
      {ficha?.google?.opiniones.length ? (
        <View style={{ gap: 8 }}>
          <Texto v="encabezado">Opiniones en Google</Texto>
          {ficha.google.opiniones.map((o, i) => <Texto key={i} v="secundario" lineas={4}>{"★".repeat(Math.round(o.calificacion))} «{o.texto}» · {o.autor}{o.cuando ? `, ${o.cuando}` : ""}</Texto>)}
        </View>
      ) : null}
      {l.fuente === "google" || l.googlePlaceId ? <Texto v="pie" color={c.textoTenue}>Datos de Google Maps</Texto> : null}
      {!l.enPeluDesk && l.fichaUrl ? (
        <Pressable onPress={() => Linking.openURL(l.fichaUrl!)} style={{ paddingVertical: 6 }}>
          <Texto v="secundario" color={c.primario}>¿Es tu negocio? Reclama tu ficha gratis</Texto>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
