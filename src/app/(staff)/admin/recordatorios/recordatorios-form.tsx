"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";
import { guardarAjustesRecordatorios, type AjustesRecordatorios } from "./actions";

type Clave = "estetica" | "veterinaria" | "llegada" | "listo" | "vacuna";

/** Cada tipo, con su ejemplo y el módulo que lo usa (sin el módulo prendido se ve apagado, pero se puede dejar listo). */
const TIPOS: { clave: Clave; titulo: string; detalle: string; modulos: string[] }[] = [
  { clave: "estetica", titulo: "Cita de estética", detalle: "El día anterior, con día, hora y servicio. Botones «Confirmo» y «Necesito cambiarla».", modulos: ["estetica"] },
  { clave: "listo", titulo: "Listo para recoger", detalle: "Cuando la cita de estética se termina: «… ya está listo en tu negocio».", modulos: ["estetica"] },
  { clave: "veterinaria", titulo: "Cita veterinaria", detalle: "El día anterior, con día, hora y médico. Botones «Confirmo» y «Necesito cambiarla».", modulos: ["veterinaria"] },
  { clave: "vacuna", titulo: "Próxima vacuna o desparasitación", detalle: "7 días antes de la fecha del carnet. Botones «Agendar» y «Después».", modulos: ["veterinaria"] },
  { clave: "llegada", titulo: "Llegada a hotel o guardería", detalle: "El día anterior a la llegada, con la hora a partir de la que lo recibes. Botones «Confirmo» y «Necesito cambiarla».", modulos: ["hotel", "guarderia"] },
];

export function RecordatoriosForm({ inicial, modulos }: { inicial: AjustesRecordatorios; modulos: string[] }) {
  const router = useRouter();
  const [valores, setValores] = useState<AjustesRecordatorios>(inicial);
  const guardando = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    setExito(null);
    const res = await guardando.ejecutar(() => guardarAjustesRecordatorios(valores));
    if (res.error) return setError(res.error);
    setExito(res.exito ?? "Guardado");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variante="error" titulo="No se pudo guardar">
          {error}
        </Alert>
      )}
      <fieldset className="flex flex-col gap-3 rounded-xl border border-n-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-n-900">Qué sale solo</legend>
        {TIPOS.map((t) => {
          const aplica = t.modulos.some((m) => modulos.includes(m));
          return (
            <label key={t.clave} className={`flex items-start gap-3 ${aplica ? "" : "opacity-60"}`} data-recordatorio={t.clave}>
              <input
                type="checkbox"
                className="mt-1 h-5 w-5"
                checked={valores[t.clave]}
                onChange={(e) => setValores((v) => ({ ...v, [t.clave]: e.target.checked }))}
              />
              <span>
                <span className="block font-medium text-n-900">{t.titulo}</span>
                <span className="block text-sm text-n-700">
                  {t.detalle}
                  {aplica ? "" : " No sale mientras el módulo esté apagado."}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <label className="flex flex-col gap-1 rounded-xl border border-n-200 bg-white p-4">
        <span className="text-sm font-semibold text-n-900">Hora de envío del día anterior</span>
        <input
          type="time"
          name="hora"
          min="07:00"
          max="20:00"
          step={900}
          className="w-36 rounded-lg border border-n-300 px-3 py-2"
          value={valores.hora}
          onChange={(e) => setValores((v) => ({ ...v, hora: e.target.value }))}
        />
        <span className="text-sm text-n-700">En la hora de tu negocio, de 7:00 a 20:00. El aviso de «listo» sale al terminar la cita.</span>
      </label>
      <AccionesFormulario error={error} exito={exito}>
        <Button type="button" cargando={guardando.cargando} onClick={guardar}>
          {guardando.cargando ? "Guardando…" : "Guardar recordatorios"}
        </Button>
      </AccionesFormulario>
    </div>
  );
}
