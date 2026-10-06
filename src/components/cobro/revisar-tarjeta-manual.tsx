"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { marcarTarjetaManualNoRecibida, revisarTarjetaManual } from "@/app/(staff)/caja/tarjeta-manual-actions";

/**
 * Lo que el admin hace con una tarjeta manual por revisar: «Revisado con
 * voucher» (con nota opcional) o «Marcar como no recibida» (con motivo). La
 * segunda no borra nada: entra como un movimiento aparte en el turno abierto.
 */
export function RevisarTarjetaManual({ tarjetaId, monto, reservaId, cuentas = 1 }: { tarjetaId: string; monto: number; reservaId?: string | null; cuentas?: number }) {
  const router = useRouter();
  const revisando = useEspera();
  const marcando = useEspera();
  const [modo, setModo] = useState<null | "revisar" | "no_recibida">(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  if (aviso) return <p role="status" className="text-sm font-semibold text-menta-oscuro">{aviso}</p>;

  if (!modo) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => { setModo("revisar"); setTexto(""); setError(null); }}>
          Revisado con voucher
        </Button>
        <Button type="button" variante="secundario" onClick={() => { setModo("no_recibida"); setTexto(""); setError(null); }}>
          Marcar como no recibida
        </Button>
      </div>
    );
  }

  async function confirmar() {
    setError(null);
    if (modo === "revisar") {
      const r = await revisando.ejecutar(() => revisarTarjetaManual(tarjetaId, texto, reservaId));
      if (r.error) return setError(r.error);
      setAviso(r.aviso ?? "Listo.");
    } else {
      if (texto.trim().length < 5) return setError("Escribe el motivo: qué pasó con este cobro.");
      const r = await marcando.ejecutar(() => marcarTarjetaManualNoRecibida(tarjetaId, texto, reservaId));
      if (r.error) return setError(r.error);
      setAviso(r.aviso ?? "Listo.");
    }
    router.refresh();
  }

  return (
    <div data-revisar-tarjeta className="flex flex-col gap-3 rounded-md border border-n-200 bg-n-50 p-3">
      {modo === "revisar" ? (
        <Field label="Nota (opcional)" value={texto} maxLength={300} onChange={(e) => setTexto(e.target.value)} ayuda="Por ejemplo: «Voucher a la vista, cuadra con el estado de cuenta»." />
      ) : (
        <>
          <p className="text-sm font-semibold text-ambar-oscuro">
            ¿Esta tarjeta de ${monto.toFixed(2)} no se recibió? El cobro no se borra: queda con su historial y {cuentas > 1 ? `las ${cuentas} cuentas que se cobraron con ese voucher vuelven` : "la cuenta vuelve"} a tener saldo.
          </p>
          <Textarea label="Motivo (obligatorio)" rows={2} maxLength={300} value={texto} onChange={(e) => setTexto(e.target.value)} ayuda="Queda en el historial con tu nombre." />
        </>
      )}
      <AccionesFormulario error={error}>
        <Button type="button" variante={modo === "no_recibida" ? "peligro" : "primario"} cargando={revisando.cargando || marcando.cargando} onClick={confirmar}>
          {modo === "revisar" ? "Guardar como revisada" : "Marcar como no recibida"}
        </Button>
        <Button type="button" variante="secundario" onClick={() => { setModo(null); setError(null); }}>
          Cancelar
        </Button>
      </AccionesFormulario>
    </div>
  );
}
