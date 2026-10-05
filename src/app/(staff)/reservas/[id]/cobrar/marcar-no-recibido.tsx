"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { marcarCobroNoRecibido } from "@/app/(staff)/caja/cobro-integrado-actions";

/**
 * Corregir un cobro con terminal que quedó como pagado sin que se pasara la
 * tarjeta. Solo admin. Antes de cambiar nada, la app le pregunta a Mercado
 * Pago: si tiene un pago aprobado que pueda ser de este cobro, se niega.
 * El cobro no se borra: queda con su historial y la cuenta recupera el saldo.
 */
export function MarcarNoRecibido({ reservaId, cobroId, monto }: { reservaId: string; cobroId: string; monto: number }) {
  const router = useRouter();
  const envio = useEspera();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function confirmar() {
    setError(null);
    if (motivo.trim().length < 5) return setError("Escribe el motivo: qué pasó con este cobro.");
    const r = await envio.ejecutar(() => marcarCobroNoRecibido(reservaId, cobroId, motivo.trim()));
    if (r.error) return setError(r.error);
    setAviso(r.aviso ?? "Listo.");
    setAbierto(false);
    router.refresh();
  }

  if (aviso) return <p role="status" className="text-sm font-semibold text-menta-oscuro">{aviso}</p>;
  if (!abierto) {
    return (
      <Button type="button" variante="secundario" onClick={() => setAbierto(true)}>
        Marcar como no recibido
      </Button>
    );
  }
  return (
    <div data-no-recibido className="flex flex-col gap-3 rounded-md border-[1.5px] border-ambar bg-ambar-suave p-3">
      <p className="text-sm font-semibold text-ambar-oscuro">
        ¿Este cobro de ${monto.toFixed(2)} con terminal no se recibió? Antes de marcarlo se revisa con Mercado Pago: si hay un pago aprobado que pueda ser
        suyo, no se deja.
      </p>
      <Textarea label="Motivo (obligatorio)" rows={2} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} ayuda="Queda en el historial con tu nombre. La cuenta vuelve a quedar con saldo para cobrarse." />
      <AccionesFormulario error={error}>
        <Button type="button" variante="peligro" cargando={envio.cargando} onClick={confirmar}>
          Marcar como no recibido
        </Button>
        <Button type="button" variante="secundario" onClick={() => { setAbierto(false); setError(null); }}>
          Cancelar
        </Button>
      </AccionesFormulario>
    </div>
  );
}
