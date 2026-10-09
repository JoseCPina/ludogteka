"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { corregirPrecioCuenta } from "@/app/(staff)/caja/correcciones-actions";

const dinero = (v: number) => `$${v.toFixed(2)}`;

/**
 * Corregir el PRECIO de una línea de la cuenta (el servicio salió con un precio
 * equivocado) sin aplicar un descuento: queda un renglón de corrección con el
 * precio anterior, el nuevo, el motivo y quién lo hizo.
 */
export function CorregirPrecioLinea({
  reservaId,
  tipo,
  origenId,
  descripcion,
  total,
  onCerrar,
}: {
  reservaId: string;
  tipo: string;
  origenId: string;
  descripcion: string;
  total: number;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const envio = useEspera();
  const [precio, setPrecio] = useState(String(total));
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function confirmar() {
    setError(null);
    if (motivo.trim().length < 5) return setError("Escribe el motivo: qué estaba mal en el precio.");
    const r = await envio.ejecutar(() => corregirPrecioCuenta(reservaId, tipo, origenId, Number(precio), motivo));
    if (r.error) return setError(r.error);
    setAviso(r.aviso ?? "Listo.");
    router.refresh();
  }

  return (
    <div data-corregir-precio className="flex flex-col gap-3 rounded-lg border-[1.5px] border-ambar bg-ambar-suave p-4">
      <p className="font-semibold text-ambar-oscuro">Corregir el precio de «{descripcion}» (hoy {dinero(total)})</p>
      <p className="text-sm text-ambar-oscuro">
        Úsalo cuando el precio estaba mal. No es un descuento: no aparece en el reporte de descuentos y el precio corregido es el que cuenta. Si quieres cobrar menos a
        propósito (cortesía, promoción), aplica un descuento.
      </p>
      <div className="w-48">
        <Field label="Precio correcto de la línea" type="number" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} />
      </div>
      <Textarea label="Motivo (obligatorio)" rows={2} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} ayuda="Qué estaba mal. Queda en el historial con tu nombre." />
      <AccionesFormulario error={error} exito={aviso}>
        <Button type="button" cargando={envio.cargando} onClick={confirmar} disabled={Boolean(aviso)}>
          Guardar precio
        </Button>
        <Button type="button" variante="secundario" onClick={onCerrar}>
          {aviso ? "Cerrar" : "Dejarlo"}
        </Button>
      </AccionesFormulario>
    </div>
  );
}
