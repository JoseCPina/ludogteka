import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { router } from "expo-router";
import { llamar } from "@/lib/api";
import { useAccion } from "@/lib/datos";

import { preguntarOrigen, tomarFoto, type FotoLista } from "@/lib/fotos";
import { Pantalla } from "@/componentes/pantalla";
import { AvatarMascota, Boton, Campo, Mensaje, Segmentos, Texto } from "@/componentes/ui";
import { SelectorEdad } from "@/componentes/edad";
import { Icono } from "@/componentes/icono";
import { useColores } from "@/tema";

/** Alta en un minuto: foto, nombre, qué es, sexo y nacimiento. Después, directo a leer su cartilla con la cámara. */
export default function NuevaMascota() {
  const c = useColores();
  const [foto, setFoto] = useState<FotoLista | null>(null);
  const [nombre, setNombre] = useState("");
  const [especie, setEspecie] = useState<"perro" | "gato" | "otro">("perro");
  const [detalle, setDetalle] = useState("");
  const [sexo, setSexo] = useState<"macho" | "hembra" | null>(null);
  const [nacimiento, setNacimiento] = useState<string | null>(null);
  const [raza, setRaza] = useState("");
  const accion = useAccion();

  const escoger = async () => {
    const origen = await preguntarOrigen("Su foto");
    if (origen) setFoto(await tomarFoto(origen, { recortar: true }));
  };

  const guardar = async () => {
    const campos: Record<string, string> = { nombre, especie, sexo: sexo ?? "", fecha_nacimiento: nacimiento ?? "", especie_detalle: detalle, raza };
    const r = await accion.ejecutar(() => llamar<{ ir?: string }>("crearMascota", ["$form"], foto ? [{ campo: "foto", uri: foto.uri, nombre: foto.nombre, tipo: foto.tipo }] : [], campos));
    const id = r?.ir ? /\/mascotas\/([0-9a-f-]{36})/.exec(r.ir)?.[1] : null;
    if (id) {
      router.dismiss();
      router.push(`/mascotas/${id}/leer?nueva=1`);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <Pantalla pie={<Boton titulo="Guardar" alTocar={guardar} cargando={accion.ocupado} deshabilitado={!nombre.trim()} />}>
        <Pressable onPress={escoger} accessibilityRole="button" accessibilityLabel="Escoger su foto" style={{ alignSelf: "center", alignItems: "center", gap: 8 }}>
          {foto ? (
            <AvatarMascota nombre={nombre || "?"} foto={foto.uri} tamano={120} />
          ) : (
            <View style={{ width: 120, height: 120, borderRadius: 38, backgroundColor: c.primarioSuave, alignItems: "center", justifyContent: "center" }}>
              <Icono nombre="camara" tamano={34} color={c.primario} />
            </View>
          )}
          <Texto v="secundario" color={c.primario}>{foto ? "Cambiar foto" : "Agregar foto"}</Texto>
        </Pressable>

        <Campo etiqueta="¿Cómo se llama?" value={nombre} onChangeText={setNombre} placeholder="Nombre" autoCapitalize="words" maxLength={60} />
        <View style={{ gap: 6 }}>
          <Texto v="secundario" color={c.texto} style={{ fontFamily: "Outfit_500Medium" }}>¿Qué es?</Texto>
          <Segmentos valor={especie} alCambiar={setEspecie} opciones={[{ valor: "perro", texto: "Perro" }, { valor: "gato", texto: "Gato" }, { valor: "otro", texto: "Otro" }]} />
        </View>
        {especie === "otro" ? <Campo etiqueta="¿Qué animal es?" value={detalle} onChangeText={setDetalle} placeholder="Conejo, hurón, tortuga…" maxLength={40} /> : null}
        <View style={{ gap: 6 }}>
          <Texto v="secundario" color={c.texto} style={{ fontFamily: "Outfit_500Medium" }}>Sexo</Texto>
          <Segmentos valor={sexo} alCambiar={setSexo} opciones={[{ valor: "hembra", texto: "Hembra" }, { valor: "macho", texto: "Macho" }]} />
        </View>
        <SelectorEdad alCambiar={setNacimiento} />
        {especie !== "otro" ? <Campo etiqueta="Raza (opcional)" value={raza} onChangeText={setRaza} placeholder={especie === "gato" ? "Doméstico, siamés…" : "Mestizo, labrador…"} maxLength={60} /> : null}
        <Mensaje texto={accion.error} />
      </Pantalla>
    </KeyboardAvoidingView>
  );
}
