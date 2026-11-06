import { useState } from "react";
import { Alert, Linking, View } from "react-native";
import * as Application from "expo-application";
import { cerrarSesion, llamar } from "@/lib/api";
import { usePantalla, useAccion } from "@/lib/datos";
import { soltarPush } from "@/lib/push";
import { Pantalla } from "@/componentes/pantalla";
import { Boton, Campo, Fila, Grupo, Mensaje, Texto } from "@/componentes/ui";
import { GuiaSeccion } from "@/componentes/onboarding";
import { useColores } from "@/tema";

type Datos = { dueno: { id: string; telefono: string | null; nombre: string | null }; negocios: { id: string; nombre: string; ciudad: string | null; url: string }[] };

const telefono = (t: string | null) => (t && t.length === 10 ? `${t.slice(0, 2)} ${t.slice(2, 6)} ${t.slice(6)}` : (t ?? ""));

/** Mi cuenta: nombre, teléfono, mis negocios, probar los avisos y salir. */
export default function Yo() {
  const c = useColores();
  const p = usePantalla<Datos>("yo");
  const [nombre, setNombre] = useState<string | null>(null);
  const guardar = useAccion();
  const prueba = useAccion();
  const [probado, setProbado] = useState<string | null>(null);
  const d = p.datos;

  const salir = () =>
    Alert.alert("¿Salir de tu cuenta?", "Tus mascotas y su cartilla se quedan guardadas. Vuelves a entrar con tu WhatsApp.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Salir", style: "destructive", onPress: async () => { await soltarPush(); await cerrarSesion(); } },
    ]);

  return (
    <>
    <GuiaSeccion seccion="yo" />
    <Pantalla cargando={p.cargando} error={p.error} refrescando={p.refrescando} alRefrescar={p.refrescar} alReintentar={p.refrescar}>
      {d ? (
        <>
          <View style={{ gap: 12 }}>
            <Campo etiqueta="Tu nombre" value={nombre ?? d.dueno.nombre ?? ""} onChangeText={setNombre} placeholder="Cómo te llamas" autoCapitalize="words" ayuda={`Tu WhatsApp: ${telefono(d.dueno.telefono)}`} />
            {nombre !== null && nombre !== (d.dueno.nombre ?? "") ? <Boton compacto titulo="Guardar nombre" cargando={guardar.ocupado} alTocar={async () => { const r = await guardar.ejecutar(() => llamar("guardarNombre", [nombre])); if (r && !r.error) { setNombre(null); p.recargar(); } }} /> : null}
            <Mensaje texto={guardar.error} />
          </View>
          {d.negocios.length ? (
            <Grupo titulo="Mis negocios" pie="Donde tus mascotas tienen expediente.">
              {d.negocios.map((n, i) => <Fila key={n.id} icono="tienda2" titulo={n.nombre} detalle={n.ciudad} alTocar={() => Linking.openURL(n.url)} ultima={i === d.negocios.length - 1} />)}
            </Grupo>
          ) : null}
          <Grupo titulo="Avisos">
            <Fila icono="aviso" titulo="Mandarme un aviso de prueba" detalle={probado ?? "Para ver que te llegan las notificaciones."} alTocar={async () => { const r = await prueba.ejecutar(() => llamar<{ enviadas?: number }>("probarAviso")); if (r && !r.error) setProbado(r.enviadas ? "Listo: revisa tus notificaciones." : "Quedó en Avisos; este celular todavía no recibe notificaciones."); }} ultima />
          </Grupo>
          <Grupo titulo="PeluDesk">
            <Fila icono="info" titulo="Aviso de privacidad" alTocar={() => Linking.openURL("https://peludesk.mx/aviso-de-privacidad")} />
            <Fila icono="chat" titulo="Ayuda por WhatsApp" alTocar={() => Linking.openURL("https://wa.me/525649160742?text=Hola%2C%20necesito%20ayuda%20con%20la%20app")} />
            <Fila icono="salir" titulo="Salir" peligro alTocar={salir} ultima />
          </Grupo>
          <Texto v="pie" centrado color={c.textoTenue}>PeluDesk {Application.nativeApplicationVersion ?? ""} · Gratis para dueños, sin anuncios</Texto>
        </>
      ) : null}
    </Pantalla>
    </>
  );
}
