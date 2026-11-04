import { useState } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { llamar } from "@/lib/api";
import { usePantalla, useAccion } from "@/lib/datos";
import { diaDeInstante, fechaCorta, horaDeInstante } from "@/lib/formato";
import { Pantalla } from "@/componentes/pantalla";
import { Boton, Campo, Insignia, Mensaje, Segmentos, Texto, Vacio } from "@/componentes/ui";
import { Icono } from "@/componentes/icono";
import { radio, useColores } from "@/tema";

type Visita = { tipo: "estetica" | "estancia"; id: string; negocioId: string; negocioNombre: string; perroNombre: string; servicioNombre: string; inicio: string | null; fechaEntrada: string | null; fechaSalida: string | null; estado: string; zona: string; puedeConfirmar: boolean; puedeResenar: boolean; calificada: boolean };
const ESTADO: Record<string, { t: string; tono: "aviso" | "exito" | "primario" | "neutro" | "peligro" }> = {
  reservada: { t: "Por confirmar", tono: "aviso" }, confirmada: { t: "Confirmada", tono: "exito" }, en_curso: { t: "En curso", tono: "primario" }, finalizada: { t: "Terminada", tono: "neutro" }, cancelada: { t: "Cancelada", tono: "peligro" },
};

/** Lo que viene y lo que ya fue: confirmar en un toque y, al terminar, opinar con estrellas (una vez por visita). */
export default function Visitas() {
  const p = usePantalla<{ visitas: Visita[] }>("visitas");
  const [vista, setVista] = useState<"proximas" | "pasadas">("proximas");
  const lista = (p.datos?.visitas ?? []).filter((v) => (vista === "proximas" ? ["reservada", "confirmada", "en_curso"].includes(v.estado) : v.estado === "finalizada"));
  const ordenada = vista === "proximas" ? [...lista].reverse() : lista.slice(0, 30);
  return (
    <Pantalla cargando={p.cargando} error={p.error} refrescando={p.refrescando} alRefrescar={p.refrescar} alReintentar={p.refrescar}>
      <Segmentos valor={vista} alCambiar={setVista} opciones={[{ valor: "proximas", texto: "Próximas" }, { valor: "pasadas", texto: "Pasadas" }]} />
      {p.datos && ordenada.length === 0 ? <Vacio icono="calendario" titulo={vista === "proximas" ? "Nada agendado" : "Sin visitas pasadas"} texto={vista === "proximas" ? "Pide una cita o reserva desde la ficha de tu mascota." : undefined} /> : null}
      {ordenada.map((v) => <TarjetaVisita key={v.id} v={v} alCambiar={p.recargar} />)}
    </Pantalla>
  );
}

function TarjetaVisita({ v, alCambiar }: { v: Visita; alCambiar: () => void }) {
  const c = useColores();
  const accion = useAccion();
  const [estrellas, setEstrellas] = useState(0);
  const [texto, setTexto] = useState("");
  const [opinando, setOpinando] = useState(false);
  const cuando = v.tipo === "estetica" && v.inicio ? `${diaDeInstante(v.inicio, v.zona)} · ${horaDeInstante(v.inicio, v.zona)}` : v.fechaEntrada ? (v.fechaSalida && v.fechaSalida !== v.fechaEntrada ? `${fechaCorta(v.fechaEntrada)} al ${fechaCorta(v.fechaSalida)}` : fechaCorta(v.fechaEntrada)) : "Sin fecha";
  const e = ESTADO[v.estado] ?? { t: v.estado, tono: "neutro" as const };
  return (
    <View style={{ backgroundColor: c.superficie, borderRadius: radio.tarjeta, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c.primarioSuave, alignItems: "center", justifyContent: "center" }}>
          <Icono nombre={v.tipo === "estetica" ? "estetica" : "hotel"} tamano={22} color={c.primario} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Texto v="cuerpoFuerte">{v.servicioNombre} · {v.perroNombre}</Texto>
          <Texto v="secundario">{v.negocioNombre}</Texto>
          <Texto v="secundario" color={c.texto}>{cuando}</Texto>
        </View>
        <Insignia texto={v.calificada ? "Ya opinaste" : e.t} tono={v.calificada ? "neutro" : e.tono} />
      </View>
      <Mensaje texto={accion.error} />
      {v.puedeConfirmar ? <Boton titulo="Confirmar que vamos" compacto alTocar={async () => { const r = await accion.ejecutar(() => llamar("confirmarVisita", [v.negocioId, v.tipo, v.id])); if (r && !r.error) alCambiar(); }} cargando={accion.ocupado} /> : null}
      {v.puedeResenar && !opinando ? <Boton titulo="¿Cómo te fue?" variante="secundario" compacto alTocar={() => setOpinando(true)} /> : null}
      {opinando ? (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 6, justifyContent: "center" }} accessibilityRole="adjustable" accessibilityLabel={`${estrellas} de 5 estrellas`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} hitSlop={6} onPress={() => { Haptics.selectionAsync().catch(() => {}); setEstrellas(n); }} accessibilityLabel={`${n} estrellas`}>
                <Icono nombre="estrella" tamano={34} color={n <= estrellas ? "#E0A21A" : c.linea} />
              </Pressable>
            ))}
          </View>
          <Campo etiqueta="En una línea (opcional)" value={texto} onChangeText={setTexto} maxLength={500} placeholder="La dejaron preciosa" />
          <Boton titulo="Mandar opinión" compacto deshabilitado={!estrellas} cargando={accion.ocupado} alTocar={async () => { const r = await accion.ejecutar(() => llamar("resenar", [v.negocioId, v.tipo, v.id, estrellas, texto])); if (r && !r.error) { setOpinando(false); alCambiar(); } }} />
        </View>
      ) : null}
    </View>
  );
}
