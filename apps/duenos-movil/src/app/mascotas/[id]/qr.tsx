import { useState } from "react";
import { Share, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { usePantalla } from "@/lib/datos";
import { Pantalla } from "@/componentes/pantalla";
import { AvatarMascota, Boton, Fila, Grupo, Texto, sombra } from "@/componentes/ui";
import { radio, useColores } from "@/tema";

type Datos = { mascota: { nombre: string; fotoUrl: string | null }; perfilUrl: string; codigo: string };

/** La placa con QR: tarjeta centrada con su foto, el código y qué ve quien lo escanea (referencia app-perfil-publico-qr). */
export default function Qr() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColores();
  const p = usePantalla<Datos>("qr", [id]);
  const [copiado, setCopiado] = useState(false);
  const d = p.datos;
  return (
    <Pantalla cargando={p.cargando} error={p.error} alReintentar={p.refrescar}>
      {d ? (
        <>
          <View style={[{ backgroundColor: "#FFFFFF", borderRadius: radio.hoja, padding: 24, alignItems: "center", gap: 16 }, sombra(c.sombra)]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "stretch" }}>
              <AvatarMascota nombre={d.mascota.nombre} foto={d.mascota.fotoUrl} tamano={48} />
              <View>
                <Texto v="encabezado" color="#221F2B">{d.mascota.nombre}</Texto>
                <Texto v="secundario" color="#625C6B">Si me encuentras, escanéame</Texto>
              </View>
            </View>
            <View accessibilityLabel={`Código QR del perfil de ${d.mascota.nombre}`}>
              <QRCode value={d.perfilUrl} size={220} color="#221F2B" backgroundColor="#FFFFFF" ecl="M" />
            </View>
            <Texto v="pie" color="#625C6B">Código {d.codigo}</Texto>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Boton style={{ flex: 1 }} variante="secundario" icono="copiar" titulo={copiado ? "Copiado" : "Copiar link"} alTocar={async () => { await Clipboard.setStringAsync(d.perfilUrl); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }} />
            <Boton style={{ flex: 1 }} icono="compartir" titulo="Compartir" alTocar={() => Share.share({ message: `Si encuentras a ${d.mascota.nombre}, escanea su placa o abre: ${d.perfilUrl}` })} />
          </View>
          <Grupo titulo="Qué ve quien lo escanea">
            <Fila icono="mascota" titulo="Su foto, nombre y lo básico" detalle="Nunca tu teléfono ni tu dirección." />
            <Fila icono="chat" titulo="Un botón para escribirte" detalle="Te llega aquí y por WhatsApp; tú decides qué contestar." />
            <Fila icono="veterinaria" titulo="Su cartilla, si es una vet" detalle="Puede registrar la vacuna que le puso en 20 segundos, sin cuenta." ultima />
          </Grupo>
        </>
      ) : null}
    </Pantalla>
  );
}
