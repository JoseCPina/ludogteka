import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { llamar } from "@/lib/api";
import { usePantalla, useAccion } from "@/lib/datos";
import { fechaCorta, pesos, sumarDias } from "@/lib/formato";
import { Pantalla } from "@/componentes/pantalla";
import { Boton, Campo, Chip, Fila, Grupo, Insignia, Mensaje, Texto, Vacio } from "@/componentes/ui";
import { CampoFecha } from "@/componentes/fecha";
import { RecoleccionPedir, type RecoleccionPedida } from "@/componentes/recoleccion-pedir";
import { Requisitos, type Revision } from "@/componentes/requisitos";
import { useColores } from "@/tema";

type Servicio = { id: string; nombre: string; categoria: "hotel" | "guarderia"; unidad: string };
type Negocio = { id: string; nombre: string; hoy: string; servicios: Servicio[]; recoleccion?: boolean };
type Datos = { mascota: { id: string; nombre: string }; negocios: Negocio[] };
type Cupo = { hayCupo: boolean; dias: { fecha: string; abre: boolean; cupo: number | null; disponible: number }[] };
type Hecha = { precio_total?: number | null; saldo?: number | null; cubierto_con_pase?: number | null; contratos_por_firmar?: { id: string; tipo_nombre: string }[] };

/**
 * Reservar guardería u hotel con el cupo real de cada día (referencia app-reservar-fecha-cupo: lo lleno dice «Lleno»
 * y no desaparece). Si faltan contratos de alta, se firman ahí mismo con el dedo.
 */
export default function Reservar() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColores();
  const p = usePantalla<Datos>("reservar", [id]);
  const [negocioId, setNegocioId] = useState<string | null>(null);
  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [entrada, setEntrada] = useState<string | null>(null);
  const [salida, setSalida] = useState<string | null>(null);
  const [horas, setHoras] = useState("");
  const [cupo, setCupo] = useState<Cupo | null>(null);
  const [hecha, setHecha] = useState<Hecha | null>(null);
  const [recoleccion, setRecoleccion] = useState<RecoleccionPedida | null>(null);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [pedido, setPedido] = useState(false);
  const [recoPendiente, setRecoPendiente] = useState(false);
  const ver = useAccion();
  const reservar = useAccion();
  const d = p.datos;
  const negocio = d?.negocios.find((n) => n.id === negocioId) ?? d?.negocios[0] ?? null;
  const esHotel = servicio?.categoria === "hotel";
  const porHora = servicio?.unidad === "hora";
  // Una guardería ocupa un día: la base guarda la estancia hasta el día siguiente.
  const salidaReal = esHotel ? salida : entrada ? sumarDias(entrada, 1) : null;

  const argsReserva = () => [negocio!.id, id, servicio!.id, entrada, salidaReal, porHora ? Number(horas) || null : null] as const;
  const revisar = async () => {
    const q = await llamar<{ datos?: Revision }>("revisarReserva", [...argsReserva(), null]);
    if (q.datos) setRevision(q.datos);
    return q;
  };
  const verCupo = () =>
    ver.ejecutar(async () => {
      const r = await llamar<{ datos?: Cupo }>("cupo", [negocio!.id, servicio!.id, entrada, salidaReal]);
      setCupo(r.datos ?? null);
      if (r.error) return r;
      return revisar();
    });
  // Al volver de firmar el contrato o de subir la cartilla, se revisa otra vez.
  useFocusEffect(useCallback(() => {
    if (cupo && negocio && servicio) revisar().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cupo]));
  const pedirLugar = async () => {
    const r = await reservar.ejecutar(() => llamar<{ datos?: { id: string } }>("pedirLugar", [...argsReserva(), null, recoleccion]));
    if (r?.datos) setPedido(true);
  };
  const faltan = (revision?.faltan.length ?? 0) > 0;

  const confirmar = async () => {
    const r = await reservar.ejecutar(() => llamar<{ datos?: Hecha }>("reservarEstancia", [negocio!.id, id, servicio!.id, entrada, salidaReal, porHora ? Number(horas) || null : null, recoleccion]));
    if (r?.datos) setHecha(r.datos);
    else revisar().catch(() => {});
  };

  if (pedido && negocio) {
    return (
      <Pantalla>
        <Vacio icono="listo" titulo="Listo, pediste su lugar" texto={`${negocio.nombre} lo revisa y te avisa aquí. Todavía no se cobra ni se aparta. Si no contesta en 3 días, la solicitud caduca y te avisamos.`} accion={<Boton titulo="Ver mis solicitudes" alTocar={() => router.replace("/visitas")} />} />
      </Pantalla>
    );
  }

  if (hecha && negocio) {
    const contratos = hecha.contratos_por_firmar ?? [];
    return (
      <Pantalla>
        <Vacio
          icono="listo"
          titulo="¡Reservado!"
          texto={`${servicio?.nombre} para ${d?.mascota.nombre} en ${negocio.nombre}${entrada ? `, ${fechaCorta(entrada)}${esHotel && salida ? ` al ${fechaCorta(salida)}` : ""}` : ""}.${hecha.cubierto_con_pase ? " Lo cubre tu pase." : hecha.saldo ? ` Por pagar: ${pesos(Number(hecha.saldo))}.` : ""}`}
        />
        {contratos.length ? (
          <Grupo titulo="Antes de llegar, firma" pie="Se firma con el dedo en un minuto.">
            {contratos.map((k, i) => <Fila key={k.id} icono="firma" colorIcono={c.aviso} titulo={k.tipo_nombre} alTocar={() => router.push(`/contratos/${negocio.id}/${k.id}`)} ultima={i === contratos.length - 1} />)}
          </Grupo>
        ) : null}
        <Boton variante={contratos.length ? "secundario" : "primario"} titulo="Ver mis visitas" alTocar={() => router.replace("/visitas")} />
      </Pantalla>
    );
  }

  const listo = Boolean(servicio && entrada && salidaReal && (!porHora || Number(horas) > 0));
  return (
    <Pantalla
      cargando={p.cargando}
      error={p.error}
      alReintentar={p.refrescar}
      pie={listo ? (cupo && faltan ? (revision?.puedePedirLugar ? <Boton titulo="Pedir lugar" alTocar={pedirLugar} cargando={reservar.ocupado} deshabilitado={recoPendiente} /> : undefined) : cupo?.hayCupo ? <Boton titulo="Reservar" alTocar={confirmar} cargando={reservar.ocupado} deshabilitado={recoPendiente} /> : <Boton titulo="Ver si hay lugar" variante={cupo ? "secundario" : "primario"} alTocar={verCupo} cargando={ver.ocupado} />) : undefined}
    >
      {d ? (
        d.negocios.length === 0 ? (
          <Vacio icono="hotel" titulo="Sin guardería ni hotel en línea" texto={`Los negocios de ${d.mascota.nombre} todavía no reservan guardería ni hotel por la app.`} />
        ) : (
          <>
            {d.negocios.length > 1 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {d.negocios.map((n) => <Chip key={n.id} texto={n.nombre} activo={negocio?.id === n.id} alTocar={() => { setNegocioId(n.id); setServicio(null); setCupo(null); setRevision(null); }} />)}
              </View>
            ) : (
              <Texto v="encabezado">{negocio?.nombre}</Texto>
            )}
            <Grupo titulo="¿Qué servicio?">
              {negocio?.servicios.map((s, i) => (
                <Fila key={s.id} icono={s.categoria === "hotel" ? "hotel" : "guarderia"} titulo={s.nombre} detalle={s.categoria === "hotel" ? "Por noche" : s.unidad === "hora" ? "Por hora" : "Por día"} alTocar={() => { setServicio(s); setCupo(null); setRevision(null); if (!entrada) setEntrada(negocio.hoy); }} derecha={servicio?.id === s.id ? <Texto v="cuerpoFuerte" color={c.primario}>✓</Texto> : undefined} ultima={i === negocio.servicios.length - 1} />
              ))}
            </Grupo>
            {servicio && negocio ? (
              <View style={{ gap: 14 }}>
                <CampoFecha etiqueta={esHotel ? "Llega" : "Día"} valor={entrada} alCambiar={(v) => { setEntrada(v); setCupo(null); setRevision(null); if (esHotel && v && (!salida || salida <= v)) setSalida(sumarDias(v, 1)); }} minimo={negocio.hoy} />
                {esHotel ? <CampoFecha etiqueta="Sale" valor={salida} alCambiar={(v) => { setSalida(v); setCupo(null); setRevision(null); }} minimo={entrada ? sumarDias(entrada, 1) : negocio.hoy} /> : null}
                {porHora ? <Campo etiqueta="¿Cuántas horas?" value={horas} onChangeText={(t) => { setHoras(t); setCupo(null); setRevision(null); }} keyboardType="number-pad" placeholder="4" /> : null}
              </View>
            ) : null}
            {cupo ? (
              <Grupo titulo={cupo.hayCupo ? "Hay lugar" : "No hay lugar todos los días"}>
                {cupo.dias.map((x, i) => (
                  <Fila key={x.fecha} titulo={fechaCorta(x.fecha)} derecha={<Insignia texto={!x.abre ? "Cerrado" : x.disponible <= 0 ? "Lleno" : x.disponible <= 2 ? `Quedan ${x.disponible}` : "Hay lugar"} tono={!x.abre || x.disponible <= 0 ? "peligro" : x.disponible <= 2 ? "aviso" : "exito"} />} ultima={i === cupo.dias.length - 1} />
                ))}
              </Grupo>
            ) : null}
            {cupo && revision && faltan && negocio ? <Requisitos revision={revision} negocioId={negocio.id} mascotaId={id} /> : null}
            {servicio && negocio?.recoleccion ? <RecoleccionPedir negocioId={negocio.id} mascotaId={id} alCambiar={setRecoleccion} alPendiente={setRecoPendiente} /> : null}
            <Mensaje texto={ver.error ?? reservar.error} />
          </>
        )
      ) : null}
    </Pantalla>
  );
}
