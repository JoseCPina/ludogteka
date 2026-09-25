"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearFecha } from "@/lib/formato";
import { actualizarDireccionYCalcular, ajustarDistanciaManual } from "./distancia-actions";
import { useZonaNegocio } from "@/components/zona-negocio";

export function DistanciaSeccion({
  clienteId,
  direccionInicial,
  distanciaKmInicial,
  calculadaAtInicial,
  ajustadaManualmenteInicial,
}: {
  clienteId: string;
  direccionInicial: string | null;
  distanciaKmInicial: number | null;
  calculadaAtInicial: string | null;
  ajustadaManualmenteInicial: boolean;
}) {
  const zona = useZonaNegocio();
  const router = useRouter();
  const [direccion, setDireccion] = useState(direccionInicial ?? "");
  const [distanciaKm, setDistanciaKm] = useState(distanciaKmInicial);
  const [calculadaAt, setCalculadaAt] = useState(calculadaAtInicial);
  const [ajustadaManualmente, setAjustadaManualmente] = useState(ajustadaManualmenteInicial);
  const [simulado, setSimulado] = useState(false);

  const guardando = useEspera();
  const [error, setError] = useState<string | null>(null);

  const [ajustando, setAjustando] = useState(false);
  const [kmManual, setKmManual] = useState("");
  const guardandoAjuste = useEspera();

  // try/finally, no solo await: si la acción lanza (red caída, servidor
  // reiniciándose, un error inesperado del servidor), sin el finally el
  // `` nunca corre y el botón se queda en "Calculando…"
  // para siempre, sin decir nada. Es exactamente el bug que se reportó
  // desde la ficha del cliente.
  async function guardarDireccion() {
    setError(null);
    setSimulado(false);
    try {
      const res = await guardando.ejecutar(() => actualizarDireccionYCalcular(clienteId, direccion));
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.distanciaKm !== undefined) {
        setDistanciaKm(res.distanciaKm);
        setCalculadaAt(new Date().toISOString());
        setAjustadaManualmente(false);
        setSimulado(res.simulado ?? false);
      }
      router.refresh();
    } catch {
      setError(
        "No pudimos calcular la distancia: se cortó la conexión con el servidor. Intenta de nuevo, o ajústala a mano aquí abajo."
      );
    } finally {
    }
  }

  async function guardarAjuste() {
    const km = Number(kmManual);
    setError(null);
    try {
      const res = await guardandoAjuste.ejecutar(() => ajustarDistanciaManual(clienteId, km));
      if (res.error) {
        setError(res.error);
        return;
      }
      setDistanciaKm(res.distanciaKm ?? km);
      setCalculadaAt(new Date().toISOString());
      setAjustadaManualmente(true);
      setAjustando(false);
      setKmManual("");
      router.refresh();
    } catch {
      setError("No pudimos guardar el ajuste: se cortó la conexión con el servidor. Intenta de nuevo.");
    } finally {
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-n-200 pt-6">
      <h2 className="text-lg font-bold text-n-900">Dirección y distancia de recolección</h2>

      {error && (
        <Alert variante="error" titulo="No se pudo completar">
          {error}
        </Alert>
      )}
      {simulado && (
        <Alert variante="advertencia" titulo="Distancia simulada">
          No hay llave de Google Maps configurada en este entorno — este número es de prueba, no real.
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field
            label="Dirección"
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            disabled={guardando.cargando}
            placeholder="Calle, número, colonia, ciudad"
          />
        </div>
        <Button type="button" disabled={guardando.cargando || !direccion.trim()} onClick={guardarDireccion}>
          {guardando.cargando ? "Calculando…" : "Guardar y calcular"}
        </Button>
      </div>

      <div className="rounded-md border-[1.5px] border-n-200 bg-n-50 p-3">
        {distanciaKm === null ? (
          <p className="text-n-600">Todavía no hay una distancia calculada para este cliente.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-n-900">{distanciaKm} km</span>
            {ajustadaManualmente && (
              <span className="rounded-full bg-amarillo-suave px-2 py-0.5 text-xs font-semibold text-amarillo-oscuro">
                Ajustada a mano
              </span>
            )}
            {calculadaAt && (
              <span className="text-sm text-n-600">· actualizada el {formatearFecha(calculadaAt, zona)}</span>
            )}
          </div>
        )}

        {ajustando ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field
                label="Distancia correcta (km)"
                type="number"
                step="0.1"
                min="0"
                value={kmManual}
                onChange={(e) => setKmManual(e.target.value)}
                disabled={guardandoAjuste.cargando}
                ayuda="Úsalo cuando Google geocodifique mal la colonia — queda registrado como ajuste manual."
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" disabled={guardandoAjuste.cargando || !kmManual} onClick={guardarAjuste}>
                {guardandoAjuste.cargando ? "Guardando…" : "Guardar ajuste"}
              </Button>
              <Button type="button" variante="secundario" onClick={() => setAjustando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variante="secundario"
            className="mt-3"
            onClick={() => setAjustando(true)}
          >
            Ajustar distancia a mano
          </Button>
        )}
      </div>
    </div>
  );
}
