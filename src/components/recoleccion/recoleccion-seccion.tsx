"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Chip, type TonoChip } from "@/components/ui/chip";
import { Enlace } from "@/components/ui/enlace";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { dinero } from "@/lib/dinero";
import { formatearFechaCalendario } from "@/lib/formato";
import { cancelarRecoleccion, marcarRecoleccion } from "@/app/(staff)/recolecciones/actions";
import { ETIQUETA_PUNTO, etiquetaEstadoRecoleccion, horaCorta, linkComoLlegar, type Recoleccion } from "@/lib/recoleccion/tipos";

const TONO: Record<string, TonoChip> = { pendiente: "info", en_camino: "proceso", recogido: "exito", cancelada: "neutro" };

/**
 * La recolección de una reserva o una cita, en su detalle: dirección, desde dónde sale, hora, km y precio (el cargo ya
 * está en la cuenta), «Cómo llegar», y marcar en camino / recogido o cancelar con motivo (el cargo se cancela con ella).
 * Pinta lo que la acción devuelve (registro final) y refresca la página para la cuenta.
 */
export function RecoleccionSeccion({ inicial, puntoDireccion, puedeEditar }: { inicial: Recoleccion; puntoDireccion?: string | null; puedeEditar: boolean }) {
  const router = useRouter();
  const envio = useEspera();
  const [r, setR] = useState(inicial);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function marcar(estado: "en_camino" | "recogido" | "pendiente") {
    setError(null);
    setExito(null);
    const res = await envio.ejecutar(() => marcarRecoleccion(r.id, estado));
    if (res.error) return setError(res.error);
    if (res.recoleccion) setR(res.recoleccion);
    setExito(estado === "en_camino" ? "La camioneta va en camino." : estado === "recogido" ? "Recogido." : "Vuelve a pendiente.");
    router.refresh();
  }

  async function cancelar() {
    setError(null);
    const res = await envio.ejecutar(() => cancelarRecoleccion(r.id, motivo));
    if (res.error) return setError(res.error);
    if (res.recoleccion) setR(res.recoleccion);
    setCancelando(false);
    setMotivo("");
    setExito("Recolección cancelada; su cargo salió de la cuenta.");
    router.refresh();
  }

  const cancelada = r.estado === "cancelada";
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-tarjeta" data-recoleccion-seccion data-recoleccion-estado={r.estado}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Recolección a domicilio</h2>
        <Chip tono={TONO[r.estado] ?? "neutro"}>{etiquetaEstadoRecoleccion(r.estado)}</Chip>
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div><dt className="text-n-600">Dirección</dt><dd className="text-n-900">{r.direccion}</dd></div>
        <div><dt className="text-n-600">Sale desde</dt><dd className="text-n-900">{ETIQUETA_PUNTO[r.punto_partida]}{puntoDireccion ? ` · ${puntoDireccion}` : ""}</dd></div>
        <div><dt className="text-n-600">Cuándo</dt><dd className="text-n-900">{formatearFechaCalendario(r.fecha)}{r.hora_estimada ? ` · ${horaCorta(r.hora_estimada)}` : ""}</dd></div>
        <div><dt className="text-n-600">Cargo</dt><dd className="text-n-900">{r.km} km · {dinero(Number(r.precio))}{cancelada ? " (cancelado)" : " (en la cuenta)"}</dd></div>
        {r.notas && <div className="sm:col-span-2"><dt className="text-n-600">Notas</dt><dd className="text-n-900">{r.notas}</dd></div>}
        {cancelada && r.motivo_cancelacion && <div className="sm:col-span-2"><dt className="text-n-600">Motivo</dt><dd className="text-n-900">{r.motivo_cancelacion}</dd></div>}
      </dl>
      {!cancelada && (
        <div className="flex flex-wrap items-center gap-2">
          <Enlace href={linkComoLlegar({ direccion: r.direccion, lat: r.lat, lng: r.lng, punto_direccion: puntoDireccion })} target="_blank" rel="noopener noreferrer" data-sin-bloqueo>
            Cómo llegar ↗
          </Enlace>
          {puedeEditar && r.estado === "pendiente" && <Button type="button" tamano="compacto" cargando={envio.cargando} onClick={() => marcar("en_camino")}>Salir a recoger</Button>}
          {puedeEditar && r.estado === "en_camino" && <Button type="button" tamano="compacto" cargando={envio.cargando} onClick={() => marcar("recogido")}>Marcar recogido</Button>}
          {puedeEditar && r.estado === "en_camino" && <Button type="button" variante="secundario" tamano="compacto" cargando={envio.cargando} onClick={() => marcar("pendiente")}>Regresar a pendiente</Button>}
          {puedeEditar && !cancelando && <Button type="button" variante="peligro" tamano="compacto" onClick={() => setCancelando(true)}>Cancelar recolección</Button>}
        </div>
      )}
      {cancelando && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-white p-3" data-cancelar-recoleccion>
          <Field label="¿Por qué se cancela?" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. El cliente la trae él" />
          <AccionesFormulario error={error}>
            <Button type="button" variante="peligro" cargando={envio.cargando} disabled={motivo.trim().length < 3} onClick={cancelar}>Cancelar la recolección</Button>
            <Button type="button" variante="secundario" onClick={() => setCancelando(false)}>Dejarla</Button>
          </AccionesFormulario>
        </div>
      )}
      {!cancelando && (error || exito) && (
        <p role={error ? "alert" : "status"} className={`text-sm font-semibold ${error ? "text-coral-oscuro" : "text-menta-oscuro"}`}>{error ?? exito}</p>
      )}
    </section>
  );
}
