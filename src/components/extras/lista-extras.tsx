"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { normalizarTelefono } from "@/lib/telefono";
import { formatearFechaCalendario } from "@/lib/formato";
import { enlaceWhatsAppExtra, etiquetaEstadoExtra, mensajeTraslado, type ExtraFila } from "@/lib/extras/tipos";
import { avisoTrasladoEnviado, cancelarExtra, marcarExtraHecho, salirTraslado } from "@/app/(staff)/extras/actions";
import { dinero } from "@/lib/dinero";
import { Enlace } from "@/components/ui/enlace";

const ESTILO: Record<string, string> = {
  pendiente: "bg-ambar-suave text-ambar-oscuro",
  en_camino: "bg-morado-suave text-morado",
  hecho: "bg-menta-suave text-menta-oscuro",
  cancelado: "bg-n-100 text-n-500",
};


/**
 * Las tareas de servicios extra (paseo, baño de salida, traslado…) con lo que el
 * personal hace sobre cada una: marcarla hecha (el cargo entra a la cuenta), sacar
 * un traslado y avisar al dueño por WhatsApp, o cancelarla con motivo.
 */
export function ListaExtras({
  filas,
  negocio,
  puedeAgregar,
  conFecha = false,
  vacio = "Nada por ahora.",
}: {
  filas: ExtraFila[];
  negocio: string;
  puedeAgregar: boolean;
  conFecha?: boolean;
  vacio?: string;
}) {
  const router = useRouter();
  const accion = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  async function correr(fn: () => Promise<{ error: string | null; cubierto?: boolean }>, textoOk?: string) {
    setError(null);
    setAviso(null);
    const r = await accion.ejecutar(fn);
    if (r.error) {
      setError(r.error);
      return false;
    }
    if (r.cubierto) setAviso("Quedó cubierto con el paquete del perro: no se cobró.");
    else if (textoOk) setAviso(textoOk);
    router.refresh();
    return true;
  }

  function abrirWhatsApp(f: ExtraFila) {
    const tel = f.cliente_telefono ? normalizarTelefono(f.cliente_telefono) : null;
    if (!tel) {
      setError("Este cliente no tiene un teléfono válido para avisarle.");
      return;
    }
    const url = enlaceWhatsAppExtra(
      tel,
      mensajeTraslado({ dueno: f.cliente_nombre.split(" ")[0] ?? null, perro: f.perro_nombre, negocio, sentido: f.sentido, hora: f.hora })
    );
    window.open(url, "_blank", "noopener");
    void avisoTrasladoEnviado(f.id);
  }

  if (filas.length === 0) return <p className="text-sm text-n-500">{vacio}</p>;

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <Alert variante="error" titulo="No se pudo completar">
          {error}
        </Alert>
      )}
      {aviso && <Alert variante="exito" titulo="Listo">{aviso}</Alert>}
      <ul className="flex flex-col gap-2">
        {filas.map((f) => {
          const traslado = f.tipo === "traslado";
          const cerrada = f.estado === "hecho" || f.estado === "cancelado";
          return (
            <li key={f.id} data-extra-id={f.id} className={`rounded-lg border bg-white p-3 ${f.atrasada ? "border-coral" : "border-n-200"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-n-900">
                    {f.hora ? <span className="mr-2 tabular-nums">{f.hora.slice(0, 5)}</span> : null}
                    {f.extra_nombre}
                    {f.cantidad > 1 ? ` × ${f.cantidad}` : ""}
                    {f.zona_nombre ? ` · ${f.zona_nombre}` : ""}
                  </p>
                  <p className="text-sm text-n-600">
                    <Enlace href={`/perros/${f.perro_id}`}>
                      {f.perro_nombre}
                    </Enlace>{" "}
                    · {f.cliente_nombre}
                    {conFecha || f.atrasada ? ` · ${formatearFechaCalendario(f.fecha)}` : ""}
                  </p>
                  {traslado && (
                    <p className="text-sm text-n-700">
                      {f.sentido === "recoger" ? "Recoger en: " : "Entregar en: "}
                      {f.direccion ?? "—"}
                    </p>
                  )}
                  {f.notas && <p className="text-xs text-n-500">{f.notas}</p>}
                  {f.atrasada && <p className="text-xs font-semibold text-coral-oscuro">Quedó pendiente de un día anterior</p>}
                  {f.estado === "cancelado" && f.motivo_cancelacion && <p className="text-xs text-n-500">Cancelado: {f.motivo_cancelacion}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${ESTILO[f.estado] ?? ""}`}>
                    {etiquetaEstadoExtra(f.estado, f.tipo, f.sentido)}
                  </span>
                  <span className="text-sm tabular-nums text-n-700">
                    {f.cubierto_paquete ? "Paquete" : dinero(f.precio_unitario * f.cantidad)}
                  </span>
                </div>
              </div>

              {puedeAgregar && !cerrada && (
                <div className="mt-2 flex flex-wrap gap-2 border-t border-n-100 pt-2">
                  {traslado && f.estado === "pendiente" && (
                    <Button type="button" cargando={accion.cargando} onClick={() => correr(() => salirTraslado(f.id))}>
                      Salió el traslado
                    </Button>
                  )}
                  {traslado && f.estado === "en_camino" && (
                    <Button type="button" variante="secundario" onClick={() => abrirWhatsApp(f)}>
                      Avisar por WhatsApp{f.aviso_whatsapp_at ? " otra vez" : ""}
                    </Button>
                  )}
                  {(!traslado || f.estado === "en_camino") && (
                    <Button
                      type="button"
                      cargando={accion.cargando}
                      onClick={() => correr(() => marcarExtraHecho(f.id), "Listo: el cargo entró a la cuenta.")}
                    >
                      {traslado ? (f.sentido === "recoger" ? "Marcar recogido" : "Marcar entregado") : "Marcar hecho"}
                    </Button>
                  )}
                  <Button type="button" variante="secundario" onClick={() => setCancelando(cancelando === f.id ? null : f.id)}>
                    Cancelar
                  </Button>
                </div>
              )}
              {puedeAgregar && f.estado === "hecho" && (
                <div className="mt-2 flex flex-wrap gap-2 border-t border-n-100 pt-2">
                  <Button type="button" variante="secundario" onClick={() => setCancelando(cancelando === f.id ? null : f.id)}>
                    Cancelar cargo
                  </Button>
                </div>
              )}
              {cancelando === f.id && (
                <div className="mt-2 flex flex-col gap-2 border-t border-n-100 pt-2">
                  <Field label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ej. El dueño ya no lo quiso" />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variante="peligro"
                      cargando={accion.cargando}
                      onClick={async () => {
                        if (await correr(() => cancelarExtra(f.id, motivo), "Cancelado.")) {
                          setCancelando(null);
                          setMotivo("");
                        }
                      }}
                    >
                      Confirmar cancelación
                    </Button>
                    <Button type="button" variante="secundario" onClick={() => setCancelando(null)}>
                      No
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
