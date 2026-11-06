import { Pressable, ScrollView, Text, View } from "react-native";
import { router, Stack } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { usePantalla } from "@/lib/datos";
import { diaDeInstante, enCuanto, horaDeInstante, pesos } from "@/lib/formato";
import { Pantalla } from "@/componentes/pantalla";
import { AvatarMascota, BotonIcono, Fila, Grupo, Insignia, Texto, Vacio, Boton, sombra } from "@/componentes/ui";
import { Icono } from "@/componentes/icono";
import { fuentes, radio, useColores } from "@/tema";
import { GuiaSeccion } from "@/componentes/onboarding";

type Mascota = { id: string; nombre: string; especieTexto: string; edad: string | null; razaTexto: string | null; fotoUrl: string | null; fallecido: boolean; perdidaAt: string | null; encontradaAt: string | null; vinculos: { negocioNombre: string }[] };
type DatosInicio = {
  nombre: string | null;
  mascotas: Mascota[];
  proximos: { mascotaId: string; tipo: string; nombre: string; fecha: string; dias: number }[];
  pendientes: { contratos: number; porConfirmar: number; porPagar: number; cuentas: number };
  siguientes: { id: string; tipo: string; negocioNombre: string; perroNombre: string; servicioNombre: string; inicio: string | null; fechaEntrada: string | null; zona: string; estado: string }[];
};

/**
 * Inicio: las mascotas con su foto (carrusel, como Fi y Finch), lo que pide algo («Te toca»), lo que sigue de su
 * cartilla y sus próximas visitas. Tres cosas, no veinte (PLAN.md, principio 8).
 */
export default function Inicio() {
  const c = useColores();
  const p = usePantalla<DatosInicio>("inicio");
  const d = p.datos;
  const vivas = d?.mascotas.filter((m) => !m.fallecido) ?? [];
  const perdidas = vivas.filter((m) => m.perdidaAt && !m.encontradaAt);
  const pend = d?.pendientes;
  const nombreDe = (id: string) => d?.mascotas.find((m) => m.id === id);

  return (
    <>
      <GuiaSeccion seccion="mascotas" />
      <Stack.Screen options={{ headerRight: () => <BotonIcono icono="agregar" etiqueta="Agregar mascota" alTocar={() => router.push("/mascotas/nueva")} tamano={36} /> }} />
      <Pantalla cargando={p.cargando} error={p.error} refrescando={p.refrescando} alRefrescar={p.refrescar} alReintentar={p.refrescar} sinMargen style={{ paddingTop: 8 }}>
        {d ? (
          <>
            {d.nombre ? <Texto v="secundario" style={{ paddingHorizontal: 16 }}>Hola, {d.nombre}</Texto> : null}

            {perdidas.map((m) => (
              <Pressable key={m.id} onPress={() => router.push(`/mascotas/${m.id}/perdida`)} style={{ marginHorizontal: 16, borderRadius: radio.tarjeta, backgroundColor: c.peligro, padding: 16, flexDirection: "row", gap: 12, alignItems: "center" }}>
                <Icono nombre="alerta" tamano={24} color="#FFFFFF" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fuentes.semi, fontSize: 16, color: "#FFFFFF" }}>Estamos buscando a {m.nombre}</Text>
                  <Text style={{ fontFamily: fuentes.normal, fontSize: 14, color: "#FFFFFFDD" }}>Ve los mensajes de quien la vea y márcala encontrada.</Text>
                </View>
                <Icono nombre="siguiente" tamano={16} color="#FFFFFF" />
              </Pressable>
            ))}

            {vivas.length === 0 ? (
              <View style={{ paddingHorizontal: 16 }}>
                <Vacio icono="mascota" titulo="Agrega a tu primera mascota" texto="Con una foto de su cartilla te avisamos cuando le toque cada vacuna." accion={<Boton titulo="Agregar mascota" icono="agregar" alTocar={() => router.push("/mascotas/nueva")} />} />
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }} snapToInterval={172} decelerationRate="fast">
                {vivas.map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      router.push(`/mascotas/${m.id}`);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${m.nombre}, ${m.especieTexto}`}
                    style={({ pressed }) => [{ width: 160, height: 210, borderRadius: 22, overflow: "hidden", backgroundColor: c.superficieAlta }, sombra(c.sombra), pressed && { transform: [{ scale: 0.98 }] }]}
                  >
                    {m.fotoUrl ? <Image source={{ uri: m.fotoUrl }} style={{ position: "absolute", width: "100%", height: "100%" }} contentFit="cover" transition={200} /> : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><AvatarMascota nombre={m.nombre} tamano={88} /></View>}
                    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: m.fotoUrl ? "rgba(20,17,26,0.55)" : "transparent" }}>
                      <Text numberOfLines={1} style={{ fontFamily: fuentes.semi, fontSize: 17, color: m.fotoUrl ? "#FFFFFF" : c.texto }}>{m.nombre}</Text>
                      <Text numberOfLines={1} style={{ fontFamily: fuentes.normal, fontSize: 13, color: m.fotoUrl ? "#FFFFFFD9" : c.textoSuave }}>{[m.especieTexto, m.edad].filter(Boolean).join(" · ")}</Text>
                    </View>
                  </Pressable>
                ))}
                <Pressable onPress={() => router.push("/mascotas/nueva")} accessibilityRole="button" style={{ width: 160, height: 210, borderRadius: 22, borderWidth: 1.5, borderStyle: "dashed", borderColor: c.linea, alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.primarioSuave, alignItems: "center", justifyContent: "center" }}>
                    <Icono nombre="agregar" tamano={24} color={c.primario} />
                  </View>
                  <Texto v="cuerpoFuerte" color={c.primario}>Agregar</Texto>
                </Pressable>
              </ScrollView>
            )}

            {pend && (pend.contratos || pend.porConfirmar || pend.cuentas) ? (
              <Grupo titulo="Te toca" style={{ paddingHorizontal: 16 }}>
                {pend.contratos ? <Fila icono="firma" colorIcono={c.aviso} titulo={`${pend.contratos} ${pend.contratos === 1 ? "contrato por firmar" : "contratos por firmar"}`} detalle={pend.contratos === 1 ? "Fírmalo con el dedo en un minuto" : "Fírmalos con el dedo en un minuto"} alTocar={() => router.push("/contratos")} ultima={!pend.porConfirmar && !pend.cuentas} /> : null}
                {pend.porConfirmar ? <Fila icono="calendario" colorIcono={c.aviso} titulo={`${pend.porConfirmar} ${pend.porConfirmar === 1 ? "visita por confirmar" : "visitas por confirmar"}`} detalle="Confírmala con un toque" alTocar={() => router.push("/visitas")} ultima={!pend.cuentas} /> : null}
                {pend.cuentas ? <Fila icono="pago" colorIcono={c.peligro} titulo={`${pesos(pend.porPagar)} por pagar`} detalle={`${pend.cuentas} ${pend.cuentas === 1 ? "cuenta" : "cuentas"} con saldo`} alTocar={() => router.push("/pagos")} ultima /> : null}
              </Grupo>
            ) : null}

            {d.proximos.length ? (
              <Grupo titulo="Lo que sigue" style={{ paddingHorizontal: 16 }}>
                {d.proximos.map((x, i) => {
                  const m = nombreDe(x.mascotaId);
                  return (
                    <Fila
                      key={x.mascotaId}
                      imagen={m?.fotoUrl}
                      icono={m?.fotoUrl ? undefined : "vacuna"}
                      titulo={`${x.tipo === "vacuna" ? "Vacuna" : "Desparasitación"} · ${x.nombre}`}
                      detalle={m?.nombre}
                      derecha={<Insignia texto={enCuanto(x.dias)} tono={x.dias < 0 ? "peligro" : x.dias <= 30 ? "aviso" : "neutro"} />}
                      alTocar={() => router.push(`/mascotas/${x.mascotaId}/cartilla`)}
                      ultima={i === d.proximos.length - 1}
                    />
                  );
                })}
              </Grupo>
            ) : null}

            {d.siguientes.length ? (
              <Grupo titulo="Próximas visitas" style={{ paddingHorizontal: 16 }}>
                {d.siguientes.map((v, i) => (
                  <Fila
                    key={v.id}
                    icono={v.tipo === "estetica" ? "estetica" : "hotel"}
                    titulo={`${v.servicioNombre} · ${v.perroNombre}`}
                    detalle={`${v.negocioNombre} · ${v.inicio ? `${diaDeInstante(v.inicio, v.zona)}, ${horaDeInstante(v.inicio, v.zona)}` : (v.fechaEntrada ?? "")}`}
                    destacado={v.estado === "reservada" ? "Por confirmar" : undefined}
                    alTocar={() => router.push("/visitas")}
                    ultima={i === d.siguientes.length - 1}
                  />
                ))}
              </Grupo>
            ) : null}

            {d.mascotas.some((m) => m.vinculos.length) ? (
              <Grupo style={{ paddingHorizontal: 16 }}>
                <Fila icono="calendario" titulo="Mis visitas" alTocar={() => router.push("/visitas")} />
                <Fila icono="pase" titulo="Mis pases" alTocar={() => router.push("/pases")} ultima />
              </Grupo>
            ) : null}
          </>
        ) : null}
      </Pantalla>
    </>
  );
}
