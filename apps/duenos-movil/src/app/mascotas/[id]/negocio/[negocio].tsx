import { useState } from "react";
import { Dimensions, Linking, Modal, Pressable, ScrollView, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { usePantalla } from "@/lib/datos";
import { fechaCorta } from "@/lib/formato";
import { Pantalla } from "@/componentes/pantalla";
import { Boton, BotonIcono, Fila, Grupo, Insignia, Texto, Vacio } from "@/componentes/ui";
import { useColores } from "@/tema";

type Datos = {
  mascota: { id: string; nombre: string };
  negocio: { id: string; nombre: string; whatsapp: string | null };
  fotos: { id: string; fecha: string; nota: string | null; fotoUrl: string }[];
  reportes: { id: string; fecha: string; contenido: { titulo?: string; subtitulo?: string; secciones?: { titulo?: string; texto?: string; respuestas?: string[] }[] }; tarjetaUrl: string | null }[];
  carnet: { vacunas: { biologico: string; fecha_aplicacion: string; proxima_dosis: string | null; estado: string }[]; desparasitaciones: { producto: string; fecha_aplicacion: string; proxima_dosis: string | null; estado: string }[] } | null;
  expediente: { consultas?: { fecha: string; motivo: string; diagnostico: string; indicaciones: string }[] } | null;
  recetas: { numero: number; fecha: string; estado: string; medico: string | null; lineas: { producto: string; dosis: string; frecuencia: string; duracion_dias: number }[] }[];
  resenas: { total: number; promedio: number | null };
  conEstetica: boolean;
  conEstancias: boolean;
};

const ANCHO = Dimensions.get("window").width;

/** La mascota en un negocio con PeluDesk: sus fotos del día en cuadrícula, reportes, carnet, consultas y recetas. */
export default function MascotaEnNegocio() {
  const { id, negocio } = useLocalSearchParams<{ id: string; negocio: string }>();
  const c = useColores();
  const p = usePantalla<Datos>("negocioDeMascota", [id, negocio]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const d = p.datos;
  const lado = (ANCHO - 32 - 8) / 3;
  const vacunas = d?.carnet?.vacunas ?? [];
  const despa = d?.carnet?.desparasitaciones ?? [];
  const consultas = d?.expediente?.consultas ?? [];
  const nada = d && !d.fotos.length && !d.reportes.length && !vacunas.length && !despa.length && !consultas.length && !d.recetas.length;

  return (
    <>
      <Stack.Screen options={{ title: d?.negocio.nombre ?? "" }} />
      <Pantalla cargando={p.cargando} error={p.error} refrescando={p.refrescando} alRefrescar={p.refrescar} alReintentar={p.refrescar}>
        {d ? (
          <>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {d.conEstetica ? <Boton style={{ flex: 1 }} icono="calendario" titulo="Pedir cita" alTocar={() => router.push(`/mascotas/${id}/cita`)} /> : null}
              {d.conEstancias ? <Boton style={{ flex: 1 }} variante={d.conEstetica ? "secundario" : "primario"} icono="hotel" titulo="Reservar" alTocar={() => router.push(`/mascotas/${id}/reservar`)} /> : null}
            </View>
            {d.negocio.whatsapp || d.resenas.total ? (
              <Grupo>
                {d.resenas.total ? <Fila icono="estrella" colorIcono="#E0A21A" titulo={`${d.resenas.promedio?.toFixed(1)} de 5`} detalle={`${d.resenas.total} ${d.resenas.total === 1 ? "opinión verificada" : "opiniones verificadas"}`} ultima={!d.negocio.whatsapp} /> : null}
                {d.negocio.whatsapp ? <Fila icono="chat" colorIcono="#1FA855" titulo="Escribirles por WhatsApp" alTocar={() => Linking.openURL(`https://wa.me/${d.negocio.whatsapp}`)} ultima /> : null}
              </Grupo>
            ) : null}

            {nada ? <Vacio icono="mascota" titulo="Todavía no hay nada aquí" texto={`Cuando ${d.negocio.nombre} suba fotos, reportes o su carnet, aparecen aquí.`} /> : null}

            {d.fotos.length ? (
              <View style={{ gap: 8 }}>
                <Texto v="encabezado">Fotos del día</Texto>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                  {d.fotos.map((f) => (
                    <Pressable key={f.id} onPress={() => setAbierta(f.fotoUrl)} accessibilityLabel={`Foto del ${fechaCorta(f.fecha)}`}>
                      <Image source={{ uri: f.fotoUrl }} style={{ width: lado, height: lado, borderRadius: 6 }} contentFit="cover" transition={150} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {d.reportes.length ? (
              <Grupo titulo="Reportes del día">
                {d.reportes.map((r, i) => (
                  <Fila key={r.id} icono="recibo" titulo={r.contenido.titulo ?? "Reporte"} detalle={[fechaCorta(r.fecha), r.contenido.subtitulo].filter(Boolean).join(" · ")} alTocar={r.tarjetaUrl ? () => setAbierta(r.tarjetaUrl) : undefined} ultima={i === d.reportes.length - 1} />
                ))}
              </Grupo>
            ) : null}

            {vacunas.length || despa.length ? (
              <Grupo titulo="Su carnet en este negocio">
                {[...vacunas.map((v) => ({ n: v.biologico, f: v.fecha_aplicacion, p: v.proxima_dosis, e: v.estado, t: "vacuna" as const })), ...despa.map((v) => ({ n: v.producto, f: v.fecha_aplicacion, p: v.proxima_dosis, e: v.estado, t: "medicina" as const }))].map((x, i, arr) => (
                  <Fila key={`${x.n}${i}`} icono={x.t === "vacuna" ? "vacuna" : "medicina"} titulo={x.n} detalle={`${fechaCorta(x.f)}${x.p ? ` · próxima ${fechaCorta(x.p)}` : ""}`} derecha={<Insignia texto={x.e === "vencida" ? "Vencida" : x.e === "por_vencer" ? "Por vencer" : "Vigente"} tono={x.e === "vencida" ? "peligro" : x.e === "por_vencer" ? "aviso" : "exito"} />} ultima={i === arr.length - 1} />
                ))}
              </Grupo>
            ) : null}

            {consultas.length ? (
              <Grupo titulo="Consultas">
                {consultas.map((q, i) => <Fila key={i} icono="veterinaria" titulo={q.motivo || "Consulta"} detalle={[fechaCorta(q.fecha), q.diagnostico, q.indicaciones].filter(Boolean).join(" · ")} ultima={i === consultas.length - 1} />)}
              </Grupo>
            ) : null}

            {d.recetas.length ? (
              <Grupo titulo="Recetas">
                {d.recetas.map((r, i) => <Fila key={r.numero} icono="medicina" colorIcono={c.exito} titulo={r.lineas.map((l) => l.producto).join(", ") || `Receta ${r.numero}`} detalle={`${fechaCorta(r.fecha)}${r.medico ? ` · ${r.medico}` : ""}${r.estado === "anulada" ? " · anulada" : ""}`} ultima={i === d.recetas.length - 1} />)}
              </Grupo>
            ) : null}
          </>
        ) : null}
      </Pantalla>
      <Modal visible={Boolean(abierta)} transparent animationType="fade" onRequestClose={() => setAbierta(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center" }}>
          <ScrollView maximumZoomScale={3} contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
            {abierta ? <Image source={{ uri: abierta }} style={{ width: ANCHO, height: ANCHO * 1.25 }} contentFit="contain" /> : null}
          </ScrollView>
          <View style={{ position: "absolute", top: 56, right: 16 }}>
            <BotonIcono icono="cerrar" etiqueta="Cerrar" alTocar={() => setAbierta(null)} relleno />
          </View>
        </View>
      </Modal>
    </>
  );
}
