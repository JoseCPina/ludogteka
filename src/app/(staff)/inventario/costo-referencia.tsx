"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { guardarCostoReferencia } from "./costos-actions";

// Costo de referencia por unidad de compra. Solo se muestra a quien tiene
// el permiso de costos (y la base lo vuelve a revisar al guardar). Mientras
// el consumible no tenga compras, este es su costo.
export function CostoReferencia({
  insumoId,
  costoActual,
  unidadCompra,
  tieneCompras,
  compacto = false,
}: {
  insumoId: string;
  costoActual: number | null;
  unidadCompra: string;
  tieneCompras: boolean;
  compacto?: boolean;
}) {
  const router = useRouter();
  const guardando = useEspera();
  const [valor, setValor] = useState(costoActual !== null ? String(costoActual) : "");
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  async function guardar() {
    setError(null);
    setExito(false);
    const res = await guardando.ejecutar(() => guardarCostoReferencia(insumoId, Number(valor)));
    if (res.error) {
      setError(res.error);
      return;
    }
    setExito(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {!compacto && (
        <p className="text-sm text-n-600">
          {tieneCompras
            ? "Ya tiene compras: el costo se calcula de ellas. Este valor es de referencia."
            : "Sin compras registradas: este es el costo que se usa en los reportes."}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Field
            label={`Costo por ${unidadCompra}`}
            type="number"
            step="0.01"
            min="0"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            disabled={guardando.cargando}
          />
        </div>
        <AccionesFormulario error={error} exito={exito && "Guardado"}>
          <Button type="button" cargando={guardando.cargando} disabled={valor === ""} onClick={guardar}>
            Guardar costo
          </Button>
        </AccionesFormulario>
      </div>
    </div>
  );
}
