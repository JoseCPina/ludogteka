"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { guardarMostrarPagosAjenos } from "@/app/(staff)/caja/conciliacion/actions";

/**
 * La conciliación solo considera los pagos que PeluDesk cobró. Una cuenta de
 * Mercado Pago recibe también pagos de otras tiendas, transferencias u otras
 * terminales: por omisión se ignoran. Encendido, salen aparte en Caja →
 * Conciliación como «Otros pagos de tu cuenta (informativo)», sin alertas.
 */
export function OtrosPagos({ activo }: { activo: boolean }) {
  const router = useRouter();
  const envio = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function cambiar(nuevo: boolean) {
    setError(null);
    setExito(null);
    const r = await envio.ejecutar(() => guardarMostrarPagosAjenos(nuevo));
    if (r.error) return setError(r.error);
    setExito(nuevo ? "Listo: los otros pagos de tu cuenta saldrán en Conciliación, solo como información." : "Listo: los otros pagos de tu cuenta se ignoran por completo.");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4" data-otros-pagos>
      <h2 className="text-lg font-bold text-n-900">Otros pagos de tu cuenta de Mercado Pago</h2>
      <p className="text-sm text-n-700">
        Tu cuenta puede recibir pagos que no se cobraron desde PeluDesk (otra tienda, una transferencia, otra terminal). PeluDesk solo concilia los que cobra desde aquí
        y los demás se ignoran: no generan alertas.
      </p>
      <label className="flex min-h-12 items-center gap-3 text-n-900">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={activo}
          disabled={envio.cargando}
          onChange={(e) => cambiar(e.target.checked)}
          data-mostrar-otros-pagos
        />
        <span className="font-semibold">Mostrar también otros pagos de mi cuenta de Mercado Pago</span>
      </label>
      <p className="text-sm text-n-600">
        Encendido, aparecen en Caja → Conciliación en «Otros pagos de tu cuenta (informativo)», sin alertas y sin contar en «Necesita atención».
      </p>
      <AccionesFormulario error={error} exito={exito}>
        <Button type="button" variante="secundario" cargando={envio.cargando} onClick={() => cambiar(!activo)}>
          {activo ? "Dejar de mostrarlos" : "Mostrarlos"}
        </Button>
      </AccionesFormulario>
    </section>
  );
}
