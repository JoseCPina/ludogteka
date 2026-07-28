"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearTelefono } from "@/lib/telefono";
import { formatearFecha } from "@/lib/formato";
import { desvincularCuenta } from "./actions";
import type { CuentaVinculada } from "./tipos";

export function DesvincularFila({ cuenta }: { cuenta: CuentaVinculada }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setEnviando(true);
    setError(null);
    const resultado = await desvincularCuenta(cuenta.profile_id, cuenta.cliente_id);
    setEnviando(false);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    router.refresh();
  }

  const origen = cuenta.automatico
    ? "Vinculación automática"
    : cuenta.vinculado_por
      ? `Vinculado por ${cuenta.vinculado_por}`
      : "Vinculado";

  return (
    <div className="flex flex-col gap-3 border-b border-n-200 px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-n-900">
            {cuenta.email} <span className="text-n-400">→</span> {cuenta.cliente_nombre},{" "}
            {formatearTelefono(cuenta.cliente_telefono)}
          </p>
          <p className="text-sm text-n-600">
            {origen}
            {cuenta.vinculado_en ? ` · ${formatearFecha(cuenta.vinculado_en)}` : ""}
          </p>
        </div>
        {!confirmando && (
          <Button type="button" variante="peligro" onClick={() => setConfirmando(true)}>
            Desvincular
          </Button>
        )}
      </div>

      {confirmando && (
        <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-naranja bg-naranja-suave p-4">
          {error && (
            <Alert variante="error" titulo="No se pudo desvincular">
              {error}
            </Alert>
          )}
          <p className="font-semibold text-naranja-oscuro">
            ¿Quitarle a {cuenta.email} el acceso al expediente de {cuenta.cliente_nombre}?
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variante="peligro" disabled={enviando} onClick={confirmar}>
              {enviando ? "Desvinculando…" : "Sí, desvincular"}
            </Button>
            <Button
              type="button"
              variante="secundario"
              disabled={enviando}
              onClick={() => setConfirmando(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
