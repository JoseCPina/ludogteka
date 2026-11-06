import { useCallback, useRef, useState, type ComponentRef } from "react";
import { Modal, Pressable, ScrollView, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOnboarding, type Seccion } from "@/lib/onboarding";
import { Boton, Texto } from "./ui";
import { Icono, type NombreIcono } from "./icono";
import { radio, useColores } from "@/tema";

const PASOS: { icono: NombreIcono; titulo: string; texto: string }[] = [
  { icono: "camara", titulo: "Tu cartilla se llena sola", texto: "Le tomas foto a la de papel y nosotros la pasamos. Tú nomás revisas." },
  { icono: "vacuna", titulo: "Te avisamos antes de que toque la vacuna", texto: "Una semana antes y el mismo día, aquí y por WhatsApp." },
  { icono: "calendario", titulo: "Pide cita y reserva desde aquí", texto: "Con tu veterinaria, estética o guardería, sin andar llamando." },
];

const HOJAS: Record<Seccion, { icono: NombreIcono; texto: string }> = {
  mascotas: { icono: "mascota", texto: "Aquí están tus mascotas, con su cartilla, su peso y lo que les toca." },
  cerca: { icono: "mapa", texto: "Veterinarias, estéticas y parques cerca de ti, con lo que suelen cobrar." },
  alertas: { icono: "alerta", texto: "¿Viste un animal perdido o herido? Súbelo aquí y le avisamos a quien anda cerca." },
  avisos: { icono: "aviso", texto: "Aquí te llega todo: sus vacunas, lo que diga tu negocio y mascotas perdidas cerca." },
  yo: { icono: "persona", texto: "Tu cuenta, tus negocios y tus notificaciones." },
};

/** La bienvenida: una sola vez, tres pasos deslizables, con «Saltar». */
export function Bienvenida() {
  const c = useColores();
  const inset = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { listo, vistos, marcar } = useOnboarding();
  const [paso, setPaso] = useState(0);
  const carrusel = useRef<ComponentRef<typeof ScrollView>>(null);
  if (!listo || vistos.bienvenida) return null;
  const terminar = () => marcar("bienvenida");
  const alDeslizar = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPaso(Math.round(e.nativeEvent.contentOffset.x / width));
  const ultimo = paso === PASOS.length - 1;
  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={terminar}>
      <View testID="bienvenida" style={{ flex: 1, backgroundColor: c.fondo, paddingTop: inset.top + 8, paddingBottom: inset.bottom + 24 }}>
        <View style={{ alignItems: "flex-end", paddingHorizontal: 12 }}>
          <Boton ancho={false} compacto variante="texto" titulo="Saltar" alTocar={terminar} style={{ alignSelf: "flex-end" }} />
        </View>
        <ScrollView ref={carrusel} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={alDeslizar} style={{ flex: 1 }}>
          {PASOS.map((p) => (
            <View key={p.titulo} style={{ width, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 20 }}>
              <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: c.primarioSuave, alignItems: "center", justifyContent: "center" }}>
                <Icono nombre={p.icono} tamano={56} color={c.primario} />
              </View>
              <Texto v="titulo" centrado>{p.titulo}</Texto>
              <Texto centrado color={c.textoSuave}>{p.texto}</Texto>
            </View>
          ))}
        </ScrollView>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, paddingVertical: 16 }} accessibilityLabel={`Paso ${paso + 1} de ${PASOS.length}`}>
          {PASOS.map((p, i) => <View key={p.titulo} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === paso ? c.primario : c.linea }} />)}
        </View>
        <View style={{ paddingHorizontal: 20 }}>
          <Boton
            titulo={ultimo ? "Empezar" : "Siguiente"}
            alTocar={() => {
              if (ultimo) return terminar();
              carrusel.current?.scrollTo({ x: width * (paso + 1), animated: true });
              setPaso(paso + 1);
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

/**
 * La hoja de una pestaña, la primera vez que se abre: una frase y un ícono. Se cierra con un toque («Entendido» o tocando
 * fuera); «No volver a mostrar» apaga las de todas las pestañas. Espera a que termine la bienvenida.
 */
export function GuiaSeccion({ seccion }: { seccion: Seccion }) {
  const c = useColores();
  const inset = useSafeAreaInsets();
  const { listo, vistos, marcar, marcarTodas } = useOnboarding();
  const [enfocada, setEnfocada] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setEnfocada(true);
      return () => setEnfocada(false);
    }, [])
  );
  if (!listo || !enfocada || !vistos.bienvenida || vistos[seccion]) return null;
  const hoja = HOJAS[seccion];
  const cerrar = () => marcar(seccion);
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={cerrar}>
      <Pressable testID="guia-fuera" accessibilityLabel="Cerrar" onPress={cerrar} style={{ flex: 1, backgroundColor: c.velo, justifyContent: "flex-end" }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: `${c.superficie}F2`, borderTopLeftRadius: radio.hoja, borderTopRightRadius: radio.hoja, paddingHorizontal: 24, paddingTop: 28, paddingBottom: inset.bottom + 20, gap: 14, alignItems: "center" }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.primarioSuave, alignItems: "center", justifyContent: "center" }}>
            <Icono nombre={hoja.icono} tamano={34} color={c.primario} />
          </View>
          <Texto centrado>{hoja.texto}</Texto>
          <Boton titulo="Entendido" alTocar={cerrar} />
          <Boton variante="texto" titulo="No volver a mostrar" alTocar={marcarTodas} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
