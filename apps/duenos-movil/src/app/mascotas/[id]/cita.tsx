import { useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { llamar } from "@/lib/api";
import { usePantalla, useAccion } from "@/lib/datos";
import { pesos, sumarDias } from "@/lib/formato";
import { Pantalla } from "@/componentes/pantalla";
import { Boton, Chip, Fila, Grupo, Mensaje, Texto, Vacio } from "@/componentes/ui";
import { fuentes, radio, useColores } from "@/tema";

type Servicio = { id: string; nombre: string; duracionMinutos: number | null };
type Negocio = { id: string; nombre: string; zona: string; hoy: string; servicios: Servicio[] };
type Datos = { mascota: { id: string; nombre: string; sexo: string | null }; enLinea: Negocio[]; porWhatsApp: { nombre: string; wa: string | null }[]; toca: { nombre: string; proximaDosis: string }[] };
type Horas = { abre: boolean; horas: { inicio: string; hora: string }[] };

const DIAS = 14;
const diaSemana = (f: string) => new Intl.DateTimeFormat("es-MX", { weekday: "short", timeZone: "UTC" }).format(Date.parse(f)).replace(".", "");
const diaMes = (f: string) => Number(f.slice(8, 10));

/**
 * Pedir cita con hora real (referencia app-reservar-fecha-cupo: Fresha, días como tira y horas grandes). Servicio →
 * día → hora libre → «Pedir la cita». La base pone el precio y quién atiende.
 */
export default function Cita() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColores();
  const p = usePantalla<Datos>("cita", [id]);
  const [negocioId, setNegocioId] = useState<string | null>(null);
  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [horas, setHoras] = useState<Horas | null>(null);
  const [hora, setHora] = useState<{ inicio: string; hora: string } | null>(null);
  const [hecha, setHecha] = useState<{ atiende: string | null; total: number | null } | null>(null);
  const cargaHoras = useAccion();
  const pedir = useAccion();

  const d = p.datos;
  const negocio = d?.enLinea.find((n) => n.id === negocioId) ?? d?.enLinea[0] ?? null;

  const verHoras = (n: Negocio | null, s: Servicio | null, f: string | null) => {
    setHora(null);
    setHoras(null);
    if (!n || !s || !f) return;
    cargaHoras.ejecutar(async () => {
      const r = await llamar<{ datos?: Horas }>("horas", [n.id, s.id, f]);
      if (r.datos) setHoras(r.datos);
      return r;
    });
  };

  const confirmar = async () => {
    if (!negocio || !servicio || !hora) return;
    const r = await pedir.ejecutar(() => llamar<{ datos?: { atiende?: string | null; precio?: number | null; total_cuenta?: number | null } }>("pedirCita", [negocio.id, id, servicio.id, hora.inicio]));
    if (r?.datos) setHecha({ atiende: r.datos.atiende ?? null, total: r.datos.total_cuenta != null ? Number(r.datos.total_cuenta) : r.datos.precio != null ? Number(r.datos.precio) : null });
    else if (r?.error && /ocup/i.test(r.error)) verHoras(negocio, servicio, dia); // la hora se ocupó: se vuelve a leer el día
  };

  if (hecha && negocio && servicio && hora && dia) {
    return (
      <Pantalla>
        <Vacio icono="listo" titulo="¡Cita pedida!" texto={`${servicio.nombre} para ${d?.mascota.nombre} en ${negocio.nombre}, el ${diaSemana(dia)} ${diaMes(dia)} a las ${hora.hora}.${hecha.atiende ? ` La atiende ${hecha.atiende}.` : ""}${hecha.total != null ? ` Total: ${pesos(hecha.total)}.` : ""}`} accion={<Boton titulo="Ver mis visitas" alTocar={() => router.replace("/visitas")} />} />
      </Pantalla>
    );
  }

  return (
    <Pantalla cargando={p.cargando} error={p.error} alReintentar={p.refrescar} pie={negocio && hora ? <Boton titulo={`Pedir la cita · ${hora.hora}`} alTocar={confirmar} cargando={pedir.ocupado} /> : undefined}>
      {d ? (
        <>
          {d.toca.length ? <Mensaje tono="info" texto={`Le toca: ${d.toca.map((t) => t.nombre).join(", ")}.`} /> : null}
          {d.enLinea.length === 0 ? (
            <Vacio icono="calendario" titulo="Pide su cita por WhatsApp" texto={`Ninguno de los negocios de ${d.mascota.nombre} agenda en línea todavía. Escríbeles directo:`} />
          ) : (
            <>
              {d.enLinea.length > 1 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {d.enLinea.map((n) => <Chip key={n.id} texto={n.nombre} activo={negocio?.id === n.id} alTocar={() => { setNegocioId(n.id); setServicio(null); setDia(null); }} />)}
                </View>
              ) : (
                <Texto v="encabezado">{negocio?.nombre}</Texto>
              )}

              <Grupo titulo="¿Qué servicio?">
                {negocio?.servicios.map((s, i) => (
                  <Fila key={s.id} icono="estetica" titulo={s.nombre} detalle={s.duracionMinutos ? `${s.duracionMinutos} min` : null} alTocar={() => { setServicio(s); const f = dia ?? negocio.hoy; setDia(f); verHoras(negocio, s, f); }} derecha={servicio?.id === s.id ? <Texto v="cuerpoFuerte" color={c.primario}>✓</Texto> : undefined} ultima={i === negocio.servicios.length - 1} />
                ))}
              </Grupo>

              {servicio && negocio ? (
                <View style={{ gap: 10 }}>
                  <Texto v="encabezado">¿Qué día?</Texto>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {Array.from({ length: DIAS }, (_, i) => sumarDias(negocio.hoy, i)).map((f) => {
                      const activo = f === dia;
                      return (
                        <Pressable key={f} onPress={() => { Haptics.selectionAsync().catch(() => {}); setDia(f); verHoras(negocio, servicio, f); }} accessibilityRole="button" accessibilityState={{ selected: activo }} style={{ width: 58, paddingVertical: 10, borderRadius: radio.control, alignItems: "center", backgroundColor: activo ? c.primario : c.superficie, gap: 2 }}>
                          <Text style={{ fontFamily: fuentes.media, fontSize: 12, color: activo ? c.sobrePrimario : c.textoSuave }}>{diaSemana(f)}</Text>
                          <Text style={{ fontFamily: fuentes.semi, fontSize: 20, color: activo ? c.sobrePrimario : c.texto }}>{diaMes(f)}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              {servicio && dia ? (
                <View style={{ gap: 10 }}>
                  <Texto v="encabezado">¿A qué hora?</Texto>
                  {cargaHoras.ocupado ? <Texto v="secundario">Buscando horas libres…</Texto> : horas && !horas.abre ? <Mensaje tono="aviso" texto="Ese día no abre. Escoge otro." /> : horas && horas.horas.length === 0 ? <Mensaje tono="aviso" texto="Ese día ya está lleno. Escoge otro." /> : null}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {horas?.horas.map((h) => {
                      const activo = hora?.inicio === h.inicio;
                      return (
                        <Pressable key={h.inicio} onPress={() => { Haptics.selectionAsync().catch(() => {}); setHora(h); }} style={{ width: "31%", height: 48, borderRadius: radio.control, alignItems: "center", justifyContent: "center", backgroundColor: activo ? c.primario : c.superficie, borderWidth: 1, borderColor: activo ? c.primario : c.linea }}>
                          <Text style={{ fontFamily: fuentes.semi, fontSize: 16, color: activo ? c.sobrePrimario : c.texto }}>{h.hora}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Mensaje texto={cargaHoras.error ?? pedir.error} />
                </View>
              ) : null}
            </>
          )}

          {d.porWhatsApp.filter((w) => w.wa).length ? (
            <Grupo titulo="O por WhatsApp">
              {d.porWhatsApp.filter((w) => w.wa).map((w, i, arr) => (
                <Fila key={`${w.nombre}${i}`} icono="chat" colorIcono="#1FA855" titulo={w.nombre} alTocar={() => Linking.openURL(`https://wa.me/${w.wa}?text=${encodeURIComponent(`Hola, les escribo por ${d.mascota.nombre}. Quiero agendar una cita. ¿Qué día tienen lugar?`)}`)} ultima={i === arr.length - 1} />
              ))}
            </Grupo>
          ) : null}
        </>
      ) : null}
    </Pantalla>
  );
}
