import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import type { Region } from "react-native-maps";
import { llamar } from "@/lib/api";
import { useAccion } from "@/lib/datos";
import { preguntarOrigen, tomarFoto, type FotoLista } from "@/lib/fotos";
import { miUbicacion } from "@/lib/ubicacion";
import { Pantalla } from "@/componentes/pantalla";
import { Mapa, hayMapa, regionDe } from "@/componentes/mapa";
import { Boton, Campo, Chip, Mensaje, Segmentos, Texto, Vacio } from "@/componentes/ui";
import { Icono } from "@/componentes/icono";
import { coloresLugar, radio, useColores } from "@/tema";

const TIPOS = [
  { valor: "perdido", texto: "Parece perdido" },
  { valor: "herido", texto: "Está herido" },
  { valor: "peligro", texto: "En peligro" },
  { valor: "abandonado", texto: "Abandonado" },
] as const;

/**
 * Subir una alerta: la foto (cámara o galería), qué le pasa, si es perro o gato, cómo es, y DÓNDE: el GPS del celular
 * pone el pin y se ajusta moviendo el mapa (referencia Waymo «Adjust drop-off»: el pin fijo en el centro). Al publicar,
 * el servidor le quita los metadatos a la foto y avisa a quien está cerca.
 */
export default function NuevaAlerta() {
  const c = useColores();
  const [foto, setFoto] = useState<FotoLista | null>(null);
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]["valor"] | null>(null);
  const [especie, setEspecie] = useState<"perro" | "gato" | "otro">("perro");
  const [descripcion, setDescripcion] = useState("");
  const [color, setColor] = useState("");
  const [tamano, setTamano] = useState<"chico" | "mediano" | "grande" | null>(null);
  const [punto, setPunto] = useState<{ lat: number; lng: number; precision: number | null } | null>(null);
  const [buscando, setBuscando] = useState(true);
  const [hecha, setHecha] = useState<{ id: string; avisados: number; coincidencias: number } | null>(null);
  const accion = useAccion();

  useEffect(() => {
    miUbicacion({ precisa: true, avisar: true }).then((u) => {
      if (u) setPunto(u);
      setBuscando(false);
    });
  }, []);

  const escoger = async () => {
    const origen = await preguntarOrigen("Foto del animal");
    if (origen) {
      const f = await tomarFoto(origen);
      if (f) setFoto(f);
    }
  };

  const publicar = async () => {
    if (!foto || !tipo || !punto) return;
    const r = await accion.ejecutar(() =>
      llamar<{ id?: string; avisados?: number; coincidencias?: number }>("crearAlerta", ["$form"], [{ campo: "foto", uri: foto.uri, nombre: foto.nombre, tipo: foto.tipo }], {
        tipo, especie, descripcion, color, tamano: tamano ?? "", lat: String(punto.lat), lng: String(punto.lng), precision: String(Math.round(punto.precision ?? 0)),
      })
    );
    if (r?.id) setHecha({ id: r.id, avisados: r.avisados ?? 0, coincidencias: r.coincidencias ?? 0 });
  };

  if (hecha) {
    return (
      <Pantalla>
        <Vacio
          icono="listo"
          titulo="Alerta publicada"
          texto={`Avisamos a ${hecha.avisados} ${hecha.avisados === 1 ? "persona" : "personas"} cerca${hecha.coincidencias ? ` y a ${hecha.coincidencias} ${hecha.coincidencias === 1 ? "dueño que busca" : "dueños que buscan"} a una mascota parecida` : ""}. Nadie ve que tú la subiste.`}
          accion={<Boton titulo="Ver la alerta" alTocar={() => router.replace(`/alertas/${hecha.id}`)} />}
        />
      </Pantalla>
    );
  }

  const lista = Boolean(foto && tipo && punto);
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <Pantalla pie={<Boton titulo="Publicar alerta" variante="peligro" icono="alerta" alTocar={publicar} cargando={accion.ocupado} deshabilitado={!lista} />}>
        <Pressable onPress={escoger} accessibilityRole="button" accessibilityLabel="Tomar o escoger la foto" style={{ borderRadius: radio.tarjeta, overflow: "hidden", backgroundColor: c.superficie, borderWidth: foto ? 0 : 1.5, borderStyle: "dashed", borderColor: c.linea }}>
          {foto ? (
            <Image source={{ uri: foto.uri }} style={{ width: "100%", aspectRatio: 4 / 3 }} contentFit="cover" />
          ) : (
            <View style={{ aspectRatio: 4 / 3, alignItems: "center", justifyContent: "center", gap: 10 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.peligroSuave, alignItems: "center", justifyContent: "center" }}>
                <Icono nombre="camara" tamano={30} color={c.peligro} />
              </View>
              <Texto v="cuerpoFuerte">Tómale una foto</Texto>
              <Texto v="secundario">Así lo reconoce su familia</Texto>
            </View>
          )}
        </Pressable>

        <View style={{ gap: 8 }}>
          <Texto v="encabezado">¿Qué le pasa?</Texto>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {TIPOS.map((t) => <Chip key={t.valor} texto={t.texto} activo={tipo === t.valor} color={coloresLugar[t.valor === "perdido" ? "perdido" : t.valor]} icono={t.valor === "herido" ? "curita" : t.valor === "peligro" ? "cuidado" : "mascota"} alTocar={() => setTipo(t.valor)} />)}
          </View>
        </View>
        <Segmentos valor={especie} alCambiar={setEspecie} opciones={[{ valor: "perro", texto: "Perro" }, { valor: "gato", texto: "Gato" }, { valor: "otro", texto: "Otro" }]} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["chico", "mediano", "grande"] as const).map((t) => <Chip key={t} texto={t[0].toUpperCase() + t.slice(1)} activo={tamano === t} alTocar={() => setTamano(tamano === t ? null : t)} />)}
        </View>
        <Campo etiqueta="Color" value={color} onChangeText={setColor} placeholder="Café con blanco" maxLength={40} />
        <Campo etiqueta="¿Cómo está y qué viste?" value={descripcion} onChangeText={setDescripcion} multiline maxLength={500} placeholder="Trae collar rojo, cojea de una pata, está asustado debajo de un coche…" />

        <View style={{ gap: 8 }}>
          <Texto v="encabezado">¿Dónde lo viste?</Texto>
          {hayMapa && punto ? (
            <View style={{ height: 240, borderRadius: radio.tarjeta, overflow: "hidden" }}>
              <Mapa style={{ flex: 1 }} initialRegion={regionDe(punto.lat, punto.lng, 0.6)} onRegionChangeComplete={(r: Region) => setPunto({ lat: r.latitude, lng: r.longitude, precision: punto.precision })} />
              <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center" }}>
                <View style={{ marginBottom: 34 }}><Icono nombre="pin" tamano={40} color={c.peligro} /></View>
              </View>
            </View>
          ) : null}
          {buscando ? <Texto v="secundario">Buscando tu ubicación…</Texto> : !punto ? <Mensaje texto="Sin tu ubicación no podemos poner la alerta en el mapa. Da permiso de ubicación y vuelve a intentar." /> : <Texto v="secundario">{hayMapa ? "Mueve el mapa para poner el pin justo donde lo viste." : "Usamos la ubicación de tu celular en este momento."}</Texto>}
        </View>
        <Texto v="pie" color={c.textoTenue}>Nunca mostramos quién subió la alerta. A la foto le quitamos sus datos ocultos (como la ubicación de tu casa) antes de publicarla.</Texto>
        <Mensaje texto={accion.error} />
      </Pantalla>
    </KeyboardAvoidingView>
  );
}
