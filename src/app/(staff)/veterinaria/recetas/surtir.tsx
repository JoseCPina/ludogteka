"use client";

import { unidadSegunCantidad } from "@/lib/formato";
import { FormularioAccion } from "@/components/formulario-accion";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { surtirControlado } from "./actions";

export type LoteSurtir = { id: string; codigo: string; caducidad: string | null; dosis: number };

/** Saca producto de un lote contra un documento (receta, folio del SITPV o recetario especial): queda en el libro de control. */
export function SurtirDocumento({
  tipo, docId, lotes, unidad, pacientes, etiquetaPaciente = "Paciente",
}: {
  tipo: "receta" | "espejo" | "recetario";
  docId: string;
  lotes: LoteSurtir[];
  unidad: string | null;
  pacientes?: { perro_id: string; nombre: string }[];
  etiquetaPaciente?: string;
}) {
  if (lotes.length === 0) {
    return <p className="rounded-md bg-ambar-suave px-3 py-2 text-sm text-ambar-oscuro">Este producto no tiene lotes con existencia vigente. Registra la entrada en Inventario clínico.</p>;
  }
  return (
    <FormularioAccion accion={surtirControlado.bind(null, tipo, docId)} textoBoton="Registrar salida" textoExito="Salida registrada" reiniciar className="rounded-md border border-n-200 bg-n-50 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Select label="Lote" name="lote_id" required>
          {lotes.map((l) => (
            <option key={l.id} value={l.id}>{l.codigo} · {l.dosis} {unidadSegunCantidad(l.dosis, unidad)}{l.caducidad ? ` · caduca ${l.caducidad}` : ""}</option>
          ))}
        </Select>
        <Field label={`Cantidad${unidad ? ` (${unidad})` : ""}`} name="cantidad" inputMode="decimal" required ayuda="Un número, con o sin unidad (2 o 2 ml)." />
        {pacientes && pacientes.length > 0 ? (
          <Select label={`${etiquetaPaciente} (opcional)`} name="perro_id">
            <option value="">— Sin paciente —</option>
            {pacientes.map((p) => (
              <option key={p.perro_id} value={p.perro_id}>{p.nombre}</option>
            ))}
          </Select>
        ) : (
          <input type="hidden" name="perro_id" value="" />
        )}
      </div>
      <Field label="Nota (opcional)" name="motivo" />
    </FormularioAccion>
  );
}
