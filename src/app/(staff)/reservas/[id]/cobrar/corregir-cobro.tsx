"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { anularCobro, anularCobroGrupo, editarMontoCobro } from "@/app/(staff)/caja/correcciones-actions";
import { ETIQUETA_TARJETA_MANUAL } from "@/lib/cobro/tarjeta-manual";

const ETIQUETA: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta_manual: ETIQUETA_TARJETA_MANUAL };
const dinero = (v: number) => `$${v.toFixed(2)}`;

/**
 * Anular un cobro o corregir su monto, SIN descuentos. El cobro no se borra:
 * queda con su historial (valor anterior, motivo, quién y cuándo) y la cuenta
 * vuelve a quedar por cobrar. Con el turno del cobro cerrado hace falta un
 * permiso más y el ajuste cae en el turno abierto.
 */
export function CorregirCobro({
  reservaId,
  cobroId,
  metodos,
  grupoId = null,
  cuentasDelGrupo = 1,
  puedeAnular,
  puedeEditar,
  puedeTurnosCerrados,
  turnoCerrado,
}: {
  reservaId: string;
  cobroId: string;
  // Lo cobrado por método, ya neto de correcciones.
  metodos: { metodo: string; monto: number }[];
  grupoId?: string | null;
  cuentasDelGrupo?: number;
  puedeAnular: boolean;
  puedeEditar: boolean;
  puedeTurnosCerrados: boolean;
  turnoCerrado: boolean;
}) {
  const router = useRouter();
  const envio = useEspera();
  const [modo, setModo] = useState<null | "anular" | "anular_grupo" | "editar">(null);
  const [motivo, setMotivo] = useState("");
  const editables = metodos.filter((m) => m.monto > 0 && m.metodo in ETIQUETA);
  const [metodo, setMetodo] = useState(editables[0]?.metodo ?? "efectivo");
  const [monto, setMonto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  if (!puedeAnular && !puedeEditar) return null;
  if (editables.length === 0) return null;
  if (aviso) return <p role="status" className="text-sm font-semibold text-menta-oscuro">{aviso}</p>;
  if (turnoCerrado && !puedeTurnosCerrados) {
    return (
      <p data-correccion-turno-cerrado className="text-xs text-n-500">
        Este cobro es de un turno que ya se cerró. Para anularlo o corregirlo hace falta el permiso «Corregir cobros de turnos cerrados» (se lo da un admin).
      </p>
    );
  }

  function cerrar() {
    setModo(null);
    setMotivo("");
    setMonto("");
    setError(null);
  }

  async function confirmar() {
    setError(null);
    if (motivo.trim().length < 5) return setError("Escribe el motivo: qué pasó con este cobro.");
    const r =
      modo === "anular"
        ? await envio.ejecutar(() => anularCobro(cobroId, motivo, reservaId))
        : modo === "anular_grupo" && grupoId
          ? await envio.ejecutar(() => anularCobroGrupo(grupoId, motivo))
          : await envio.ejecutar(() => editarMontoCobro(cobroId, metodo, Number(monto), motivo, reservaId));
    if (r.error) return setError(r.error);
    setAviso(r.aviso ?? "Listo.");
    cerrar();
    router.refresh();
  }

  if (!modo) {
    return (
      <div className="flex flex-wrap items-center gap-2" data-correcciones-cobro>
        {puedeEditar && (
          <Button type="button" variante="secundario" onClick={() => { setModo("editar"); setMonto(String(editables[0].monto)); setMetodo(editables[0].metodo); }}>
            Corregir monto
          </Button>
        )}
        {puedeAnular && (
          <Button type="button" variante="secundario" onClick={() => setModo("anular")}>
            Anular cobro
          </Button>
        )}
        {puedeAnular && grupoId && cuentasDelGrupo > 1 && (
          <Button type="button" variante="secundario" onClick={() => setModo("anular_grupo")}>
            Anular el cobro junto completo
          </Button>
        )}
      </div>
    );
  }

  const actual = editables.find((m) => m.metodo === metodo)?.monto ?? 0;
  return (
    <div data-correccion-cobro className="flex flex-col gap-3 rounded-md border-[1.5px] border-ambar bg-ambar-suave p-3">
      {modo === "editar" ? (
        <>
          <p className="text-sm font-semibold text-ambar-oscuro">
            Corregir cuánto se cobró. No es un descuento: el valor corregido es el que cuenta en la caja y en los reportes, y queda el valor anterior en el historial.
            Si lo que estaba mal es el PRECIO de lo que se vendió, corrígelo en la línea de la cuenta («Corregir precio»).
          </p>
          <div className="flex flex-wrap items-end gap-3">
            {editables.length > 1 && (
              <div className="w-48">
                <Select label="Método" value={metodo} onChange={(e) => { setMetodo(e.target.value); setMonto(String(editables.find((m) => m.metodo === e.target.value)?.monto ?? "")); }}>
                  {editables.map((m) => (
                    <option key={m.metodo} value={m.metodo}>{ETIQUETA[m.metodo]}</option>
                  ))}
                </Select>
              </div>
            )}
            <div className="w-40">
              <Field label={`Monto correcto (hoy ${dinero(actual)})`} type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm font-semibold text-ambar-oscuro">
          {modo === "anular_grupo"
            ? `¿Anular el cobro junto completo (${cuentasDelGrupo} cuentas)? Todas vuelven a quedar por cobrar.`
            : `¿Anular este cobro de ${dinero(metodos.reduce((s, m) => s + m.monto, 0))}? ${grupoId && cuentasDelGrupo > 1 ? "Solo se anula la parte de ESTA cuenta; el resto del cobro junto sigue." : "La cuenta vuelve a quedar por cobrar."}`}{" "}
          El cobro no se borra: queda en el historial con tu nombre.
        </p>
      )}
      {turnoCerrado && (
        <p className="text-sm text-ambar-oscuro">Este cobro es de un turno ya cerrado: su corte no cambia y la corrección se anota como ajuste en el turno abierto.</p>
      )}
      <Textarea label="Motivo (obligatorio)" rows={2} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} ayuda="Qué pasó. Queda en el historial." />
      <AccionesFormulario error={error}>
        <Button type="button" variante={modo === "editar" ? "primario" : "peligro"} cargando={envio.cargando} onClick={confirmar}>
          {modo === "editar" ? "Guardar corrección" : "Anular cobro"}
        </Button>
        <Button type="button" variante="secundario" onClick={cerrar}>
          Dejarlo
        </Button>
      </AccionesFormulario>
    </div>
  );
}
