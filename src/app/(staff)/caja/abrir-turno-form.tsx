"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { abrirTurno } from "../reservas/turno-actions";

export function AbrirTurnoForm() {
  const router = useRouter();
  const [fondoInicial, setFondoInicial] = useState("");
  const [notas, setNotas] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function abrir() {
    const fondo = Number(fondoInicial);
    if (!Number.isFinite(fondo) || fondo < 0) {
      setError("El fondo inicial debe ser un número mayor o igual a cero.");
      return;
    }
    setCargando(true);
    setError(null);
    const res = await abrirTurno(fondo, notas);
    setCargando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex max-w-md flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
      <p className="text-n-700">No hay turno de caja abierto. Ábrelo con el fondo con el que arrancas.</p>

      {error && (
        <Alert variante="error" titulo="No se pudo abrir el turno">
          {error}
        </Alert>
      )}

      <Field
        label="Fondo inicial"
        type="number"
        min="0"
        step="0.01"
        value={fondoInicial}
        onChange={(e) => setFondoInicial(e.target.value)}
        autoFocus
      />
      <Textarea label="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />

      <Button type="button" disabled={cargando} onClick={abrir} className="self-start">
        {cargando ? "Abriendo…" : "Abrir turno"}
      </Button>
    </div>
  );
}
