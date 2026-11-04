import { useState } from "react";
import { Alert, Linking, Share, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { llamar } from "@/lib/api";
import { usePantalla, useAccion } from "@/lib/datos";
import { haceCuanto } from "@/lib/formato";
import { miUbicacion } from "@/lib/ubicacion";
import { Pantalla } from "@/componentes/pantalla";
import { AvatarMascota, Boton, Campo, Fila, Grupo, Insignia, Mensaje, Texto } from "@/componentes/ui";
import { radio, useColores } from "@/tema";

type Datos = {
  mascota: { id: string; nombre: string; sexo: string | null; fotoUrl: string | null; perdidaAt: string | null; perdidaNota: string | null; encontradaAt: string | null };
  perdida: boolean;
  cartelUrl: string;
  perfilUrl: string;
  mensajes: { id: string; de: "hallador" | "dueno"; texto: string; halladorNombre: string | null; creado: string }[];
};
type Alerta = { duenosAvisados: number; negociosAvisados: number };

/**
 * Mascota perdida (referencia app-mascota-perdida: Citizen y Nextdoor). Antes: la zona por GPS, una nota y un botón
 * rojo. Después: cuántos vecinos se avisaron, el cartel, los mensajes de quien la vea y «Ya apareció».
 */
export default function Perdida() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColores();
  const p = usePantalla<Datos>("perdida", [id]);
  const [nota, setNota] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [alerta, setAlerta] = useState<Alerta | null>(null);
  const accion = useAccion();
  const d = p.datos;
  const ella = d?.mascota.sexo === "macho" ? "lo" : "la";

  const avisar = () =>
    accion.ejecutar(async () => {
      const u = await miUbicacion({ precisa: true, avisar: true });
      const r = await llamar<{ alerta?: Alerta }>("marcarPerdida", [id, { lat: u?.lat ?? null, lng: u?.lng ?? null, nota }]);
      if (r.alerta) setAlerta(r.alerta);
      if (!r.error) p.recargar();
      return r;
    });

  const aparecio = () =>
    Alert.alert(`¿${d?.mascota.nombre} ya apareció?`, "Dejamos de avisar y le decimos a la gente que ya está en casa.", [
      { text: "Todavía no", style: "cancel" },
      { text: "Sí, ya está en casa", onPress: async () => { const r = await accion.ejecutar(() => llamar("marcarEncontrada", [id])); if (r && !r.error) p.recargar(); } },
    ]);

  const contestar = async () => {
    const r = await accion.ejecutar(() => llamar("responderHallador", [id, respuesta]));
    if (r && !r.error) {
      setRespuesta("");
      p.recargar();
    }
  };

  return (
    <Pantalla cargando={p.cargando} error={p.error} refrescando={p.refrescando} alRefrescar={p.refrescar} alReintentar={p.refrescar}>
      {d ? (
        <>
          <View style={{ backgroundColor: d.perdida ? c.peligroSuave : c.superficie, borderRadius: radio.tarjeta, padding: 18, flexDirection: "row", gap: 14, alignItems: "center" }}>
            <AvatarMascota nombre={d.mascota.nombre} foto={d.mascota.fotoUrl} tamano={64} />
            <View style={{ flex: 1, gap: 4 }}>
              <Texto v="encabezado">{d.perdida ? `Buscando a ${d.mascota.nombre}` : d.mascota.encontradaAt ? `${d.mascota.nombre} ya está en casa` : `¿Se perdió ${d.mascota.nombre}?`}</Texto>
              {d.perdida && d.mascota.perdidaAt ? <Insignia texto={`Perdida ${haceCuanto(d.mascota.perdidaAt)}`} tono="peligro" /> : <Texto v="secundario">Avisamos a la gente con la app a 5 km y a los negocios de la zona.</Texto>}
            </View>
          </View>

          {alerta ? <Mensaje tono="exito" texto={`Avisamos a ${alerta.duenosAvisados} ${alerta.duenosAvisados === 1 ? "persona" : "personas"} cerca y a ${alerta.negociosAvisados} ${alerta.negociosAvisados === 1 ? "negocio" : "negocios"}.`} /> : null}
          <Mensaje texto={accion.error} />

          {!d.perdida ? (
            <>
              <Campo etiqueta="¿Cómo es y dónde la viste por última vez?" value={nota} onChangeText={setNota} multiline maxLength={200} placeholder="Collar rojo, se asusta con los ruidos. Por el parque de la colonia." />
              <Texto v="secundario">Usamos tu ubicación de este momento como la zona donde se perdió. Nadie ve tu dirección.</Texto>
              <Boton variante="peligro" icono="alerta" titulo={`Avisar que ${ella} perdí`} alTocar={avisar} cargando={accion.ocupado} />
            </>
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Boton style={{ flex: 1 }} variante="secundario" icono="compartir" titulo="Compartir cartel" alTocar={() => Share.share({ message: `Se perdió ${d.mascota.nombre}. Si ${ella} ves, avísame aquí: ${d.perfilUrl}`, url: d.cartelUrl })} />
                <Boton style={{ flex: 1 }} variante="secundario" icono="abrir" titulo="Ver cartel" alTocar={() => Linking.openURL(d.cartelUrl)} />
              </View>
              <Grupo titulo="Mensajes de quien la vea" pie="Tu número nunca se muestra: los mensajes pasan por PeluDesk.">
                {d.mensajes.length ? (
                  d.mensajes.map((m, i) => <Fila key={m.id} icono={m.de === "hallador" ? "chat" : "persona"} colorIcono={m.de === "hallador" ? c.exito : c.primario} titulo={m.texto} detalle={`${m.de === "hallador" ? (m.halladorNombre ?? "Alguien que la vio") : "Tú"} · ${haceCuanto(m.creado)}`} ultima={i === d.mensajes.length - 1} />)
                ) : (
                  <Fila icono="reloj" titulo="Todavía no hay mensajes" detalle="Te avisamos en cuanto alguien escriba." ultima />
                )}
              </Grupo>
              {d.mensajes.some((m) => m.de === "hallador") ? (
                <>
                  <Campo etiqueta="Contestar" value={respuesta} onChangeText={setRespuesta} multiline maxLength={500} placeholder="¡Gracias! ¿Dónde la viste?" />
                  <Boton titulo="Mandar" alTocar={contestar} cargando={accion.ocupado} deshabilitado={!respuesta.trim()} />
                </>
              ) : null}
              <Boton icono="listo" titulo="Ya apareció" alTocar={aparecio} />
            </>
          )}
        </>
      ) : null}
    </Pantalla>
  );
}
