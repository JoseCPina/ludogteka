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
import { abrirTurno } from "@/app/(staff)/reservas/turno-actions";
import { ETIQUETA_TARJETA_MANUAL } from "@/lib/cobro/tarjeta-manual";
import { dinero } from "@/lib/dinero";
import type { TotalesCuenta } from "@/lib/cobro/totales";

const ETIQUETA: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta_manual: ETIQUETA_TARJETA_MANUAL };

/**
 * Anular un cobro o corregir su monto, SIN descuentos. El cobro no se borra:
 * queda con su historial (valor anterior, motivo, quién y cuándo) y la cuenta
 * vuelve a quedar por cobrar. Con el turno del cobro cerrado hace falta un
 * permiso más y el ajuste queda en ESE turno, posterior al corte (QA S17, N81): el
 * turno abierto de hoy no cambia salvo que se devuelva efectivo del cajón, que se
 * pregunta y entonces se registra como retiro.
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
  alCorregir,
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
  // QA S15 (N45): la pantalla de cobro pinta la cuenta nueva de inmediato con lo que devolvió la acción.
  alCorregir?: (r: { cobroId: string; anulado: boolean; motivo: string; totales?: TotalesCuenta }) => void;
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
  // QA S16 (N63): sin turno abierto la corrección no tiene dónde anotarse; se ofrece abrirlo ahí mismo.
  const [sinTurno, setSinTurno] = useState(false);
  const [fondo, setFondo] = useState("0");
  const abriendo = useEspera();
  // N81: con el turno del cobro cerrado y efectivo de por medio, ¿salió dinero del cajón hoy?
  const [devolvioCajon, setDevolvioCajon] = useState<"" | "si" | "no">("");

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
    setDevolvioCajon("");
  }

  // El efectivo que la corrección le quita al cobro (lo que se devolvería del cajón).
  const efectivoCobrado = metodos.filter((m) => m.metodo === "efectivo").reduce((s2, m) => s2 + m.monto, 0);
  const efectivoQueSale =
    modo === "anular" || modo === "anular_grupo"
      ? efectivoCobrado
      : modo === "editar" && metodo === "efectivo" && Number(monto) >= 0 && Number(monto) < efectivoCobrado
        ? Math.round((efectivoCobrado - Number(monto)) * 100) / 100
        : 0;
  const preguntaCajon = turnoCerrado && efectivoQueSale > 0;

  async function abrirTurnoYCorregir() {
    setError(null);
    const f = Number(fondo || 0);
    if (!Number.isFinite(f) || f < 0) return setError("El fondo inicial es un número de cero para arriba.");
    const t = await abriendo.ejecutar(() => abrirTurno(f, "Abierto para corregir un cobro de un turno cerrado"));
    if (t.error && !/ya hay un turno/i.test(t.error)) return setError(t.error);
    setSinTurno(false);
    await confirmar();
  }

  async function confirmar() {
    setError(null);
    if (motivo.trim().length < 5) return setError("Escribe el motivo: qué pasó con este cobro.");
    if (preguntaCajon && !devolvioCajon) return setError("Contesta si se devolvió el dinero hoy del cajón.");
    const cajon = preguntaCajon && devolvioCajon === "si" ? efectivoQueSale : 0;
    const r =
      modo === "anular"
        ? await envio.ejecutar(() => anularCobro(cobroId, motivo, reservaId, cajon))
        : modo === "anular_grupo" && grupoId
          ? await envio.ejecutar(() => anularCobroGrupo(grupoId, motivo, reservaId, cajon))
          : await envio.ejecutar(() => editarMontoCobro(cobroId, metodo, Number(monto), motivo, reservaId, cajon));
    if (r.error) {
      if (/no hay turno de caja abierto/i.test(r.error)) {
        setSinTurno(true);
        return;
      }
      return setError(r.error);
    }
    setAviso(r.aviso ?? "Listo.");
    const anulado = modo === "anular" || modo === "anular_grupo";
    cerrar();
    if (alCorregir) alCorregir({ cobroId, anulado, motivo: motivo.trim(), totales: r.totales });
    else router.refresh();
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
        <p className="text-sm text-ambar-oscuro" data-aviso-turno-cerrado>
          Este cobro es de un turno ya cerrado: la corrección queda en ESE turno como ajuste posterior al corte (con tu nombre y la hora). Su corte no cambia y el turno abierto de hoy tampoco.
        </p>
      )}
      {preguntaCajon && (
        <fieldset className="flex flex-col gap-1.5 rounded-md border border-ambar bg-white p-3" data-pregunta-cajon>
          <legend className="px-1 text-sm font-semibold text-n-900">¿Se devolvió el dinero hoy del cajón? *</legend>
          <label className="flex items-center gap-2 text-sm text-n-800">
            <input type="radio" name={`cajon-${cobroId}`} checked={devolvioCajon === "si"} onChange={() => setDevolvioCajon("si")} data-cajon="si" />
            Sí: sale {dinero(efectivoQueSale)} del cajón hoy (se registra un retiro con este motivo en el turno abierto)
          </label>
          <label className="flex items-center gap-2 text-sm text-n-800">
            <input type="radio" name={`cajon-${cobroId}`} checked={devolvioCajon === "no"} onChange={() => setDevolvioCajon("no")} data-cajon="no" />
            No: solo se corrige el registro; el cajón de hoy no cambia
          </label>
        </fieldset>
      )}
      <Textarea label="Motivo (obligatorio)" rows={2} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} ayuda="Qué pasó. Queda en el historial." />
      {sinTurno && (
        <div data-abrir-turno-y-anular className="flex flex-col gap-2 rounded-md border-[1.5px] border-morado bg-white p-3">
          <p className="text-sm font-semibold text-n-900">No hay un turno de caja abierto.</p>
          <p className="text-sm text-n-700">
            Para sacar el efectivo del cajón hace falta un turno abierto: ábrelo aquí y {modo === "editar" ? "se guarda la corrección" : "se anula el cobro"} con el retiro en ese turno. El corte del turno cerrado no cambia.
          </p>
          <div className="w-40">
            <Field label="Fondo inicial ($)" type="number" min="0" step="0.01" value={fondo} onChange={(e) => setFondo(e.target.value)} />
          </div>
          <Button type="button" cargando={abriendo.cargando || envio.cargando} onClick={abrirTurnoYCorregir} className="self-start">
            {modo === "editar" ? "Abrir turno y corregir" : "Abrir turno y anular"}
          </Button>
        </div>
      )}
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
