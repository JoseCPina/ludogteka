"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Enlace } from "@/components/ui/enlace";
import { Chip, type TonoChip } from "@/components/ui/chip";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { TablaResponsiva } from "@/components/ui/tabla-responsiva";
import { AbrirWhatsApp } from "@/components/ui/abrir-whatsapp";
import { dinero } from "@/lib/dinero";
import { formatearFechaCalendario } from "@/lib/formato";
import { cancelarRecoleccion, marcarRecoleccion } from "./actions";
import { ETIQUETA_PUNTO, etiquetaEstadoRecoleccion, horaCorta, linkComoLlegar, type RecoleccionDia } from "@/lib/recoleccion/tipos";

const TONO: Record<string, TonoChip> = { pendiente: "info", en_camino: "proceso", recogido: "exito", cancelada: "neutro" };

function Fila({ f, puedeEditar, onCambio }: { f: RecoleccionDia; puedeEditar: boolean; onCambio: (r: RecoleccionDia) => void }) {
  const router = useRouter();
  const envio = useEspera();
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const wa = f.cliente_telefono ? `https://wa.me/52${f.cliente_telefono.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(`Hola, somos del negocio: vamos en camino por ${f.perro_nombre}.`)}` : null;

  async function marcar(estado: "en_camino" | "recogido" | "pendiente") {
    setError(null);
    const r = await envio.ejecutar(() => marcarRecoleccion(f.id, estado));
    if (r.error) return setError(r.error);
    if (r.recoleccion) onCambio({ ...f, ...r.recoleccion });
    router.refresh();
  }
  async function cancelar() {
    setError(null);
    const r = await envio.ejecutar(() => cancelarRecoleccion(f.id, motivo));
    if (r.error) return setError(r.error);
    if (r.recoleccion) onCambio({ ...f, ...r.recoleccion });
    setCancelando(false);
    router.refresh();
  }
  const detalle = f.estancia_id ? `/reservas/${f.reserva_id}` : f.cita_id ? `/estetica/${f.cita_id}` : `/reservas/${f.reserva_id}`;
  return (
    <tr data-recoleccion-fila={f.id} data-recoleccion-estado={f.estado}>
      <td>
        <p className="font-semibold text-n-900">{horaCorta(f.hora_estimada) ?? "Sin hora"} · {f.perro_nombre}</p>
        <p className="text-sm text-n-600">{f.cliente_nombre}</p>
      </td>
      <td>
        <p className="text-n-900">{f.direccion}</p>
        <p className="text-sm text-n-600">{f.distancia_recta_km != null ? `${f.distancia_recta_km} km en línea recta · ` : ""}{f.km} km cobrados · {dinero(Number(f.precio))}</p>
        {f.notas && <p className="text-sm text-n-600">{f.notas}</p>}
      </td>
      <td><Chip tono={TONO[f.estado] ?? "neutro"}>{etiquetaEstadoRecoleccion(f.estado)}</Chip></td>
      <td>
        <div className="flex flex-wrap items-center gap-2">
          {f.estado !== "cancelada" && <Enlace href={linkComoLlegar(f)} target="_blank" rel="noopener noreferrer" className="text-sm" data-sin-bloqueo>Cómo llegar ↗</Enlace>}
          <Enlace href={detalle} className="text-sm">Ver {f.cita_id ? "cita" : "reserva"}</Enlace>
          {wa && f.estado === "en_camino" && <AbrirWhatsApp href={wa} texto="Avisar por WhatsApp" />}
          {puedeEditar && f.estado === "pendiente" && <Button type="button" tamano="compacto" cargando={envio.cargando} onClick={() => marcar("en_camino")}>Salir a recoger</Button>}
          {puedeEditar && f.estado === "en_camino" && <Button type="button" tamano="compacto" cargando={envio.cargando} onClick={() => marcar("recogido")}>Recogido</Button>}
          {puedeEditar && (f.estado === "pendiente" || f.estado === "en_camino") && !cancelando && (
            <Button type="button" variante="secundario" tamano="compacto" onClick={() => setCancelando(true)}>Cancelar recolección</Button>
          )}
        </div>
        {cancelando && (
          <div className="mt-2 flex flex-col gap-2">
            <Field label="¿Por qué se cancela?" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. El cliente la trae él" />
            <AccionesFormulario error={error}>
              <Button type="button" variante="peligro" tamano="compacto" cargando={envio.cargando} disabled={motivo.trim().length < 3} onClick={cancelar}>Cancelar la recolección</Button>
              <Button type="button" variante="secundario" tamano="compacto" onClick={() => setCancelando(false)}>Dejarla</Button>
            </AccionesFormulario>
          </div>
        )}
        {!cancelando && error && <p role="alert" className="mt-1 text-sm font-semibold text-coral-oscuro">{error}</p>}
      </td>
    </tr>
  );
}

export function ListaRecolecciones({ filas: iniciales, fecha, puedeEditar }: { filas: RecoleccionDia[]; fecha: string; puedeEditar: boolean }) {
  const [filas, setFilas] = useState(iniciales);
  const vivas = filas.filter((f) => f.estado !== "cancelada");
  const canceladas = filas.filter((f) => f.estado === "cancelada");
  const grupos = (["negocio", "base"] as const).map((p) => ({ punto: p, filas: vivas.filter((f) => f.punto_partida === p) })).filter((g) => g.filas.length > 0);
  const onCambio = (r: RecoleccionDia) => setFilas((prev) => prev.map((x) => (x.id === r.id ? r : x)));
  if (filas.length === 0) {
    return <p className="text-n-600" data-recolecciones-vacio>No hay recolecciones para el {formatearFechaCalendario(fecha)}. Se agregan desde la reserva o la cita con «Incluir recolección».</p>;
  }
  return (
    <div className="flex flex-col gap-6" data-lista-recolecciones>
      {grupos.map((g) => (
        <section key={g.punto} className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Salen desde {ETIQUETA_PUNTO[g.punto].toLowerCase()}{g.filas[0]?.punto_direccion ? ` · ${g.filas[0].punto_direccion}` : ""} <span className="font-normal text-n-600">({g.filas.length})</span>
          </h2>
          <TablaResponsiva>
            <thead>
              <tr><th>Hora y mascota</th><th>Dirección</th><th>Estado</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {g.filas.map((f) => <Fila key={f.id} f={f} puedeEditar={puedeEditar} onCambio={onCambio} />)}
            </tbody>
          </TablaResponsiva>
        </section>
      ))}
      {canceladas.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-n-600">Canceladas ({canceladas.length})</h2>
          <ul className="divide-y divide-border text-sm">
            {canceladas.map((f) => (
              <li key={f.id} className="py-2 text-n-600">{horaCorta(f.hora_estimada) ?? "Sin hora"} · {f.perro_nombre} ({f.cliente_nombre}) · {f.direccion}{f.motivo_cancelacion ? ` · ${f.motivo_cancelacion}` : ""}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
