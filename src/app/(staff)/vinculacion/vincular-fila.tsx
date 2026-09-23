"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { BuscadorClientes } from "@/components/buscador-clientes";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearTelefono } from "@/lib/telefono";
import { formatearFecha } from "@/lib/formato";
import { vincularCuenta } from "./actions";
import type { CuentaPendiente } from "./tipos";
import type { ClienteBuscable } from "@/lib/clientes/buscables";

export function VincularFila({
  cuenta,
  clientes,
}: {
  cuenta: CuentaPendiente;
  clientes: ClienteBuscable[];
}) {
  const router = useRouter();
  const [buscando, setBuscando] = useState(false);
  const [seleccionado, setSeleccionado] = useState<ClienteBuscable | null>(null);
  const enviando = useEspera();
  const [error, setError] = useState<string | null>(null);

  function cancelar() {
    setBuscando(false);
    setSeleccionado(null);
    setError(null);
  }

  async function confirmar() {
    if (!seleccionado) return;
    setError(null);
    const resultado = await enviando.ejecutar(() => vincularCuenta(cuenta.id, seleccionado.id));
    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    router.refresh();
  }

  if (seleccionado) {
    return (
      <div className="flex flex-col gap-3 border-b border-n-200 bg-azul-suave p-4">
        {error && (
          <Alert variante="error" titulo="No se pudo vincular">
            {error}
          </Alert>
        )}
        <p className="text-azul">
          Vas a dar a <strong>{cuenta.email}</strong> acceso al expediente de{" "}
          <strong>
            {seleccionado.nombre}, {formatearTelefono(seleccionado.telefono)}
          </strong>
          .
        </p>
        <div className="flex flex-wrap gap-3">
          <Button type="button" cargando={enviando.cargando} onClick={confirmar}>
            {enviando.cargando ? "Vinculando…" : "Sí, vincular"}
          </Button>
          <Button type="button" variante="secundario" cargando={enviando.cargando} onClick={cancelar}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  if (buscando) {
    return (
      <div className="flex flex-col gap-3 border-b border-n-200 bg-n-50 p-4">
        <BuscadorClientes
          clientes={clientes}
          etiqueta={`Buscar por perro, dueño o teléfono para vincular con ${cuenta.email}`}
          onElegir={(c) => setSeleccionado(c)}
          listarSinBusqueda={false}
          maximo={8}
          autoFocus
        />
        <Button type="button" variante="secundario" className="self-start" onClick={cancelar}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-n-200 px-4 py-3 last:border-b-0">
      <div>
        <p className="font-semibold text-n-900">{cuenta.email}</p>
        <p className="text-sm text-n-600">Registrada el {formatearFecha(cuenta.creado_en)}</p>
      </div>
      <Button type="button" variante="secundario" onClick={() => setBuscando(true)}>
        Vincular
      </Button>
    </div>
  );
}
