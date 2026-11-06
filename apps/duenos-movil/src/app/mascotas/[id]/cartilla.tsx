import { useState } from "react";
import { Alert, Switch, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { llamar } from "@/lib/api";
import { usePantalla, useAccion } from "@/lib/datos";
import { enCuanto, fechaCorta, hoyLocal } from "@/lib/formato";
import { Pantalla } from "@/componentes/pantalla";
import { Boton, BotonIcono, Campo, Fila, Grupo, Insignia, Mensaje, Segmentos, Vacio } from "@/componentes/ui";
import { CampoFechaRuedas, sumarMesesIso } from "@/componentes/rueda";
import { useColores } from "@/tema";

type Registro = { id: string; tipo: "vacuna" | "desparasitacion"; nombre: string; fechaAplicacion: string | null; proximaDosis: string | null; fuente: string; estado: string; lote: string | null; negocioQR: string | null };
type Datos = { mascota: { id: string; nombre: string; recordatoriosApagados: boolean }; registros: Registro[]; fotosRevisadas: number };

const diasA = (f: string | null) => (f ? Math.round((Date.parse(f) - Date.parse(hoyLocal())) / 86_400_000) : null);
const FUENTE: Record<string, string> = { foto: "De la foto", manual: "Capturada por ti", negocio: "De su negocio", qr: "Registrada con su QR" };

/** La cartilla: lo que le toca arriba, todo lo aplicado abajo por año, recordatorios y el PDF para la vet. */
export default function Cartilla() {
  const { id, capturar } = useLocalSearchParams<{ id: string; capturar?: string }>();
  const c = useColores();
  const p = usePantalla<Datos>("cartilla", [id]);
  const [mano, setMano] = useState(capturar === "1");
  const [tipo, setTipo] = useState<"vacuna" | "desparasitacion">("vacuna");
  const [nombre, setNombre] = useState("");
  const [aplicada, setAplicada] = useState<string | null>(null);
  const [proxima, setProxima] = useState<string | null>(null);
  const [proximaAMano, setProximaAMano] = useState(false);
  // La próxima dosis se propone sola según lo que suele durar: vacunas un año, desparasitación tres meses. Se puede cambiar.
  const proponer = (t: "vacuna" | "desparasitacion", f: string | null) => {
    if (!proximaAMano) setProxima(f ? sumarMesesIso(f, t === "vacuna" ? 12 : 3) : null);
  };
  const agregar = useAccion();
  const pdf = useAccion();
  const ajuste = useAccion();

  const guardar = async () => {
    const r = await agregar.ejecutar(() => llamar("agregarRegistro", [id, { tipo, nombre, fecha_aplicacion: aplicada, proxima_dosis: proxima }]));
    if (r && !r.error) {
      setMano(false);
      setNombre("");
      setAplicada(null);
      setProxima(null);
      setProximaAMano(false);
      p.recargar();
    }
  };

  const compartirPdf = () =>
    pdf.ejecutar(async () => {
      const r = await llamar<{ nombre?: string; base64?: string }>("cartillaPdf", [id]);
      if (r.base64 && r.nombre) {
        const archivo = new File(Paths.cache, r.nombre);
        if (archivo.exists) archivo.delete();
        archivo.create();
        archivo.write(r.base64, { encoding: "base64" });
        await Sharing.shareAsync(archivo.uri, { mimeType: "application/pdf", dialogTitle: "Compartir su cartilla" });
      }
      return r;
    });

  const quitar = (r: Registro) =>
    Alert.alert(`¿Quitar ${r.nombre}?`, "Se quita de su cartilla y de sus recordatorios.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: async () => { const x = await ajuste.ejecutar(() => llamar("quitarRegistro", [id, r.id])); if (x && !x.error) p.recargar(); } },
    ]);

  const d = p.datos;
  const toca = (d?.registros ?? []).filter((r) => r.proximaDosis && (r.estado === "por_vencer" || r.estado === "vencida"));
  const porAnio = new Map<string, Registro[]>();
  for (const r of d?.registros ?? []) {
    const anio = r.fechaAplicacion?.slice(0, 4) ?? "Sin fecha";
    porAnio.set(anio, [...(porAnio.get(anio) ?? []), r]);
  }

  return (
    <>
      <Stack.Screen options={{ headerRight: () => <BotonIcono icono="compartir" etiqueta="Compartir en PDF" tamano={36} alTocar={compartirPdf} /> }} />
      <Pantalla cargando={p.cargando} error={p.error ?? pdf.error} refrescando={p.refrescando} alRefrescar={p.refrescar} alReintentar={p.refrescar}>
        {d ? (
          <>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Boton titulo="Leer con la cámara" icono="camara" alTocar={() => router.push(`/mascotas/${id}/leer`)} style={{ flex: 1 }} />
              <Boton titulo="A mano" icono="editar" variante="secundario" alTocar={() => setMano((x) => !x)} ancho={false} />
            </View>

            {mano ? (
              <Grupo titulo="Agregar a mano" style={{ gap: 12 }}>
                <View style={{ padding: 16, gap: 14 }}>
                  <Segmentos valor={tipo} alCambiar={(t) => { setTipo(t); proponer(t, aplicada); }} opciones={[{ valor: "vacuna", texto: "Vacuna" }, { valor: "desparasitacion", texto: "Desparasitación" }]} />
                  <Campo etiqueta={tipo === "vacuna" ? "¿Qué vacuna?" : "¿Qué producto?"} value={nombre} onChangeText={setNombre} placeholder={tipo === "vacuna" ? "Rabia, séxtuple…" : "Bravecto, Drontal…"} />
                  <CampoFechaRuedas conAtajos etiqueta="Cuándo se la pusieron" valor={aplicada} alCambiar={(v) => { setAplicada(v); proponer(tipo, v); }} maximo={hoyLocal()} />
                  <CampoFechaRuedas etiqueta="Próxima dosis" valor={proxima} alCambiar={(v) => { setProxima(v); setProximaAMano(true); }} minimo={aplicada ?? hoyLocal()} ayuda="La proponemos sola; cámbiala si tu veterinario dijo otra. Te avisamos 7 días antes y el mismo día." />
                  <Mensaje texto={agregar.error} />
                  <Boton titulo="Guardar" alTocar={guardar} cargando={agregar.ocupado} deshabilitado={!nombre.trim()} />
                </View>
              </Grupo>
            ) : null}

            {d.registros.length === 0 ? (
              <Vacio icono="vacuna" titulo="Su cartilla está vacía" texto={`Tómale foto a la cartilla de papel de ${d.mascota.nombre} y la leemos por ti.`} />
            ) : null}

            {toca.length ? (
              <Grupo titulo="Le toca pronto">
                {toca.map((r, i) => {
                  const dias = diasA(r.proximaDosis);
                  return <Fila key={r.id} icono="vacuna" colorIcono={r.estado === "vencida" ? c.peligro : c.aviso} titulo={r.nombre} detalle={`Próxima: ${fechaCorta(r.proximaDosis)}`} derecha={<Insignia texto={enCuanto(dias)} tono={r.estado === "vencida" ? "peligro" : "aviso"} />} ultima={i === toca.length - 1} alTocar={() => router.push(`/mascotas/${id}/cita`)} />;
                })}
              </Grupo>
            ) : null}

            {[...porAnio.entries()].map(([anio, regs]) => (
              <Grupo key={anio} titulo={anio}>
                {regs.map((r, i) => (
                  <Fila
                    key={r.id}
                    icono={r.tipo === "vacuna" ? "vacuna" : "medicina"}
                    colorIcono={r.tipo === "vacuna" ? c.primario : c.exito}
                    titulo={r.nombre}
                    detalle={[r.fechaAplicacion ? fechaCorta(r.fechaAplicacion) : null, r.proximaDosis ? `próxima ${fechaCorta(r.proximaDosis)}` : null, r.negocioQR ?? FUENTE[r.fuente]].filter(Boolean).join(" · ")}
                    alTocar={r.fuente === "foto" || r.fuente === "manual" ? () => quitar(r) : undefined}
                    derecha={r.fuente === "foto" || r.fuente === "manual" ? undefined : <View />}
                    ultima={i === regs.length - 1}
                  />
                ))}
              </Grupo>
            ))}

            <Grupo pie="Te avisamos por notificación y por WhatsApp 7 días antes de cada dosis y el mismo día.">
              <Fila
                icono="aviso"
                titulo="Recordatorios"
                derecha={
                  <Switch
                    value={!d.mascota.recordatoriosApagados}
                    disabled={ajuste.ocupado}
                    trackColor={{ true: c.primario, false: c.linea }}
                    accessibilityLabel="Recordatorios de su cartilla"
                    onValueChange={async (v) => { const r = await ajuste.ejecutar(() => llamar("recordatoriosDeMascota", [id, !v])); if (r && !r.error) p.recargar(); }}
                  />
                }
                ultima
              />
            </Grupo>
            <Mensaje texto={ajuste.error} />
          </>
        ) : null}
      </Pantalla>
    </>
  );
}
