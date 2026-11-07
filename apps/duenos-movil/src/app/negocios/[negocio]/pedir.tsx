import { useState } from "react";
import { Image, Linking, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { llamar } from "@/lib/api";
import { usePantalla, useAccion } from "@/lib/datos";
import { fechaCorta, sumarDias } from "@/lib/formato";
import { Pantalla } from "@/componentes/pantalla";
import { Boton, Campo, Chip, Fila, Grupo, Insignia, Mensaje, Texto, Vacio } from "@/componentes/ui";
import { CampoFecha } from "@/componentes/fecha";
import { RecoleccionPedir, type RecoleccionPedida } from "@/componentes/recoleccion-pedir";
import { fuentes, radio, useColores } from "@/tema";

type Servicio = { id: string; nombre: string; categoria: "hotel" | "guarderia" | "estetica"; unidad: string; duracionMinutos: number | null };
type Mascota = { id: string; nombre: string; especie: string; raza: string | null; fechaNacimiento: string | null; fotoUrl: string | null; vacunas: number };
type Datos = { negocio: { id: string; nombre: string; hoy: string; recoleccion: boolean; acepta: boolean; whatsapp: string | null }; servicios: Servicio[]; mascotas: Mascota[]; yo: { nombre: string | null; telefono: string | null } };
type Cupo = { hayCupo: boolean; dias: { fecha: string; abre: boolean; disponible: number }[] };
type Horas = { abre?: boolean; horas?: { inicio: string; hora: string }[] };

/**
 * Hacerse cliente de un negocio PeluDesk: mascota → servicio → fecha → recolección → qué se comparte → enviar. No cobra
 * ni ocupa cupo hasta que el negocio acepte. El mismo flujo de reservar y pedir cita, para quien todavía no tiene expediente.
 */
export default function PedirClienteNuevo() {
  const { negocio: negocioId, tipo } = useLocalSearchParams<{ negocio: string; tipo?: string }>();
  const c = useColores();
  const p = usePantalla<Datos>("clienteNuevo", [negocioId]);
  const [mascotaId, setMascotaId] = useState<string | null>(null);
  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [entrada, setEntrada] = useState<string | null>(null);
  const [salida, setSalida] = useState<string | null>(null);
  const [horas, setHoras] = useState("");
  const [cupo, setCupo] = useState<Cupo | null>(null);
  const [horasDia, setHorasDia] = useState<Horas | null>(null);
  const [hora, setHora] = useState<{ inicio: string; hora: string } | null>(null);
  const [recoleccion, setRecoleccion] = useState<RecoleccionPedida | null>(null);
  const [recoPendiente, setRecoPendiente] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [enviada, setEnviada] = useState(false);
  const consulta = useAccion();
  const envio = useAccion();

  const d = p.datos;
  const mascota = d?.mascotas.find((m) => m.id === mascotaId) ?? (d?.mascotas.length === 1 ? d.mascotas[0] : null);
  const servicios = (d?.servicios ?? []).filter((s) => (tipo === "cita" ? s.categoria === "estetica" : tipo === "estancia" ? s.categoria !== "estetica" : true));
  const esCita = servicio?.categoria === "estetica";
  const esHotel = servicio?.categoria === "hotel";
  const porHora = servicio?.unidad === "hora";
  const salidaReal = esHotel ? salida : entrada ? sumarDias(entrada, 1) : null;
  const limpiar = () => {
    setCupo(null);
    setHorasDia(null);
    setHora(null);
  };

  const verLugar = () =>
    consulta.ejecutar(async () => {
      if (!servicio || !entrada) return { error: "Escoge el servicio y la fecha." };
      if (esCita) {
        const r = await llamar<{ datos?: Horas }>("horasClienteNuevo", [negocioId, servicio.id, entrada]);
        if (r.datos) setHorasDia(r.datos);
        return r;
      }
      const r = await llamar<{ datos?: Cupo }>("cupoClienteNuevo", [negocioId, servicio.id, entrada, salidaReal]);
      if (r.datos) setCupo(r.datos);
      return r;
    });

  const enviar = async () => {
    if (!mascota || !servicio) return;
    const r = await envio.ejecutar(() =>
      llamar<{ datos?: { id: string } }>("pedirClienteNuevo", [
        negocioId, mascota.id, servicio.id, esCita ? null : entrada, esCita ? null : salidaReal, porHora ? Number(horas) || null : null, esCita ? hora?.inicio ?? null : null,
        recoleccion ? { direccion: recoleccion.direccion, hora: recoleccion.hora } : null, true,
      ])
    );
    if (r?.datos) setEnviada(true);
  };

  if (d && enviada) {
    return (
      <Pantalla>
        <Vacio icono="listo" titulo="Listo, se lo mandamos" texto={`${d.negocio.nombre} lo revisa y te avisa aquí. Todavía no se cobra ni se aparta. Si no contesta en 3 días, la solicitud caduca y te avisamos.`} accion={<Boton titulo="Ver mis solicitudes" alTocar={() => router.replace("/visitas")} />} />
      </Pantalla>
    );
  }

  const elegido = esCita ? Boolean(hora) : Boolean(cupo && entrada && salidaReal && (!porHora || Number(horas) > 0));
  const listo = Boolean(mascota && servicio && elegido);

  if (d && revisando && mascota && servicio) {
    return (
      <Pantalla pie={<Boton titulo="Compartir y enviar" alTocar={enviar} cargando={envio.ocupado} />}>
        <Texto v="titulo">Antes de enviar</Texto>
        <Texto v="secundario">{d.negocio.nombre} recibe esto para decidir si te acepta. Nada más de tu cuenta ni de tus otras mascotas.</Texto>
        <Grupo titulo="De ti">
          <Fila icono="info" titulo={d.yo.nombre ?? "Sin nombre"} detalle="Tu nombre" />
          <Fila icono="chat" titulo={d.yo.telefono ?? "Sin teléfono"} detalle="Tu teléfono" ultima />
        </Grupo>
        <Grupo titulo={`De ${mascota.nombre}`}>
          <Fila icono="mascota" titulo={mascota.nombre} detalle={[mascota.especie, mascota.raza].filter(Boolean).join(" · ")} />
          <Fila icono="calendario" titulo={mascota.fechaNacimiento ? fechaCorta(mascota.fechaNacimiento) : "Sin fecha"} detalle="Fecha de nacimiento" />
          <Fila icono="galeria" titulo={mascota.fotoUrl ? "Su foto" : "Sin foto"} detalle="Foto" />
          <Fila icono="vacuna" titulo={mascota.vacunas === 1 ? "1 registro" : `${mascota.vacunas} registros`} detalle="Su cartilla" ultima />
        </Grupo>
        {mascota.fotoUrl ? <Image source={{ uri: mascota.fotoUrl }} style={{ width: 96, height: 96, borderRadius: radio.tarjeta }} accessibilityLabel={`Foto de ${mascota.nombre}`} /> : null}
        <Grupo titulo="Lo que pides">
          <Fila icono={esCita ? "estetica" : "hotel"} titulo={servicio.nombre} detalle={esCita ? `${entrada ? fechaCorta(entrada) : ""} · ${hora?.hora ?? ""}` : `${entrada ? fechaCorta(entrada) : ""}${esHotel && salida ? ` al ${fechaCorta(salida)}` : ""}`} ultima={!recoleccion} />
          {recoleccion ? <Fila icono="pin" titulo="Con recolección" detalle={recoleccion.direccion} ultima /> : null}
        </Grupo>
        <Mensaje tono="info" texto="Sin cobro ni cupo hasta que el negocio acepte. Si acepta, te crea un expediente con estos datos y queda el contrato por firmar." />
        <Mensaje texto={envio.error} />
        <Boton variante="texto" titulo="Volver a cambiar algo" alTocar={() => setRevisando(false)} />
      </Pantalla>
    );
  }

  return (
    <Pantalla cargando={p.cargando} error={p.error} alReintentar={p.refrescar} pie={d?.negocio.acepta && servicio && mascota ? (listo ? <Boton titulo="Continuar" alTocar={() => setRevisando(true)} deshabilitado={recoPendiente} /> : !esCita ? <Boton titulo="Ver si hay lugar" alTocar={verLugar} cargando={consulta.ocupado} deshabilitado={!entrada || !salidaReal} /> : undefined) : undefined}>
      {d ? (
        !d.negocio.acepta ? (
          <Vacio icono="chat" titulo="Este negocio recibe clientes nuevos por WhatsApp" texto="Escríbele y te ayudan a darte de alta." accion={d.negocio.whatsapp ? <Boton icono="chat" titulo="Escribirle por WhatsApp" alTocar={() => Linking.openURL(`https://wa.me/${d.negocio.whatsapp}?text=${encodeURIComponent("Hola, los encontré en la app PeluDesk. Quiero ser cliente.")}`)} /> : undefined} />
        ) : d.mascotas.length === 0 ? (
          <Vacio icono="mascota" titulo="Primero agrega a tu mascota" texto={`Para pedir lugar en ${d.negocio.nombre} necesitas a tu mascota en la app. Si ya es cliente de ahí, resérvale desde su ficha.`} accion={<Boton titulo="Agregar mascota" alTocar={() => router.push("/mascotas/nueva")} />} />
        ) : (
          <>
            <Texto v="encabezado">{d.negocio.nombre}</Texto>
            <Mensaje tono="info" texto="Todavía no eres cliente de aquí. Pide tu lugar: el negocio lo revisa y te contesta." />
            {d.mascotas.length > 1 ? (
              <View style={{ gap: 8 }}>
                <Texto v="encabezado">¿Para quién?</Texto>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {d.mascotas.map((m) => <Chip key={m.id} texto={m.nombre} activo={mascota?.id === m.id} alTocar={() => setMascotaId(m.id)} />)}
                </View>
              </View>
            ) : null}
            <Grupo titulo="¿Qué servicio?">
              {servicios.map((s, i) => (
                <Fila key={s.id} icono={s.categoria === "estetica" ? "estetica" : s.categoria === "hotel" ? "hotel" : "guarderia"} titulo={s.nombre} detalle={s.categoria === "hotel" ? "Por noche" : s.unidad === "hora" ? "Por hora" : s.duracionMinutos ? `${s.duracionMinutos} min` : "Por día"} alTocar={() => { setServicio(s); limpiar(); if (!entrada) setEntrada(d.negocio.hoy); }} derecha={servicio?.id === s.id ? <Texto v="cuerpoFuerte" color={c.primario}>✓</Texto> : undefined} ultima={i === servicios.length - 1} />
              ))}
            </Grupo>
            {servicio ? (
              <View style={{ gap: 14 }}>
                <CampoFecha etiqueta={esHotel ? "Llega" : "Día"} valor={entrada} alCambiar={(v) => { setEntrada(v); limpiar(); if (esHotel && v && (!salida || salida <= v)) setSalida(sumarDias(v, 1)); }} minimo={d.negocio.hoy} />
                {esHotel ? <CampoFecha etiqueta="Sale" valor={salida} alCambiar={(v) => { setSalida(v); limpiar(); }} minimo={entrada ? sumarDias(entrada, 1) : d.negocio.hoy} /> : null}
                {porHora ? <Campo etiqueta="¿Cuántas horas?" value={horas} onChangeText={(t) => { setHoras(t); limpiar(); }} keyboardType="number-pad" placeholder="4" /> : null}
                {esCita && !horasDia ? <Boton variante="secundario" titulo="Ver horas libres" alTocar={verLugar} cargando={consulta.ocupado} deshabilitado={!entrada} /> : null}
              </View>
            ) : null}
            {cupo ? (
              <Grupo titulo={cupo.hayCupo ? "Hay lugar" : "Esos días están llenos"} pie={cupo.hayCupo ? undefined : "Puedes pedirlo igual: el negocio te dice si se puede hacer espacio."}>
                {cupo.dias.map((x, i) => (
                  <Fila key={x.fecha} titulo={fechaCorta(x.fecha)} derecha={<Insignia texto={!x.abre ? "Cerrado" : x.disponible <= 0 ? "Lleno" : "Hay lugar"} tono={!x.abre || x.disponible <= 0 ? "peligro" : "exito"} />} ultima={i === cupo.dias.length - 1} />
                ))}
              </Grupo>
            ) : null}
            {horasDia ? (
              (horasDia.horas ?? []).length === 0 ? <Mensaje tono="aviso" texto="Ese día no hay horas libres. Escoge otro." /> : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {horasDia.horas!.map((h) => {
                    const activo = hora?.inicio === h.inicio;
                    return (
                      <Pressable key={h.inicio} onPress={() => { Haptics.selectionAsync().catch(() => {}); setHora(h); }} accessibilityRole="button" accessibilityState={{ selected: activo }} style={{ width: "31%", height: 48, borderRadius: radio.control, alignItems: "center", justifyContent: "center", backgroundColor: activo ? c.primario : c.superficie, borderWidth: 1, borderColor: activo ? c.primario : c.linea }}>
                        <Text style={{ fontFamily: fuentes.semi, fontSize: 16, color: activo ? c.sobrePrimario : c.texto }}>{h.hora}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )
            ) : null}
            {servicio && d.negocio.recoleccion ? <RecoleccionPedir negocioId={negocioId} clienteNuevo alCambiar={setRecoleccion} alPendiente={setRecoPendiente} /> : null}
            <Mensaje texto={consulta.error} />
          </>
        )
      ) : null}
    </Pantalla>
  );
}
