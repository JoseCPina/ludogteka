import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { llamar } from "@/lib/api";
import { usePantalla, useAccion } from "@/lib/datos";
import { fechaCorta, hoyLocal, pesos } from "@/lib/formato";
import { Pantalla } from "@/componentes/pantalla";
import { Boton, Campo, Chip, Fila, Grupo, Mensaje, Segmentos, Texto, Vacio } from "@/componentes/ui";
import { CampoFecha } from "@/componentes/fecha";
import { radio, tipo as tipografia, useColores } from "@/tema";

type Datos = {
  mascota: { id: string; nombre: string };
  pesos: { id: string; peso_kg: number; fecha: string; notas: string | null }[];
  medicamentos: { id: string; nombre: string; dosis: string | null; horas: string[]; fecha_inicio: string; fecha_fin: string | null }[];
  gastos: { id: string; concepto: string; monto: number; categoria: string; fecha: string }[];
  totalMes: number;
  mes: string;
};
const CATEGORIAS = [["alimento", "Alimento"], ["veterinaria", "Veterinaria"], ["estetica", "Estética"], ["guarderia_hotel", "Guardería u hotel"], ["medicinas", "Medicinas"], ["accesorios", "Accesorios"], ["otro", "Otro"]] as const;
const HORAS = ["07:00", "09:00", "13:00", "15:00", "19:00", "21:00"];

/** Peso (con su gráfica), medicinas con su horario de aviso y los gastos del mes. Una pestaña a la vez. */
export default function Seguimiento() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColores();
  const p = usePantalla<Datos>("seguimiento", [id]);
  const [vista, setVista] = useState<"peso" | "medicinas" | "gastos">("peso");
  const [form, setForm] = useState(false);
  const accion = useAccion();
  // Campos (uno por formulario a la vez)
  const [peso, setPeso] = useState("");
  const [fecha, setFecha] = useState<string | null>(hoyLocal());
  const [medNombre, setMedNombre] = useState("");
  const [dosis, setDosis] = useState("");
  const [horas, setHoras] = useState<string[]>(["09:00"]);
  const [hasta, setHasta] = useState<string | null>(null);
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [categoria, setCategoria] = useState<string>("alimento");

  const listo = (r: { error: string | null } | null) => {
    if (r && !r.error) {
      setForm(false);
      setPeso(""); setMedNombre(""); setDosis(""); setConcepto(""); setMonto("");
      p.recargar();
    }
  };
  const guardar = async () => {
    if (vista === "peso") listo(await accion.ejecutar(() => llamar("agregarPeso", [id, peso, fecha, null])));
    else if (vista === "medicinas") listo(await accion.ejecutar(() => llamar("agregarMedicamento", [id, { nombre: medNombre, dosis: dosis || null, horas, fecha_inicio: fecha ?? hoyLocal(), fecha_fin: hasta }])));
    else listo(await accion.ejecutar(() => llamar("agregarGasto", [id, { concepto, monto, categoria, fecha }])));
  };
  const confirmar = (titulo: string, accionNombre: string, filaId: string, boton = "Quitar") =>
    Alert.alert(titulo, undefined, [{ text: "Cancelar", style: "cancel" }, { text: boton, style: "destructive", onPress: async () => listo(await accion.ejecutar(() => llamar(accionNombre, [id, filaId]))) }]);

  const d = p.datos;
  const serie = [...(d?.pesos ?? [])].slice(0, 8).reverse();
  const max = Math.max(...serie.map((x) => Number(x.peso_kg)), 1);
  const min = Math.min(...serie.map((x) => Number(x.peso_kg)), max);

  return (
    <Pantalla cargando={p.cargando} error={p.error} refrescando={p.refrescando} alRefrescar={p.refrescar} alReintentar={p.refrescar}>
      {d ? (
        <>
          <Segmentos valor={vista} alCambiar={(v) => { setVista(v); setForm(false); accion.setError(null); }} opciones={[{ valor: "peso", texto: "Peso" }, { valor: "medicinas", texto: "Medicinas" }, { valor: "gastos", texto: "Gastos" }]} />

          {vista === "peso" ? (
            d.pesos.length ? (
              <View style={{ backgroundColor: c.superficie, borderRadius: radio.tarjeta, padding: 18, gap: 16 }}>
                <View>
                  <Texto v="cifra">{Number(d.pesos[0].peso_kg)} kg</Texto>
                  <Texto v="secundario">Último peso, {fechaCorta(d.pesos[0].fecha)}</Texto>
                </View>
                {serie.length > 1 ? (
                  <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, height: 96 }} accessibilityLabel={`Sus últimos pesos: ${serie.map((x) => `${x.peso_kg} kg`).join(", ")}`}>
                    {serie.map((x, i) => {
                      const v = Number(x.peso_kg);
                      const alto = max === min ? 60 : 24 + ((v - min) / (max - min)) * 70;
                      return (
                        <View key={x.id} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                          <View style={{ width: "100%", height: alto, borderRadius: 8, backgroundColor: i === serie.length - 1 ? c.primario : c.primarioSuave }} />
                          <Texto v="pie" color={c.textoTenue}>{fechaCorta(x.fecha).split(" ").slice(0, 2).join(" ")}</Texto>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            ) : (
              <Vacio icono="peso" titulo="Sin pesos todavía" texto="Anótalo cada vez que lo peses y aquí ves cómo va." />
            )
          ) : null}
          {vista === "peso" && d.pesos.length ? (
            <Grupo titulo="Historial">
              {d.pesos.map((x, i) => <Fila key={x.id} titulo={`${Number(x.peso_kg)} kg`} detalle={fechaCorta(x.fecha)} alTocar={() => confirmar(`¿Quitar ${x.peso_kg} kg?`, "quitarPeso", x.id)} derecha={<View />} ultima={i === d.pesos.length - 1} />)}
            </Grupo>
          ) : null}

          {vista === "medicinas" ? (
            d.medicamentos.length ? (
              <Grupo titulo="Le estás dando" pie="Te avisamos a cada hora que pusiste.">
                {d.medicamentos.map((m, i) => (
                  <Fila key={m.id} icono="medicina" colorIcono={c.exito} titulo={m.nombre} detalle={[m.dosis, m.horas.join(", "), m.fecha_fin ? `hasta ${fechaCorta(m.fecha_fin)}` : null].filter(Boolean).join(" · ")} alTocar={() => confirmar(`¿Ya terminó ${m.nombre}?`, "terminarMedicamento", m.id, "Terminar")} ultima={i === d.medicamentos.length - 1} />
                ))}
              </Grupo>
            ) : (
              <Vacio icono="medicina" titulo="Sin medicinas activas" texto="Agrega una y te avisamos a la hora de cada toma." />
            )
          ) : null}

          {vista === "gastos" ? (
            <>
              <View style={{ backgroundColor: c.superficie, borderRadius: radio.tarjeta, padding: 18 }}>
                <Texto v="cifra">{pesos(d.totalMes)}</Texto>
                <Texto v="secundario">Gastado en {d.mes}</Texto>
              </View>
              {d.gastos.length ? (
                <Grupo titulo="Este mes">
                  {d.gastos.map((g, i) => <Fila key={g.id} titulo={g.concepto} detalle={`${fechaCorta(g.fecha)} · ${CATEGORIAS.find((x) => x[0] === g.categoria)?.[1] ?? "Otro"}`} derecha={<Texto v="cuerpoFuerte">{pesos(Number(g.monto))}</Texto>} alTocar={() => confirmar(`¿Quitar ${g.concepto}?`, "quitarGasto", g.id)} ultima={i === d.gastos.length - 1} />)}
                </Grupo>
              ) : null}
            </>
          ) : null}

          {form ? (
            <View style={{ backgroundColor: c.superficie, borderRadius: radio.tarjeta, padding: 16, gap: 14 }}>
              {vista === "peso" ? (
                <>
                  <Campo etiqueta="Peso en kg" value={peso} onChangeText={setPeso} keyboardType="decimal-pad" placeholder="12.5" style={tipografia.encabezado} />
                  <CampoFecha etiqueta="Fecha" valor={fecha} alCambiar={setFecha} maximo={hoyLocal()} />
                </>
              ) : vista === "medicinas" ? (
                <>
                  <Campo etiqueta="Medicina" value={medNombre} onChangeText={setMedNombre} placeholder="Nombre" />
                  <Campo etiqueta="Dosis (opcional)" value={dosis} onChangeText={setDosis} placeholder="Media pastilla" />
                  <Texto v="secundario" color={c.texto}>¿A qué horas?</Texto>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {HORAS.map((h) => <Chip key={h} texto={h} activo={horas.includes(h)} alTocar={() => setHoras((x) => (x.includes(h) ? x.filter((y) => y !== h) : [...x, h]))} />)}
                  </View>
                  <CampoFecha etiqueta="Hasta (opcional)" valor={hasta} alCambiar={setHasta} minimo={hoyLocal()} />
                </>
              ) : (
                <>
                  <Campo etiqueta="¿En qué?" value={concepto} onChangeText={setConcepto} placeholder="Croquetas" />
                  <Campo etiqueta="¿Cuánto?" value={monto} onChangeText={setMonto} keyboardType="decimal-pad" placeholder="450" />
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {CATEGORIAS.map(([v, t]) => <Chip key={v} texto={t} activo={categoria === v} alTocar={() => setCategoria(v)} />)}
                  </View>
                  <CampoFecha etiqueta="Fecha" valor={fecha} alCambiar={setFecha} maximo={hoyLocal()} />
                </>
              )}
              <Mensaje texto={accion.error} />
              <Boton titulo="Guardar" alTocar={guardar} cargando={accion.ocupado} />
              <Pressable onPress={() => setForm(false)} style={{ alignSelf: "center", padding: 6 }}><Texto v="secundario" color={c.primario}>Cancelar</Texto></Pressable>
            </View>
          ) : (
            <Boton variante="secundario" icono="agregar" titulo={vista === "peso" ? "Anotar peso" : vista === "medicinas" ? "Agregar medicina" : "Anotar gasto"} alTocar={() => { setFecha(hoyLocal()); setForm(true); }} />
          )}
          {!form ? <Mensaje texto={accion.error} /> : null}
        </>
      ) : null}
    </Pantalla>
  );
}
