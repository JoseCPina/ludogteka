"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearTelefono } from "@/lib/telefono";
import { formatearFecha } from "@/lib/formato";
import { desvincularCuenta } from "./actions";
import type { CuentaVinculada } from "./tipos";
import { useZonaNegocio } from "@/components/zona-negocio";

export function DesvincularFila({ cuenta }: { cuenta: CuentaVinculada }) {
  const zona = useZonaNegocio();
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const enviando = useEspera();
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setError(null);
    const resultado = await enviando.ejecutar(() => desvincularCuenta(cuenta.profile_id, cuenta.cliente_id));
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
            {cuenta.vinculado_en ? ` · ${formatearFecha(cuenta.vinculado_en, zona)}` : ""}
          </p>
        </div>
        {!confirmando && (
          <Button type="button" variante="peligro" onClick={() => setConfirmando(true)}>
            Desvincular
          </Button>
        )}
      </div>

      {confirmando && (
        <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-coral bg-coral-suave p-4">
          {error && (
            <Alert variante="error" titulo="No se pudo desvincular">
              {error}
            </Alert>
          )}
          <p className="font-semibold text-coral-oscuro">
            ¿Quitarle a {cuenta.email} el acceso al expediente de {cuenta.cliente_nombre}?
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variante="peligro" cargando={enviando.cargando} onClick={confirmar}>
              {enviando.cargando ? "Desvinculando…" : "Sí, desvincular"}
            </Button>
            <Button
              type="button"
              variante="secundario"
              cargando={enviando.cargando}
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
