"use client";

import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormularioAccion } from "@/components/formulario-accion";
import { formatearFechaCalendario } from "@/lib/formato";
import type { MedicoOpcion, ProductoConLotes } from "@/lib/veterinaria/lotes";
import { TIPOS_CONSENTIMIENTO } from "@/lib/veterinaria/carnet";
import {
  agregarCargoHospitalizacion,
  aplicarDosis,
  darAlta,
  indicarMedicacion,
  nuevoConsentimiento,
  omitirDosis,
  registrarMonitoreo,
  suspenderMedicacion,
} from "../actions";

const cuadro = "rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4";

export function FormularioMedicacion({
  hospId, productos, medicos, medicoPropio, ahoraLocal,
}: { hospId: string; productos: ProductoConLotes[]; medicos: MedicoOpcion[]; medicoPropio: string | null; ahoraLocal: string }) {
  return (
    <FormularioAccion accion={(fd) => indicarMedicacion(hospId, fd)} textoBoton="Indicar medicación" reiniciar className={cuadro}>
      <div className="grid gap-3 sm:grid-cols-2">
        {productos.length > 0 && (
          <Select label="Medicamento del inventario (opcional)" name="insumo_id" defaultValue="" ayuda="Si lo eliges, al aplicar se descuenta de su lote.">
            <option value="">— Lo escribo yo —</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        )}
        <Field label="Medicamento (si no lo elegiste de la lista)" name="producto" />
        <Field label="Dosis" name="dosis" required placeholder="0.5 mL" />
        <Field label="Vía" name="via" placeholder="IV, SC, oral…" />
        <Field label="Primera dosis" name="primera" type="datetime-local" defaultValue={ahoraLocal} required />
        <Field label="Cada cuántas horas" name="frecuencia_horas" type="number" min={1} max={168} ayuda="Déjalo vacío si es una sola dosis." />
        <Field label="Número de dosis" name="num_dosis" type="number" min={1} max={200} defaultValue={1} />
        <Field label="Precio por dosis (opcional)" name="precio_dosis" type="number" min={0} step="0.01" ayuda="Si lo pones, cada dosis aplicada se cobra en la cuenta." />
        <Select label="Médico que indica" name="medico_id" defaultValue={medicoPropio ?? ""} required>
          <option value="">— Elige —</option>
          {medicos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </Select>
      </div>
      <Textarea label="Indicaciones (opcional)" name="indicaciones" rows={2} />
    </FormularioAccion>
  );
}

/** Marcar una dosis como aplicada (quién y cuándo los pone la base) o como no aplicada. */
export function AccionesDosis({ hospId, dosisId, insumoId, productos }: { hospId: string; dosisId: string; insumoId: string | null; productos: ProductoConLotes[] }) {
  const [modo, setModo] = useState<null | "aplicar" | "omitir">(null);
  const [loteId, setLoteId] = useState("");
  const candidatos = insumoId ? productos.filter((p) => p.id === insumoId) : productos;
  const lotes = candidatos.flatMap((p) => p.lotes.map((l) => ({ ...l, producto: p.nombre })));
  if (!modo) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-10 px-3 text-sm" onClick={() => setModo("aplicar")}>
          Aplicar
        </Button>
        <Button type="button" variante="secundario" className="min-h-10 px-3 text-sm" onClick={() => setModo("omitir")}>
          No se aplicó
        </Button>
      </div>
    );
  }
  const cancelar = (
    <Button type="button" variante="secundario" onClick={() => setModo(null)}>
      Cancelar
    </Button>
  );
  if (modo === "omitir") {
    return (
      <FormularioAccion accion={(fd) => omitirDosis(hospId, dosisId, fd)} textoBoton="Marcar como no aplicada" variante="secundario" className={cuadro} otrosBotones={cancelar}>
        <Field label="Por qué no se aplicó" name="motivo" required />
      </FormularioAccion>
    );
  }
  return (
    <FormularioAccion accion={(fd) => aplicarDosis(hospId, dosisId, fd)} textoBoton="Confirmar: ya se aplicó" className={cuadro} otrosBotones={cancelar}>
      {lotes.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Lote" name="lote_id" value={loteId} onChange={(e) => setLoteId(e.target.value)} ayuda="Descuenta del inventario clínico.">
            <option value="">— Sin lote del inventario —</option>
            {lotes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.producto} · {l.codigo}
                {l.caducidad ? ` · caduca ${formatearFechaCalendario(l.caducidad)}` : ""} · {l.dosis.toLocaleString("es-MX")} dosis
              </option>
            ))}
          </Select>
          {loteId && <Field label="Cantidad que se descuenta" name="cantidad" type="number" min={0} step="0.01" defaultValue={1} ayuda="En la unidad de consumo del producto." />}
        </div>
      ) : (
        <p className="text-sm text-n-600">No hay lotes con existencia para este medicamento: la dosis queda registrada sin descontar inventario.</p>
      )}
      <Field label="Nota (opcional)" name="nota" />
    </FormularioAccion>
  );
}

export function SuspenderMedicacion({ hospId, medicacionId }: { hospId: string; medicacionId: string }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) {
    return (
      <button type="button" className="text-sm font-semibold text-coral-oscuro hover:underline" onClick={() => setAbierto(true)}>
        Suspender esta medicación
      </button>
    );
  }
  return (
    <FormularioAccion
      accion={(fd) => suspenderMedicacion(hospId, medicacionId, fd)}
      textoBoton="Suspender"
      variante="peligro"
      className={cuadro}
      otrosBotones={
        <Button type="button" variante="secundario" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      }
    >
      <Field label="Motivo" name="motivo" required ayuda="Las dosis que faltaban quedan como no aplicadas." />
    </FormularioAccion>
  );
}

export function FormularioMonitoreo({ hospId }: { hospId: string }) {
  return (
    <FormularioAccion accion={(fd) => registrarMonitoreo(hospId, fd)} textoBoton="Registrar monitoreo" reiniciar className={cuadro}>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Temperatura (°C)" name="temperatura" type="number" step="0.1" min={30} max={45} />
        <Field label="Peso (kg)" name="peso" type="number" step="0.01" min={0} />
        <Field label="Frec. cardiaca (lpm)" name="fc" type="number" min={10} max={400} />
        <Field label="Frec. respiratoria (rpm)" name="fr" type="number" min={2} max={200} />
      </div>
      <Textarea label="Notas del turno" name="notas" rows={2} />
    </FormularioAccion>
  );
}

export function FormularioCargo({ hospId }: { hospId: string }) {
  return (
    <FormularioAccion accion={(fd) => agregarCargoHospitalizacion(hospId, fd)} textoBoton="Agregar a la cuenta" reiniciar className={cuadro}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select label="Tipo" name="tipo" defaultValue="procedimiento">
          <option value="procedimiento">Procedimiento o estudio</option>
          <option value="otro">Otro concepto</option>
        </Select>
        <Field label="Qué se cobra" name="descripcion" required placeholder="Radiografía, curación…" />
        <Field label="Importe" name="importe" type="number" min={0.01} step="0.01" required />
      </div>
    </FormularioAccion>
  );
}

export function FormularioAlta({ hospId }: { hospId: string }) {
  return (
    <FormularioAccion accion={(fd) => darAlta(hospId, fd)} textoBoton="Dar de alta" variante="exito" className={cuadro}>
      <Textarea label="Resumen del alta" name="resumen" rows={4} required ayuda="Cómo sale la mascota, tratamiento a seguir en casa, cuándo volver. Al dar el alta se completan los días, se cierran las dosis pendientes y el depósito se aplica a la cuenta." />
    </FormularioAccion>
  );
}

export function NuevoConsentimiento({ perroId, hospId, medicos, medicoPropio }: { perroId: string; hospId: string | null; medicos: MedicoOpcion[]; medicoPropio: string | null }) {
  return (
    <FormularioAccion accion={(fd) => nuevoConsentimiento(perroId, hospId, fd)} textoBoton="Crear y firmar" className={cuadro}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select label="Tipo" name="tipo" defaultValue="hospitalizacion">
          {TIPOS_CONSENTIMIENTO.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.etiqueta}
            </option>
          ))}
        </Select>
        <Field label="Procedimiento (cirugía o anestesia)" name="procedimiento" placeholder="Esterilización" />
        <Select label="Médico responsable" name="medico_id" defaultValue={medicoPropio ?? ""} required>
          <option value="">— Elige —</option>
          {medicos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </Select>
      </div>
    </FormularioAccion>
  );
}
