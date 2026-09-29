"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { cancelarRenglonVenta } from "@/app/(staff)/caja/venta/venta-actions";

// Quitar un renglón de una venta de mostrador que todavía no se cobra: el
// producto regresa al inventario con un ajuste (nada se borra).
export function CancelarRenglonVenta({ ventaId, reservaId, onError }: { ventaId: string; reservaId: string; onError: (e: string | null) => void }) {
  const router = useRouter();
  const envio = useEspera();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  if (!abierto) {
    return (
      <Button type="button" variante="secundario" onClick={() => setAbierto(true)}>
        Quitar
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      <input
        aria-label="Motivo para quitarlo"
        className="min-h-11 w-40 rounded-md border-[1.5px] border-n-300 px-2 text-sm"
        placeholder="¿Por qué?"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
      />
      <Button
        type="button"
        variante="peligro"
        cargando={envio.cargando}
        onClick={async () => {
          onError(null);
          const res = await envio.ejecutar(() => cancelarRenglonVenta(ventaId, reservaId, motivo));
          if (res.error) return onError(res.error);
          setAbierto(false);
          router.refresh();
        }}
      >
        Quitar
      </Button>
    </span>
  );
}
