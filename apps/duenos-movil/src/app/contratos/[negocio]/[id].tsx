import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { llamar } from "@/lib/api";
import { useAccion } from "@/lib/datos";
import { Pantalla } from "@/componentes/pantalla";
import { Boton, Mensaje, Texto, Vacio } from "@/componentes/ui";
import { PadFirma, type PadFirmaRef } from "@/componentes/firma";
import { radio, useColores } from "@/tema";

/** Leer el contrato (el mismo texto del PDF) y firmarlo con el dedo. El PDF firmado lo arma el servidor. */
export default function FirmarContrato() {
  const { negocio, id } = useLocalSearchParams<{ negocio: string; id: string }>();
  const c = useColores();
  const [texto, setTexto] = useState<{ titulo: string; cuerpo: string; estado: string } | null>(null);
  const [vacia, setVacia] = useState(true);
  const [firmado, setFirmado] = useState(false);
  const pad = useRef<PadFirmaRef>(null);
  const carga = useAccion();
  const firma = useAccion();

  useEffect(() => {
    carga.ejecutar(async () => {
      const r = await llamar<{ datos?: { titulo: string; cuerpo: string; estado: string } }>("textoContrato", [negocio, id]);
      if (r.datos) setTexto(r.datos);
      return r;
    });
  }, [negocio, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const firmar = async () => {
    const png = await pad.current?.png();
    if (!png) return;
    const r = await firma.ejecutar(() => llamar("firmarContrato", [negocio, id, png]));
    if (r && !r.error) setFirmado(true);
  };

  if (firmado) return <Pantalla><Vacio icono="listo" titulo="Contrato firmado" texto="El negocio ya lo tiene. Una copia queda en tu portal." accion={<Boton titulo="Listo" alTocar={() => router.back()} />} /></Pantalla>;

  return (
    <>
      <Stack.Screen options={{ title: texto?.titulo ?? "Contrato" }} />
      <Pantalla cargando={carga.ocupado && !texto} error={carga.error} pie={texto && texto.estado === "pendiente_firma" ? <Boton titulo="Firmar" icono="firma" alTocar={firmar} cargando={firma.ocupado} deshabilitado={vacia} /> : undefined}>
        {texto ? (
          <>
            <View style={{ backgroundColor: c.superficie, borderRadius: radio.tarjeta, padding: 18 }}>
              <Texto v="secundario" color={c.texto} style={{ lineHeight: 22 }}>{texto.cuerpo}</Texto>
            </View>
            {texto.estado === "pendiente_firma" ? (
              <>
                <Texto v="encabezado">Tu firma</Texto>
                <PadFirma ref={pad} alCambiar={setVacia} />
              </>
            ) : (
              <Mensaje tono="info" texto="Este contrato ya no está pendiente de firma." />
            )}
            <Mensaje texto={firma.error} />
          </>
        ) : null}
      </Pantalla>
    </>
  );
}
