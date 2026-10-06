"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { guardarTopeTarjetaManual } from "@/app/(staff)/caja/tarjeta-manual-actions";

/**
 * Tope de alerta de «Tarjeta (registro manual)»: arriba de este monto por
 * cobro la tarjeta se registra igual, pero sube a «Necesita atención» para que
 * el admin la revise primero. No bloquea a la recepción.
 */
export function TopeTarjetaManual({ tope }: { tope: number }) {
  const router = useRouter();
  const envio = useEspera();
  const [valor, setValor] = useState(String(tope));
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    setExito(null);
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0) return setError("El tope tiene que ser un monto mayor a cero.");
    const r = await envio.ejecutar(() => guardarTopeTarjetaManual(n));
    if (r.error) return setError(r.error);
    setExito(r.aviso ?? "Tope guardado.");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4" data-tope-tarjeta-manual>
      <h2 className="text-lg font-bold text-n-900">Tarjeta registrada a mano</h2>
      <p className="text-sm text-n-700">
        Cuando la terminal vinculada no se puede usar, tu equipo registra el cobro con «Tarjeta (registro manual)» y el folio del voucher. Cuenta como pagado, pero
        queda sin verificar hasta que lo revises en Caja → Conciliación. Un cobro arriba de este tope se registra igual y sube a «Necesita atención».
      </p>
      <Field
        label="Tope de alerta por cobro (MXN)"
        type="number"
        min="1"
        step="1"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        ayuda="Por omisión $2,000."
      />
      <AccionesFormulario error={error} exito={exito}>
        <Button type="button" cargando={envio.cargando} onClick={guardar}>
          Guardar tope
        </Button>
      </AccionesFormulario>
    </section>
  );
}
