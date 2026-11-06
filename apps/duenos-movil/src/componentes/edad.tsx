import { useMemo, useState } from "react";
import { View } from "react-native";
import { hoyLocal } from "@/lib/formato";
import { Boton, Texto } from "./ui";
import { CampoFechaRuedas, MarcoRuedas, Rueda, restarDiasIso, sumarMesesIso } from "./rueda";
import { fuentes, useColores } from "@/tema";

type Modo = "edad" | "exacta" | "no_se";

/**
 * Fecha de nacimiento sin pelearse con un calendario: primero «¿Qué edad tiene?» con años y meses, y la app calcula la
 * fecha aproximada; debajo, «Sé la fecha exacta» (ruedas de día, mes y año) y «No sé su edad» (se queda sin edad).
 */
export function SelectorEdad({ alCambiar }: { alCambiar: (fecha: string | null) => void }) {
  const c = useColores();
  const hoy = hoyLocal();
  const [modo, setModo] = useState<Modo>("edad");
  const [anios, setAnios] = useState(0);
  const [tocado, setTocado] = useState(false);
  const [meses, setMeses] = useState(0);
  const [exacta, setExacta] = useState<string | null>(null);
  const opcionesAnios = useMemo(() => Array.from({ length: 31 }, (_, i) => ({ valor: i, texto: i === 1 ? "1 año" : `${i} años` })), []);
  const opcionesMeses = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ valor: i, texto: i === 1 ? "1 mes" : `${i} meses` })), []);
  const calcular = (a: number, m: number) => sumarMesesIso(hoy, -(a * 12 + m));
  const aproximada = calcular(anios, meses);

  const elegir = (a: number, m: number) => {
    setTocado(true);
    setAnios(a);
    setMeses(m);
    alCambiar(calcular(a, m));
  };
  const pasarA = (m: Modo) => {
    setModo(m);
    alCambiar(m === "edad" ? (tocado ? aproximada : null) : m === "exacta" ? exacta : null);
  };

  return (
    <View style={{ gap: 10 }}>
      <Texto v="secundario" color={c.texto} style={{ fontFamily: fuentes.media }}>¿Qué edad tiene?</Texto>
      {modo === "edad" ? (
        <>
          <MarcoRuedas>
            <Rueda etiqueta="Años" opciones={opcionesAnios} valor={anios} alCambiar={(v) => elegir(v, meses)} />
            <Rueda etiqueta="Meses" opciones={opcionesMeses} valor={meses} alCambiar={(v) => elegir(anios, v)} />
          </MarcoRuedas>
          <Texto v="secundario" centrado>{tocado ? `Le ponemos que nació por ${new Date(`${aproximada}T12:00:00`).toLocaleDateString("es-MX", { month: "long", year: "numeric" })}.` : "Mueve las ruedas; con una aproximada basta."}</Texto>
        </>
      ) : modo === "exacta" ? (
        <CampoFechaRuedas etiqueta="Fecha de nacimiento" valor={exacta} alCambiar={(v) => { setExacta(v); alCambiar(v); }} minimo={restarDiasIso(hoy, 365 * 35)} maximo={hoy} />
      ) : (
        <Texto v="secundario">Se queda sin edad. La puedes poner después.</Texto>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, justifyContent: "center" }}>
        {modo !== "edad" ? <Boton ancho={false} compacto variante="texto" titulo="Poner su edad" alTocar={() => pasarA("edad")} /> : null}
        {modo !== "exacta" ? <Boton ancho={false} compacto variante="texto" titulo="Sé la fecha exacta" alTocar={() => pasarA("exacta")} /> : null}
        {modo !== "no_se" ? <Boton ancho={false} compacto variante="texto" titulo="No sé su edad" alTocar={() => pasarA("no_se")} /> : null}
      </View>
    </View>
  );
}
