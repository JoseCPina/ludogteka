import { useEffect, useRef, useState, type ComponentRef } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { abrirSesion, llamar, type Tokens } from "@/lib/api";
import { useAccion } from "@/lib/datos";
import { activarPush } from "@/lib/push";
import { Boton, Campo, Mensaje, Texto } from "@/componentes/ui";
import { espacio, fuentes, radio, useColores } from "@/tema";
import { escucharCodigo, saludarOtraVez } from "../../modules/codigo-automatico";

type Envio = { canal: "plantilla" | "sesion" | "sms"; telefonoUlt4: string; reenviarEnSegundos: number; venceEnMinutos: number; smsDisponible: boolean };
const LUGAR: Record<Envio["canal"], string> = { plantilla: "por WhatsApp", sesion: "por WhatsApp", sms: "por SMS" };

/**
 * Entrar: tu número y te mandamos un código de 6 dígitos por WhatsApp. En Android llega solo (botón «Autocompletar» de
 * WhatsApp o SMS Retriever); en iPhone el teclado lo sugiere o se pega con un toque. Referencias: CapCut y Cash App
 * (seis casillas, cuenta regresiva para pedir otro).
 */
export default function Entrar() {
  const c = useColores();
  const inset = useSafeAreaInsets();
  const [telefono, setTelefono] = useState("");
  const [envio, setEnvio] = useState<Envio | null>(null);
  const [codigo, setCodigo] = useState("");
  const [faltan, setFaltan] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [conContrasena, setConContrasena] = useState(false);
  const [password, setPassword] = useState("");
  const accion = useAccion();
  const campoCodigo = useRef<ComponentRef<typeof TextInput>>(null);
  const verificando = useRef(false);
  const digitos = telefono.replace(/\D/g, "");

  useEffect(() => {
    if (faltan <= 0) return;
    const t = setTimeout(() => setFaltan((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [faltan]);

  const entrarCon = async (tokens: Tokens) => {
    await abrirSesion(tokens);
    activarPush(true).catch(() => {});
  };

  const pedir = async (canal: "whatsapp" | "sms" = "whatsapp") => {
    setAviso(null);
    saludarOtraVez();
    const r = await accion.ejecutar(() => llamar<{ envio?: Envio }>("pedirCodigoEntrada", [telefono, canal]));
    if (r?.envio) {
      if (envio) setAviso(`Te mandamos otro ${LUGAR[r.envio.canal]}. Solo sirve el último.`);
      setEnvio(r.envio);
      setCodigo("");
      setFaltan(r.envio.reenviarEnSegundos);
    }
  };

  const verificar = async (valor: string) => {
    if (verificando.current) return;
    verificando.current = true;
    setAviso(null);
    const r = await accion.ejecutar(() => llamar<{ tokens?: Tokens; pedirOtro?: boolean }>("verificarCodigoEntrada", [telefono, valor]));
    verificando.current = false;
    if (r?.tokens) return entrarCon(r.tokens);
    setCodigo("");
    if (r?.pedirOtro) setFaltan(0);
    campoCodigo.current?.focus();
  };

  const escribirCodigo = (t: string) => {
    const v = t.replace(/\D/g, "").slice(0, 6);
    setCodigo(v);
    if (v.length === 6) void verificar(v);
  };

  // Mientras se espera el código, lo que llegue de WhatsApp o del SMS se escribe solo.
  const escribirRef = useRef(escribirCodigo);
  useEffect(() => {
    escribirRef.current = escribirCodigo;
  });
  const esperando = Boolean(envio);
  useEffect(() => {
    if (!esperando) return;
    return escucharCodigo((v) => escribirRef.current(v));
  }, [esperando]);

  const pegar = async () => {
    const t = await Clipboard.getStringAsync().catch(() => "");
    const m = /\d{6}/.exec(t);
    if (m) escribirCodigo(m[0]);
    else setAviso("No vemos un código copiado. Toca «Copiar código» en WhatsApp y vuelve.");
  };

  const conClave = () =>
    accion.ejecutar(async () => {
      const r = await llamar<{ tokens?: Tokens }>("entrarConContrasena", [telefono, password]);
      if (r.tokens) await entrarCon(r.tokens);
      return r;
    });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.fondo }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: inset.top + 32, paddingBottom: inset.bottom + 24, paddingHorizontal: espacio.xl, gap: 28 }}>
        <View style={{ gap: 18 }}>
          <Image source={require("../../assets/images/icon.png")} style={{ width: 56, height: 56, borderRadius: 16 }} />
          <View style={{ gap: 6 }}>
            <Texto v="titulo">{envio ? "Escribe tu código" : "Entra con tu WhatsApp"}</Texto>
            <Texto v="secundario">
              {envio
                ? `Te lo mandamos ${LUGAR[envio.canal]} al número que termina en ${envio.telefonoUlt4}. Vence en ${envio.venceEnMinutos} minutos.`
                : "La cartilla de tus mascotas, sus recordatorios y sus negocios, en un solo lugar. Sin contraseñas."}
            </Texto>
          </View>
        </View>

        {!envio ? (
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
              <Boton titulo="Entrar" alTocar={conClave} cargando={accion.ocupado} deshabilitado={digitos.length !== 10 || !password} />
            ) : (
              <Boton titulo="Mandarme mi código" alTocar={() => pedir()} cargando={accion.ocupado} deshabilitado={digitos.length !== 10} />
            )}
            <Boton variante="texto" titulo={conContrasena ? "Mejor con código por WhatsApp" : "Entrar con contraseña"} alTocar={() => { setConContrasena((x) => !x); accion.setError(null); }} />
          </View>
        ) : (
          <View style={{ gap: 18 }}>
            <Pressable onPress={() => campoCodigo.current?.focus()} accessibilityLabel={`Código: ${codigo.length} de 6 dígitos`} style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
              {Array.from({ length: 6 }).map((_, i) => {
                const actual = i === codigo.length;
                return (
                  <View key={i} style={{ width: 46, height: 58, borderRadius: radio.control, backgroundColor: c.superficie, borderWidth: actual ? 2 : 1, borderColor: actual ? c.primario : c.linea, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontFamily: fuentes.semi, fontSize: 26, color: c.texto }}>{codigo[i] ?? ""}</Text>
                  </View>
                );
              })}
            </Pressable>
            <TextInput
              ref={campoCodigo}
              value={codigo}
              onChangeText={escribirCodigo}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              autoFocus
              maxLength={6}
              accessibilityLabel="Código de 6 dígitos"
              style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
            />
            {aviso ? <Mensaje tono="info" texto={aviso} /> : null}
            <Mensaje texto={accion.error} />
            {Platform.OS === "ios" ? <Boton variante="secundario" titulo="Pegar el código" alTocar={pegar} /> : null}
            {faltan > 0 ? (
              <Texto v="secundario" centrado>Si no llega, puedes pedir otro en {faltan} s.</Texto>
            ) : (
              <View style={{ gap: 8 }}>
                <Boton variante="secundario" titulo="Reenviar" alTocar={() => pedir("whatsapp")} cargando={accion.ocupado} />
                {envio.smsDisponible ? <Boton variante="texto" titulo="Mandar por SMS" alTocar={() => pedir("sms")} /> : null}
              </View>
            )}
            <Boton variante="texto" titulo="Cambiar de número" alTocar={() => { setEnvio(null); setCodigo(""); setAviso(null); accion.setError(null); }} />
          </View>
        )}

        <View style={{ flex: 1 }} />
        <Texto v="pie" centrado color={c.textoTenue}>Gratis para siempre. PeluDesk nunca te pide pagar por la cartilla ni por los recordatorios.</Texto>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
