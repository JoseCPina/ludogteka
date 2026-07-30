"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { actualizarTopeDescuento } from "./descuento-config-actions";

export function DescuentoConfig({
  topeActual,
  vigenteDesde,
}: {
  topeActual: number | null;
  vigenteDesde: string | null;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [tope, setTope] = useState(String(topeActual ?? ""));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setEnviando(true);
    setError(null);
    const res = await actualizarTopeDescuento(Number(tope));
    setEnviando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setEditando(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {topeActual === null ? (
        <Alert variante="advertencia" titulo="Sin tope configurado">
          Hasta que se configure, recepción no puede aplicar ningún descuento sin autorización de admin.
        </Alert>
      ) : (
        <p className="text-n-700">
          Recepción puede aplicar descuentos hasta{" "}
          <span className="font-bold text-n-900">${topeActual.toFixed(2)}</span> sin necesitar admin
          {vigenteDesde ? ` (vigente desde ${vigenteDesde})` : ""}.
        </p>
      )}

      {error && (
        <Alert variante="error" titulo="No se pudo guardar">
          {error}
        </Alert>
      )}

      {!editando ? (
        <Button type="button" variante="secundario" className="self-start" onClick={() => setEditando(true)}>
          {topeActual === null ? "Configurar tope" : "Cambiar tope"}
        </Button>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <Field
            label="Nuevo tope"
            type="number"
            min="0"
            step="0.01"
            value={tope}
            onChange={(e) => setTope(e.target.value)}
            autoFocus
          />
          <Button type="button" disabled={enviando} onClick={guardar}>
            {enviando ? "Guardando…" : "Guardar"}
          </Button>
          <Button type="button" variante="secundario" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
