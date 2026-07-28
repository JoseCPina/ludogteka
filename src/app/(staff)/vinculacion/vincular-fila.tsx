"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearTelefono } from "@/lib/telefono";
import { formatearFecha } from "@/lib/formato";
import { vincularCuenta } from "./actions";
import type { CuentaPendiente, ClienteBusqueda } from "./tipos";

export function VincularFila({
  cuenta,
  clientes,
}: {
  cuenta: CuentaPendiente;
  clientes: ClienteBusqueda[];
}) {
  const router = useRouter();
  const [buscando, setBuscando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionado, setSeleccionado] = useState<ClienteBusqueda | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    const qDigitos = q.replace(/\D/g, "");
    return clientes
      .filter(
        (c) =>
          c.nombre.toLowerCase().includes(q) ||
          (qDigitos.length > 0 && c.telefono.includes(qDigitos))
      )
      .slice(0, 8);
  }, [clientes, busqueda]);

  function cancelar() {
    setBuscando(false);
    setBusqueda("");
    setSeleccionado(null);
    setError(null);
  }

  async function confirmar() {
    if (!seleccionado) return;
    setEnviando(true);
    setError(null);
    const resultado = await vincularCuenta(cuenta.id, seleccionado.id);
    setEnviando(false);
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
          <Button type="button" disabled={enviando} onClick={confirmar}>
            {enviando ? "Vinculando…" : "Sí, vincular"}
          </Button>
          <Button type="button" variante="secundario" disabled={enviando} onClick={cancelar}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  if (buscando) {
    return (
      <div className="flex flex-col gap-3 border-b border-n-200 bg-n-50 p-4">
        <Field
          label={`Buscar cliente para vincular con ${cuenta.email}`}
          type="search"
          autoFocus
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Nombre o teléfono"
        />
        {busqueda.trim() && (
          <ul className="flex flex-col divide-y divide-n-200 rounded-md border border-n-200 bg-white">
            {resultados.length === 0 && (
              <li className="p-3 text-sm text-n-600">Ningún cliente coincide.</li>
            )}
            {resultados.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSeleccionado(c)}
                  className="flex min-h-11 w-full items-center justify-between gap-4 px-3 text-left hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul"
                >
                  <span className="font-semibold text-n-900">{c.nombre}</span>
                  <span className="tabular-nums text-n-600">{formatearTelefono(c.telefono)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
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
