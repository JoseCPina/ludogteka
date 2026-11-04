import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { abrirSesion, llamar, type Tokens } from "@/lib/api";
import { useAccion } from "@/lib/datos";
import { activarPush } from "@/lib/push";
import { Boton, Campo, Mensaje, Texto } from "@/componentes/ui";
import { Icono } from "@/componentes/icono";
import { espacio, fuentes, radio, useColores } from "@/tema";

/**
 * Entrar sin contraseña: la persona escribe su WhatsApp, la app le da un código y ella lo manda al WhatsApp de
 * PeluDesk («ENTRAR ABC123»). El bot comprueba que llegó de ESE número y la pantalla entra sola. Referencias: X y
 * Cash App (teléfono grande con lada, un botón ancho), app-entrada-whatsapp de la biblioteca.
 */
type Entrada = { id: string; estado: "pendiente" | "verificada" | "usada" | "vencida"; codigo: string; waUrl: string | null; telefonoUlt4: string };

export default function Entrar() {
  const c = useColores();
  const inset = useSafeAreaInsets();
  const [telefono, setTelefono] = useState("");
  const [entrada, setEntrada] = useState<Entrada | null>(null);
  const [conContrasena, setConContrasena] = useState(false);
  const [password, setPassword] = useState("");
  const accion = useAccion();
  const canjeando = useRef(false);

  const pedir = () =>
    accion.ejecutar(async () => {
      const r = await llamar<{ entrada?: Entrada }>("pedirCodigo", [telefono]);
      if (r.entrada) setEntrada(r.entrada);
      return r;
    });

  const entrarCon = async (tokens: Tokens) => {
    await abrirSesion(tokens);
    activarPush(true).catch(() => {});
  };

  // Mientras espera, pregunta cada 2.5 s si el bot ya recibió el código.
  useEffect(() => {
    if (!entrada || entrada.estado !== "pendiente") return;
    const t = setInterval(async () => {
      const r = await llamar<{ entrada?: Entrada | null }>("consultarEntrada", [entrada.id]).catch(() => null);
      const e = r?.entrada;
      if (!e) return;
      if (e.estado === "verificada" && !canjeando.current) {
        canjeando.current = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        const canje = await llamar<{ tokens?: Tokens }>("canjearEntrada", [entrada.id]).catch(() => null);
        if (canje?.tokens) await entrarCon(canje.tokens);
        else {
          canjeando.current = false;
          accion.setError(canje?.error ?? "No pudimos abrir tu sesión. Pide un código nuevo.");
          setEntrada(null);
        }
      } else if (e.estado === "vencida") setEntrada(e);
    }, 2500);
    return () => clearInterval(t);
  }, [entrada]); // eslint-disable-line react-hooks/exhaustive-deps

  const entrarConContrasena = () =>
    accion.ejecutar(async () => {
      const r = await llamar<{ tokens?: Tokens }>("entrarConContrasena", [telefono, password]);
      if (r.tokens) await entrarCon(r.tokens);
      return r;
    });

  const digitos = telefono.replace(/\D/g, "");
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.fondo }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: inset.top + 32, paddingBottom: inset.bottom + 24, paddingHorizontal: espacio.xxl, gap: espacio.xxl }}>
        <View style={{ gap: 18 }}>
          <Image source={require("../../assets/images/icon.png")} style={{ width: 56, height: 56, borderRadius: 16 }} />
          <View style={{ gap: 6 }}>
            <Texto v="titulo">{entrada ? "Manda tu código por WhatsApp" : "Entra con tu WhatsApp"}</Texto>
            <Texto v="secundario">
              {entrada
                ? `Lo mandas tú desde el número que termina en ${entrada.telefonoUlt4}. En cuanto llegue, entras solo.`
                : "La cartilla de tus mascotas, sus recordatorios y sus negocios, en un solo lugar. Sin contraseñas."}
            </Texto>
          </View>
        </View>

        {!entrada ? (
          <View style={{ gap: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: c.superficie, borderRadius: radio.control, borderWidth: 1, borderColor: c.linea, height: 60 }}>
              <Text style={{ fontFamily: fuentes.media, fontSize: 20, color: c.textoSuave, paddingLeft: 16, paddingRight: 10 }}>+52</Text>
              <View style={{ width: 1, height: 28, backgroundColor: c.linea }} />
              <TextInput
                value={telefono}
                onChangeText={(t) => setTelefono(t.replace(/[^\d ]/g, "").slice(0, 12))}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                placeholder="Tu número a 10 dígitos"
                placeholderTextColor={c.textoTenue}
                accessibilityLabel="Tu número de WhatsApp"
                autoFocus
                style={{ flex: 1, fontFamily: fuentes.media, fontSize: 20, color: c.texto, paddingHorizontal: 12, letterSpacing: 0.5 }}
              />
            </View>
            {conContrasena ? <Campo etiqueta="Contraseña" secureTextEntry value={password} onChangeText={setPassword} autoComplete="current-password" textContentType="password" /> : null}
            <Mensaje texto={accion.error} />
            {conContrasena ? (
              <Boton titulo="Entrar" alTocar={entrarConContrasena} cargando={accion.ocupado} deshabilitado={digitos.length !== 10 || !password} />
            ) : (
              <Boton titulo="Continuar" alTocar={pedir} cargando={accion.ocupado} deshabilitado={digitos.length !== 10} />
            )}
            <Boton variante="texto" titulo={conContrasena ? "Mejor con código por WhatsApp" : "Ya tengo contraseña de un negocio"} alTocar={() => setConContrasena((x) => !x)} />
          </View>
        ) : entrada.estado === "vencida" ? (
          <View style={{ gap: 16 }}>
            <Mensaje tono="aviso" texto="Ese código ya venció. Pide uno nuevo: toma un segundo." />
            <Boton titulo="Pedir otro código" alTocar={pedir} cargando={accion.ocupado} />
          </View>
        ) : (
          <View style={{ gap: 20 }}>
            <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }} accessibilityLabel={`Tu código es ${entrada.codigo.split("").join(" ")}`}>
              {entrada.codigo.split("").map((ch, i) => (
                <View key={i} style={{ width: 46, height: 58, borderRadius: 12, backgroundColor: c.superficie, borderWidth: 1, borderColor: c.linea, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: fuentes.semi, fontSize: 26, color: c.texto }}>{ch}</Text>
                </View>
              ))}
            </View>
            <Pressable
              onPress={() => entrada.waUrl && Linking.openURL(entrada.waUrl)}
              accessibilityRole="button"
              style={({ pressed }) => [{ backgroundColor: "#25D366", borderRadius: radio.pastilla, height: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }, pressed && { opacity: 0.85 }]}
            >
              <Icono nombre="chat" tamano={20} color="#0B3D1E" />
              <Text style={{ fontFamily: fuentes.semi, fontSize: 16, color: "#0B3D1E" }}>Mandar «ENTRAR {entrada.codigo}»</Text>
            </Pressable>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.exito }} />
              <Texto v="secundario">Esperando tu mensaje…</Texto>
            </View>
            <Mensaje texto={accion.error} />
            <Boton variante="texto" titulo="Cambiar de número" alTocar={() => setEntrada(null)} />
          </View>
        )}

        <View style={{ flex: 1 }} />
        <Texto v="pie" centrado color={c.textoTenue}>Gratis para siempre. PeluDesk nunca te pide pagar por la cartilla ni por los recordatorios.</Texto>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
