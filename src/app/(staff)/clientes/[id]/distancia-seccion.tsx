"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearFecha } from "@/lib/formato";
import { actualizarDireccionYCalcular, ajustarDistanciaManual } from "./distancia-actions";

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
  const router = useRouter();
  const [direccion, setDireccion] = useState(direccionInicial ?? "");
  const [distanciaKm, setDistanciaKm] = useState(distanciaKmInicial);
  const [calculadaAt, setCalculadaAt] = useState(calculadaAtInicial);
  const [ajustadaManualmente, setAjustadaManualmente] = useState(ajustadaManualmenteInicial);
  const [simulado, setSimulado] = useState(false);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ajustando, setAjustando] = useState(false);
  const [kmManual, setKmManual] = useState("");
  const [guardandoAjuste, setGuardandoAjuste] = useState(false);

  async function guardarDireccion() {
    setGuardando(true);
    setError(null);
    setSimulado(false);
    const res = await actualizarDireccionYCalcular(clienteId, direccion);
    setGuardando(false);
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
  }

  async function guardarAjuste() {
    const km = Number(kmManual);
    setGuardandoAjuste(true);
    setError(null);
    const res = await ajustarDistanciaManual(clienteId, km);
    setGuardandoAjuste(false);
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
            disabled={guardando}
            placeholder="Calle, número, colonia, ciudad"
          />
        </div>
        <Button type="button" disabled={guardando || !direccion.trim()} onClick={guardarDireccion}>
          {guardando ? "Calculando…" : "Guardar y calcular"}
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
              <span className="text-sm text-n-600">· actualizada el {formatearFecha(calculadaAt)}</span>
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
                disabled={guardandoAjuste}
                ayuda="Úsalo cuando Google geocodifique mal la colonia — queda registrado como ajuste manual."
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" disabled={guardandoAjuste || !kmManual} onClick={guardarAjuste}>
                {guardandoAjuste ? "Guardando…" : "Guardar ajuste"}
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
