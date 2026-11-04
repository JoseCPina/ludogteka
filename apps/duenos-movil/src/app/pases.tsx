import { View } from "react-native";
import { usePantalla } from "@/lib/datos";
import { fechaCorta } from "@/lib/formato";
import { Pantalla } from "@/componentes/pantalla";
import { Insignia, Texto, Vacio } from "@/componentes/ui";
import { Icono } from "@/componentes/icono";
import { radio, useColores } from "@/tema";

type Pase = { id: string; negocioNombre: string; servicioNombre: string; perroNombre: string | null; cantidadTotal: number; cantidadDisponible: number; ilimitado: boolean; fechaVencimiento: string | null; estado: string };

/** Los pases: cuántas visitas quedan con su barra, y cuándo vence. Los terminados aparte. */
export default function Pases() {
  const c = useColores();
  const p = usePantalla<{ pases: Pase[] }>("pases");
  const activos = (p.datos?.pases ?? []).filter((x) => x.estado === "activo");
  const otros = (p.datos?.pases ?? []).filter((x) => x.estado !== "activo");
  const tarjeta = (x: Pase, apagado = false) => {
    const usado = x.ilimitado ? 0 : 1 - x.cantidadDisponible / Math.max(1, x.cantidadTotal);
    return (
      <View key={x.id} style={{ backgroundColor: apagado ? c.superficieAlta : c.primario, borderRadius: radio.tarjeta, padding: 18, gap: 14, opacity: apagado ? 0.8 : 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Texto v="encabezado" color={apagado ? c.texto : c.sobrePrimario}>{x.servicioNombre}</Texto>
            <Texto v="secundario" color={apagado ? c.textoSuave : c.sobrePrimario}>{[x.negocioNombre, x.perroNombre].filter(Boolean).join(" · ")}</Texto>
          </View>
          <Icono nombre="pase" tamano={24} color={apagado ? c.textoSuave : c.sobrePrimario} />
        </View>
        <Texto v="cifra" color={apagado ? c.texto : c.sobrePrimario}>{x.ilimitado ? "Ilimitado" : `${x.cantidadDisponible} de ${x.cantidadTotal}`}</Texto>
        {!x.ilimitado ? (
          <View style={{ height: 8, borderRadius: 4, backgroundColor: apagado ? c.linea : "rgba(255,255,255,0.25)" }}>
            <View style={{ height: 8, borderRadius: 4, width: `${Math.round((1 - usado) * 100)}%`, backgroundColor: apagado ? c.textoTenue : c.sobrePrimario }} />
          </View>
        ) : null}
        {apagado ? <Insignia texto={x.estado === "vencido" ? "Vencido" : "Terminado"} tono="neutro" /> : x.fechaVencimiento ? <Texto v="pie" color={c.sobrePrimario}>Vence el {fechaCorta(x.fechaVencimiento)}</Texto> : null}
      </View>
    );
  };
  return (
    <Pantalla cargando={p.cargando} error={p.error} refrescando={p.refrescando} alRefrescar={p.refrescar} alReintentar={p.refrescar}>
      {p.datos && p.datos.pases.length === 0 ? <Vacio icono="pase" titulo="Sin pases" texto="Cuando compres un paquete de guardería o estética en tu negocio, aparece aquí." /> : null}
      {activos.map((x) => tarjeta(x))}
      {otros.length ? <Texto v="encabezado">Terminados</Texto> : null}
      {otros.map((x) => tarjeta(x, true))}
    </Pantalla>
  );
}
