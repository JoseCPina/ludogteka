"use client";

import { useEffect } from "react";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { MOTIVOS_TARJETA_MANUAL, type DatosTarjetaManual } from "@/lib/cobro/tarjeta-manual";

/**
 * Los datos que pide una línea de «Tarjeta (registro manual)»: folio del
 * voucher y motivo (obligatorios), últimos 4 y banco (opcionales). Nunca se
 * pide la tarjeta completa.
 */
export function CamposTarjetaManual({
  valor,
  onChange,
  conTerminal = true,
}: {
  valor: DatosTarjetaManual;
  onChange: (cambios: Partial<DatosTarjetaManual>) => void;
  /** QA S62: sin terminal vinculada no se pregunta por qué no se cobró con ella (motivo «sin_terminal»). */
  conTerminal?: boolean;
}) {
  const motivoFijo = !conTerminal && valor.motivo !== "sin_terminal";
  useEffect(() => {
    if (motivoFijo) onChange({ motivo: "sin_terminal" });
  }, [motivoFijo]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div data-tarjeta-manual className="flex w-full flex-col gap-3 rounded-md border-[1.5px] border-ambar bg-ambar-suave p-3">
      <p className="text-sm text-ambar-oscuro">
        <span className="font-semibold">Sin verificar.</span> Cuenta como pagado, pero el admin la revisa contra el voucher en Caja → Conciliación.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Folio o autorización del voucher"
          value={valor.folio}
          maxLength={40}
          autoComplete="off"
          onChange={(e) => onChange({ folio: e.target.value })}
          ayuda="Obligatorio, mínimo 4 caracteres. Un mismo folio no se registra dos veces."
        />
        {conTerminal ? <Select label="¿Por qué no se cobró con la terminal vinculada?" value={valor.motivo} onChange={(e) => onChange({ motivo: e.target.value })}>
          <option value="">Elige un motivo…</option>
          {MOTIVOS_TARJETA_MANUAL.map((m) => (
            <option key={m.clave} value={m.clave}>
              {m.etiqueta}
            </option>
          ))}
        </Select> : null}
      </div>
      {valor.motivo === "otro" && (
        <Field label="Cuéntanos el motivo" value={valor.motivo_texto} maxLength={200} onChange={(e) => onChange({ motivo_texto: e.target.value })} />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Últimos 4 dígitos (opcional)"
          value={valor.ultimos4}
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          onChange={(e) => onChange({ ultimos4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
          ayuda="Solo los últimos 4. Nunca captures la tarjeta completa."
        />
        <Field label="Banco (opcional)" value={valor.banco} maxLength={40} onChange={(e) => onChange({ banco: e.target.value })} />
      </div>
    </div>
  );
}
