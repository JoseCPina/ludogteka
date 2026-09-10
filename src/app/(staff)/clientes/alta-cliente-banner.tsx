"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatearFecha } from "@/lib/formato";
import { marcarDatosRevisados } from "./invitaciones/invitacion-actions";

// Aviso de procedencia, no de error: los datos los tecleó el dueño desde
// su celular, así que conviene contrastarlos en el mostrador (el nombre
// como viene en la credencial, el teléfono al que de verdad contestan, la
// raza que el dueño cree que es). Se apaga en cuanto recepción lo revisa
// — un aviso que no se puede apagar deja de leerse a la semana.
export function AltaClienteBanner({
  clienteId,
  revisadoAt,
}: {
  clienteId: string;
  revisadoAt: string | null;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (revisadoAt) {
    return (
      <p className="text-sm text-n-500">
        Alta hecha por el cliente · revisada el {formatearFecha(revisadoAt)}
      </p>
    );
  }

  async function marcar() {
    setOcupado(true);
    setError(null);
    const res = await marcarDatosRevisados(clienteId);
    setOcupado(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <Alert variante="advertencia" titulo="Este expediente lo capturó el dueño">
      <span className="block">
        Los datos vienen tal cual los escribió desde su celular. Revísalos con él la primera vez que
        venga — sobre todo teléfono y contacto de emergencia. Las vacunas no las capturó: eso lo
        registras tú con el carnet.
      </span>
      {error && <span className="mt-2 block font-semibold text-naranja-oscuro">{error}</span>}
      <span className="mt-3 block">
        <Button type="button" variante="secundario" disabled={ocupado} onClick={marcar}>
          {ocupado ? "Guardando…" : "Ya lo revisé"}
        </Button>
      </span>
    </Alert>
  );
}
