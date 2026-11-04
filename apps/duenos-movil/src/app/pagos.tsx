import { Linking, View } from "react-native";
import { llamar } from "@/lib/api";
import { usePantalla, useAccion } from "@/lib/datos";
import { fechaCorta, pesos } from "@/lib/formato";
import { Pantalla } from "@/componentes/pantalla";
import { Boton, Mensaje, Texto, Vacio } from "@/componentes/ui";
import { radio, useColores } from "@/tema";

type AFavor = { negocioNombre: string; reservaId: string; descripcion: string; aFavor: number };
type Pago = { negocioId: string; negocioNombre: string; reservaId: string; descripcion: string; perros: string; fechaActividad: string; saldo: number };

/** Por pagar (referencia app-pagar: el monto va en el botón). El link de Mercado Pago se abre en el navegador seguro. */
export default function Pagos() {
  const p = usePantalla<{ pagos: Pago[]; aFavor?: AFavor[] }>("pagos");
  const total = (p.datos?.pagos ?? []).reduce((t, x) => t + x.saldo, 0);
  return (
    <Pantalla cargando={p.cargando} error={p.error} refrescando={p.refrescando} alRefrescar={p.refrescar} alReintentar={p.refrescar}>
      {p.datos ? (
        p.datos.pagos.length === 0 ? (
          <Vacio icono="listo" titulo="Estás al corriente" texto="No tienes nada por pagar en tus negocios." />
        ) : (
          <>
            <View>
              <Texto v="cifra">{pesos(total)}</Texto>
              <Texto v="secundario">Por pagar en {p.datos.pagos.length} {p.datos.pagos.length === 1 ? "cuenta" : "cuentas"}</Texto>
            </View>
            {p.datos.pagos.map((x) => <TarjetaPago key={x.reservaId} x={x} />)}
            <Texto v="secundario">El pago es con Mercado Pago, en su página segura. Al terminar, el negocio lo ve al momento.</Texto>
          </>
        )
      ) : null}
    </Pantalla>
  );
}

function TarjetaPago({ x }: { x: Pago }) {
  const c = useColores();
  const accion = useAccion();
  const pagar = async () => {
    const r = await accion.ejecutar(() => llamar<{ datos?: { url: string } }>("pedirLinkPago", [x.negocioId, x.reservaId]));
    if (r?.datos?.url) Linking.openURL(r.datos.url);
  };
  return (
    <View style={{ backgroundColor: c.superficie, borderRadius: radio.tarjeta, padding: 16, gap: 12 }}>
      <View style={{ gap: 2 }}>
        <Texto v="cuerpoFuerte">{x.descripcion}</Texto>
        <Texto v="secundario">{[x.negocioNombre, x.perros, fechaCorta(x.fechaActividad)].filter(Boolean).join(" · ")}</Texto>
      </View>
      <Mensaje texto={accion.error} />
      <Boton titulo={`Pagar ${pesos(x.saldo)}`} icono="pago" alTocar={pagar} cargando={accion.ocupado} />
    </View>
  );
}
