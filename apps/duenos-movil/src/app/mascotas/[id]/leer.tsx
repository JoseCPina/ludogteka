import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { llamar } from "@/lib/api";
import { useAccion } from "@/lib/datos";
import { fechaCorta } from "@/lib/formato";
import { tomarFoto, type FotoLista } from "@/lib/fotos";
import { Boton, BotonIcono, Insignia, Mensaje, Texto } from "@/componentes/ui";
import { Icono } from "@/componentes/icono";
import { fuentes, radio, useColores } from "@/tema";

type Registro = { tipo: "vacuna" | "desparasitacion"; nombre: string; fecha_aplicacion?: string | null; proxima_dosis?: string | null; lote?: string | null; laboratorio?: string | null; subtipo?: string | null; confianza: number };
type Lectura = { es_cartilla: boolean; registros: Registro[]; peso_kg?: number | null };

/**
 * Leer la cartilla con la cámara del celular: visor a pantalla completa con el marco de la hoja, disparador grande y
 * «tus fotos» al lado. La IA lee; el dueño revisa y confirma cada renglón antes de que quede en su cartilla.
 */
export default function LeerCartilla() {
  const { id, nueva } = useLocalSearchParams<{ id: string; nueva?: string }>();
  const c = useColores();
  const inset = useSafeAreaInsets();
  const [permiso, pedirPermiso] = useCameraPermissions();
  const camara = useRef<CameraView>(null);
  const [foto, setFoto] = useState<FotoLista | null>(null);
  const [lectura, setLectura] = useState<{ fotoId: string | null; lectura: Lectura } | null>(null);
  const [elegidos, setElegidos] = useState<boolean[]>([]);
  const leer = useAccion();
  const guardar = useAccion();

  const mandar = async (f: FotoLista) => {
    setFoto(f);
    const r = await leer.ejecutar(() => llamar<{ fotoId?: string | null; lectura?: Lectura }>("leerCartilla", [id, "$form"], [{ campo: "foto", uri: f.uri, nombre: f.nombre, tipo: f.tipo }]));
    if (r?.lectura) {
      setLectura({ fotoId: r.fotoId ?? null, lectura: r.lectura });
      setElegidos(r.lectura.registros.map((x) => x.confianza >= 0.5));
    }
  };

  const disparar = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    const crudo = await camara.current?.takePictureAsync({ quality: 0.9, exif: false, skipProcessing: false });
    if (!crudo) return;
    const ctx = ImageManipulator.manipulate(crudo.uri);
    if (Math.max(crudo.width, crudo.height) > 2000) ctx.resize(crudo.width >= crudo.height ? { width: 2000 } : { height: 2000 });
    const final = await (await ctx.renderAsync()).saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
    mandar({ uri: final.uri, nombre: `cartilla-${Date.now()}.jpg`, tipo: "image/jpeg" });
  };

  const deGaleria = async () => {
    const f = await tomarFoto("galeria");
    if (f) mandar(f);
  };

  const confirmar = async () => {
    if (!lectura) return;
    const registros = lectura.lectura.registros.filter((_, i) => elegidos[i]);
    const r = await guardar.ejecutar(() => llamar("confirmarLectura", [id, lectura.fotoId, registros, lectura.lectura.peso_kg ?? null]));
    if (r && !r.error) router.replace(`/mascotas/${id}/cartilla`);
  };

  const cerrar = () => (nueva ? router.replace(`/mascotas/${id}`) : router.back());

  // ── Revisar lo leído ──
  if (lectura) {
    const regs = lectura.lectura.registros;
    return (
      <View style={{ flex: 1, backgroundColor: c.fondo, paddingTop: inset.top }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, height: 52 }}>
          <BotonIcono icono="cerrar" etiqueta="Cerrar" alTocar={cerrar} tamano={36} />
          <Texto v="encabezado">Revisa lo que leímos</Texto>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 140 + inset.bottom }}>
          {!lectura.lectura.es_cartilla || regs.length === 0 ? (
            <Mensaje tono="aviso" texto="No alcanzamos a leer vacunas en esa foto. Intenta con otra con más luz, de frente y sin reflejos, o captúralas a mano desde la cartilla." />
          ) : (
            <Texto v="secundario">Toca un renglón para quitarlo si no es correcto. Solo se guarda lo que dejes marcado.</Texto>
          )}
          {regs.map((r, i) => (
            <Pressable
              key={i}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setElegidos((e) => e.map((x, j) => (j === i ? !x : x)));
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: elegidos[i] }}
              style={{ flexDirection: "row", gap: 12, padding: 14, borderRadius: radio.tarjeta, backgroundColor: c.superficie, borderWidth: 1.5, borderColor: elegidos[i] ? c.primario : "transparent", opacity: elegidos[i] ? 1 : 0.55 }}
            >
              <Icono nombre={elegidos[i] ? "listo" : "cerrar"} tamano={22} color={elegidos[i] ? c.primario : c.textoTenue} />
              <View style={{ flex: 1, gap: 4 }}>
                <Texto v="cuerpoFuerte">{r.nombre}</Texto>
                <Texto v="secundario">
                  {[r.tipo === "vacuna" ? "Vacuna" : "Desparasitación", r.fecha_aplicacion ? `aplicada ${fechaCorta(r.fecha_aplicacion)}` : null, r.proxima_dosis ? `próxima ${fechaCorta(r.proxima_dosis)}` : null].filter(Boolean).join(" · ")}
                </Texto>
                {r.confianza < 0.7 ? <Insignia texto="Revísala: se leía poco" tono="aviso" /> : null}
              </View>
            </Pressable>
          ))}
          {lectura.lectura.peso_kg ? <Texto v="secundario">También leímos su peso: {lectura.lectura.peso_kg} kg (se guarda con lo demás).</Texto> : null}
          <Mensaje texto={guardar.error} />
        </ScrollView>
        <View style={{ position: "absolute", left: 16, right: 16, bottom: inset.bottom + 16, gap: 8 }}>
          {regs.length ? <Boton titulo={`Guardar ${elegidos.filter(Boolean).length} en su cartilla`} alTocar={confirmar} cargando={guardar.ocupado} deshabilitado={!elegidos.some(Boolean)} /> : null}
          <Boton variante="secundario" titulo="Tomar otra foto" alTocar={() => { setLectura(null); setFoto(null); }} />
        </View>
      </View>
    );
  }

  // ── Leyendo ──
  if (foto && leer.ocupado) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0E0C12", alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={{ fontFamily: fuentes.semi, fontSize: 18, color: "#FFFFFF", textAlign: "center" }}>Leyendo la cartilla…</Text>
        <Text style={{ fontFamily: fuentes.normal, fontSize: 14, color: "#FFFFFFB3", textAlign: "center" }}>Toma unos segundos. Buscamos cada vacuna, su fecha y la próxima dosis.</Text>
      </View>
    );
  }

  // ── Cámara ──
  if (!permiso) return <View style={{ flex: 1, backgroundColor: "#000" }} />;
  if (!permiso.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: c.fondo, padding: 24, paddingTop: inset.top + 24, gap: 16, justifyContent: "center" }}>
        <Icono nombre="camara" tamano={44} color={c.primario} />
        <Texto v="titulo">Necesitamos la cámara</Texto>
        <Texto v="secundario">Para leer la cartilla le tomas una foto aquí mismo. También puedes escoger una que ya tengas.</Texto>
        <Boton titulo="Dar permiso" alTocar={pedirPermiso} />
        <Boton variante="secundario" titulo="Escoger de mis fotos" alTocar={deGaleria} />
        <Boton variante="texto" titulo="Ahora no" alTocar={cerrar} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView ref={camara} style={{ flex: 1 }} facing="back" autofocus="on" />
      <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        <View style={{ paddingTop: inset.top + 8, paddingHorizontal: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Pressable onPress={cerrar} accessibilityLabel="Cerrar" hitSlop={10} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" }}>
            <Icono nombre="cerrar" tamano={20} color="#FFFFFF" />
          </Pressable>
          <Text style={{ fontFamily: fuentes.semi, fontSize: 16, color: "#FFFFFF" }}>Su cartilla</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }}>
          <View style={{ width: "100%", aspectRatio: 0.72, borderRadius: 18, borderWidth: 2, borderColor: "rgba(255,255,255,0.9)" }} />
          <Text style={{ fontFamily: fuentes.media, fontSize: 14, color: "#FFFFFF", marginTop: 14, textAlign: "center" }}>Que se vea la hoja completa, con buena luz</Text>
        </View>
        {leer.error ? <View style={{ marginHorizontal: 16 }}><Mensaje texto={leer.error} /></View> : null}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingBottom: inset.bottom + 24, paddingTop: 16 }}>
          <Pressable onPress={deGaleria} accessibilityLabel="Escoger de tus fotos" style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
            <Icono nombre="galeria" tamano={24} color="#FFFFFF" />
          </Pressable>
          <Pressable onPress={disparar} accessibilityRole="button" accessibilityLabel="Tomar la foto" style={({ pressed }) => [{ width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }, pressed && { transform: [{ scale: 0.94 }] }]}>
            <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: "#FFFFFF" }} />
          </Pressable>
          <Pressable onPress={() => router.replace(`/mascotas/${id}/cartilla?capturar=1`)} accessibilityLabel="Capturar a mano" style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
            <Icono nombre="editar" tamano={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
