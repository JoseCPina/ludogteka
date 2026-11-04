import { useState } from "react";
import { Alert, Linking, Platform, Share, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { llamar } from "@/lib/api";
import { usePantalla, useAccion } from "@/lib/datos";
import { haceCuanto } from "@/lib/formato";
import { preguntarOrigen, tomarFoto, type FotoLista } from "@/lib/fotos";
import { Pantalla } from "@/componentes/pantalla";
import { Boton, BotonIcono, Campo, Chip, Grupo, Insignia, Mensaje, Texto } from "@/componentes/ui";
import { radio, useColores } from "@/tema";
import { ESTADO_ALERTA, TIPO_ALERTA } from "@/componentes/alerta";

type Detalle = {
  alerta: {
    id: string; tipo: string; especie: string; descripcion: string | null; color: string | null; tamano: string | null; lat: number; lng: number; estado: string; created_at: string;
    es_mia: boolean; oculta: boolean; avisados: number | null; ya_reporte: boolean; fotoUrl: string | null; url: string;
    actualizaciones: { id: string; texto: string | null; estado: string | null; created_at: string; es_mia: boolean; de_quien_la_subio: boolean; fotoUrl: string | null }[];
    mensajes: { id: string; texto: string; created_at: string; mio: boolean; conversacion: number }[];
  };
};
const ESTADOS = [
  { valor: "sigue_ahi", texto: "Sigue ahí" },
  { valor: "ya_no_esta", texto: "Ya no está" },
  { valor: "rescatado", texto: "Lo rescataron" },
  { valor: "reunido", texto: "Volvió con su familia" },
] as const;

/**
 * Una alerta: foto grande, qué le pasa, dónde (cómo llegar), sus novedades con foto, cambiar cómo está, escribirle a
 * quien la subió (sin ver teléfonos; si es tuya, cada persona que te escribió es una conversación) y reportarla.
 */
export default function AlertaDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColores();
  const p = usePantalla<Detalle>("alerta", [id]);
  const [texto, setTexto] = useState("");
  const [foto, setFoto] = useState<FotoLista | null>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [conversacion, setConversacion] = useState(1);
  const actualizar = useAccion();
  const escribir = useAccion();
  const reporte = useAccion();
  const a = p.datos?.alerta;

  const mandarActualizacion = async () => {
    const r = await actualizar.ejecutar(() => llamar("actualizarAlerta", [id, "$form"], foto ? [{ campo: "foto", uri: foto.uri, nombre: foto.nombre, tipo: foto.tipo }] : [], { texto, estado: estado ?? "" }));
    if (r && !r.error) {
      setTexto("");
      setFoto(null);
      setEstado(null);
      p.recargar();
    }
  };
  const mandarMensaje = async () => {
    const r = await escribir.ejecutar(() => llamar("mensajeAlerta", [id, mensaje, a?.es_mia ? conversacion : null]));
    if (r && !r.error) {
      setMensaje("");
      p.recargar();
    }
  };
  const reportar = () =>
    Alert.alert("Reportar esta alerta", "¿Qué tiene?", [
      { text: "Es falsa", onPress: () => reporte.ejecutar(() => llamar("reportarAlerta", [id, "falsa", ""])).then(() => p.recargar()) },
      { text: "Es ofensiva", onPress: () => reporte.ejecutar(() => llamar("reportarAlerta", [id, "ofensiva", ""])).then(() => p.recargar()) },
      { text: "Está repetida", onPress: () => reporte.ejecutar(() => llamar("reportarAlerta", [id, "repetida", ""])).then(() => p.recargar()) },
      { text: "Cancelar", style: "cancel" },
    ]);
  const comoLlegar = () => {
    if (!a) return;
    const url = Platform.OS === "ios" ? `http://maps.apple.com/?daddr=${a.lat},${a.lng}` : `google.navigation:q=${a.lat},${a.lng}`;
    Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`));
  };

  const conversaciones = a?.es_mia ? [...new Set(a.mensajes.map((m) => m.conversacion).filter((n) => n > 0))] : [];
  const hilo = a ? (a.es_mia ? a.mensajes.filter((m) => m.conversacion === conversacion) : a.mensajes) : [];
  const e = a ? (ESTADO_ALERTA[a.estado] ?? ESTADO_ALERTA.sigue_ahi) : null;

  return (
    <>
      <Stack.Screen options={{ title: a ? TIPO_ALERTA[a.tipo] : "Alerta", headerRight: () => (a ? <BotonIcono icono="compartir" etiqueta="Compartir la alerta" tamano={36} alTocar={() => Share.share({ message: `Vieron ${TIPO_ALERTA[a.tipo].toLowerCase()} un ${a.especie === "gato" ? "gato" : "perro"} por aquí. ¿Lo reconoces? ${a.url}` })} /> : null) }} />
      <Pantalla cargando={p.cargando} error={p.error} refrescando={p.refrescando} alRefrescar={p.refrescar} alReintentar={p.refrescar} sinMargen>
        {a && e ? (
          <>
            {a.fotoUrl ? <Image source={{ uri: a.fotoUrl }} style={{ width: "100%", aspectRatio: 4 / 3 }} contentFit="cover" transition={200} accessibilityLabel="Foto de la alerta" /> : null}
            <View style={{ paddingHorizontal: 16, gap: 18 }}>
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Insignia texto={e.t} tono={e.tono} />
                  {a.es_mia ? <Insignia texto="Tu alerta: nadie ve que la subiste tú" tono="primario" /> : null}
                  {a.oculta ? <Insignia texto="Escondida por reportes" tono="peligro" /> : null}
                </View>
                <Texto v="titulo">{TIPO_ALERTA[a.tipo]}: {a.especie === "gato" ? "gato" : a.especie === "perro" ? "perro" : "animal"}{a.tamano ? ` ${a.tamano}` : ""}{a.color ? `, ${a.color}` : ""}</Texto>
                {a.descripcion ? <Texto>{a.descripcion}</Texto> : null}
                <Texto v="secundario">Publicada {haceCuanto(a.created_at)}{a.es_mia && a.avisados ? ` · avisamos a ${a.avisados} ${a.avisados === 1 ? "persona" : "personas"}` : ""}</Texto>
              </View>
              <Boton titulo="Cómo llegar" icono="llegar" variante="secundario" alTocar={comoLlegar} />

              {a.actualizaciones.length ? (
                <Grupo titulo="Novedades">
                  {a.actualizaciones.map((u, i) => (
                    <View key={u.id} style={{ padding: 14, gap: 8, borderTopWidth: i ? 0.5 : 0, borderTopColor: c.linea }}>
                      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                        {u.estado ? <Insignia texto={ESTADO_ALERTA[u.estado]?.t ?? u.estado} tono={ESTADO_ALERTA[u.estado]?.tono ?? "neutro"} /> : null}
                        <Texto v="pie" color={c.textoTenue}>{u.es_mia ? "Tú" : u.de_quien_la_subio ? "Quien la subió" : "Alguien cerca"} · {haceCuanto(u.created_at)}</Texto>
                      </View>
                      {u.texto ? <Texto>{u.texto}</Texto> : null}
                      {u.fotoUrl ? <Image source={{ uri: u.fotoUrl }} style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 12 }} contentFit="cover" /> : null}
                    </View>
                  ))}
                </Grupo>
              ) : null}

              {a.estado !== "caducada" && !a.oculta ? (
                <View style={{ backgroundColor: c.superficie, borderRadius: radio.tarjeta, padding: 16, gap: 12 }}>
                  <Texto v="encabezado">¿Lo viste? Cuenta cómo está</Texto>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {ESTADOS.map((s) => <Chip key={s.valor} texto={s.texto} activo={estado === s.valor} alTocar={() => setEstado(estado === s.valor ? null : s.valor)} />)}
                  </View>
                  <Campo etiqueta="Qué viste (opcional)" value={texto} onChangeText={setTexto} multiline maxLength={300} placeholder="Sigue en la esquina, le di agua." />
                  {foto ? <Image source={{ uri: foto.uri }} style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 12 }} contentFit="cover" /> : null}
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Boton style={{ flex: 1 }} compacto variante="secundario" icono="camara" titulo={foto ? "Otra foto" : "Foto"} alTocar={async () => { const o = await preguntarOrigen("Foto de cómo está"); if (o) setFoto(await tomarFoto(o)); }} />
                    <Boton style={{ flex: 1 }} compacto titulo="Mandar" alTocar={mandarActualizacion} cargando={actualizar.ocupado} deshabilitado={!texto.trim() && !foto && !estado} />
                  </View>
                  <Mensaje texto={actualizar.error} />
                </View>
              ) : null}

              {!a.oculta && (!a.es_mia || conversaciones.length) ? (
                <View style={{ backgroundColor: c.superficie, borderRadius: radio.tarjeta, padding: 16, gap: 12 }}>
                  <Texto v="encabezado">{a.es_mia ? "Te escribieron" : "Escríbele a quien la subió"}</Texto>
                  {a.es_mia && conversaciones.length > 1 ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {conversaciones.map((n) => <Chip key={n} texto={`Persona ${n}`} activo={conversacion === n} alTocar={() => setConversacion(n)} />)}
                    </View>
                  ) : null}
                  {hilo.map((m) => (
                    <View key={m.id} style={{ alignSelf: m.mio ? "flex-end" : "flex-start", maxWidth: "85%", backgroundColor: m.mio ? c.primario : c.superficieAlta, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}>
                      <Texto color={m.mio ? c.sobrePrimario : c.texto}>{m.texto}</Texto>
                      <Texto v="pie" color={m.mio ? c.sobrePrimario : c.textoTenue}>{haceCuanto(m.created_at)}</Texto>
                    </View>
                  ))}
                  <Campo etiqueta="Tu mensaje" value={mensaje} onChangeText={setMensaje} multiline maxLength={600} placeholder={a.es_mia ? "Gracias por avisar…" : "Creo que es de mi vecina, ¿sigue ahí?"} ayuda="Nadie ve tu número. Le llega en la app y, si habló con PeluDesk hoy, por WhatsApp." />
                  <Boton titulo="Mandar mensaje" alTocar={mandarMensaje} cargando={escribir.ocupado} deshabilitado={!mensaje.trim()} />
                  <Mensaje texto={escribir.error} />
                </View>
              ) : null}

              {!a.es_mia ? (
                a.ya_reporte ? <Texto v="secundario">Ya la reportaste. Gracias: PeluDesk la revisa.</Texto> : <Boton variante="texto" icono="reportar" titulo="Reportar alerta falsa u ofensiva" alTocar={reportar} />
              ) : null}
              <Mensaje texto={reporte.error} />
              <View style={{ height: 8 }} />
            </View>
          </>
        ) : null}
      </Pantalla>
    </>
  );
}

