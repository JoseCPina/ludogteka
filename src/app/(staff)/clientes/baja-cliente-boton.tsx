"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function BajaClienteBoton({
  accion,
  nombre,
}: {
  accion: () => void | Promise<void>;
  nombre: string;
}) {
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <Button
        type="button"
        variante="peligro"
        className="self-start"
        onClick={() => setConfirmando(true)}
      >
        Dar de baja
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-naranja bg-naranja-suave p-4">
      <p className="font-semibold text-naranja-oscuro">
        ¿Dar de baja a {nombre}? Ya no va a aparecer en el listado ni se podrá vincular a una
        cuenta nueva. No borra su historial y su correo queda libre para otro cliente.
      </p>
      <div className="flex flex-wrap gap-3">
        <form action={accion}>
          <Button type="submit" variante="peligro">
            Sí, dar de baja
          </Button>
        </form>
        <Button type="button" variante="secundario" onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
