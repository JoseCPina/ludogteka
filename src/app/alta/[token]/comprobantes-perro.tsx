"use client";

import { Field } from "@/components/ui/field";
import { hoyNegocio } from "@/lib/formato";
import { useZonaNegocio } from "@/components/zona-negocio";
import type { ComprobanteCapturado, RequisitoDePerro } from "@/lib/alta/requisitos";
import { cubierto } from "@/lib/alta/requisitos";

export type Comprobantes = Record<string, ComprobanteCapturado>;

const ETIQUETA_ESTADO: Record<RequisitoDePerro["estado"], string> = {
  sin_registro: "Sin registro",
  vencida: "Vencida",
  por_vencer: "Vigente, por vencer",
  vigente: "Vigente",
};

/**
 * Los comprobantes de vacunas y desparasitación de UN perro, en el alta.
 *
 * Un renglón por requisito que el negocio pide y que el perro no tiene
 * cubierto: fecha en que se aplicó y la foto o el PDF del carnet. Nada es
 * obligatorio para seguir —quien no tiene el carnet a la mano no se queda
 * atorado—, pero lo que no se suba queda «sin registro» y así se le dice:
 * el perro no puede reservar guardería ni hotel hasta que el negocio lo
 * tenga. Lo que sí se sube lo revisa recepción antes de contar.
 */
export function ComprobantesPerro({
  titulo,
  requisitos,
  valores,
  onCambio,
}: {
  titulo: string;
  requisitos: RequisitoDePerro[];
  valores: Comprobantes;
  // Recibe el valor COMPLETO del renglón (fecha y archivo), listo para guardar.
  onCambio: (tipoId: string, valor: ComprobanteCapturado) => void;
}) {
  const zona = useZonaNegocio();
  const hoy = hoyNegocio(zona);
  const pendientes = requisitos.filter((r) => !cubierto(r));
  const cubiertos = requisitos.filter((r) => cubierto(r));

  return (
    <div className="flex flex-col gap-4 rounded-lg border-[1.5px] border-n-200 bg-white p-4" data-comprobantes-perro>
      <h3 className="font-bold text-n-900">{titulo}</h3>
      {cubiertos.length > 0 && (
        <p className="text-sm text-n-600">
          Ya tenemos:{" "}
          {cubiertos.map((r) => `${r.etiqueta} (${r.en_revision ? "en revisión" : ETIQUETA_ESTADO[r.estado].toLowerCase()})`).join(", ")}.
        </p>
      )}
      {pendientes.map((r) => {
        const valor = valores[r.id] ?? { fecha: hoy, archivo: null };
        const esPdf = valor.archivo?.type === "application/pdf";
        return (
          <fieldset key={r.id} className="flex flex-col gap-2 rounded-md border border-n-200 p-3" data-requisito={r.clave}>
            <legend className="px-1 text-sm font-semibold text-n-900">
              {r.etiqueta}{" "}
              <span className="font-normal text-coral-oscuro">· {ETIQUETA_ESTADO[r.estado].toLowerCase()}</span>
            </legend>
            <Field
              label="Fecha en que se aplicó"
              type="date"
              max={hoy}
              value={valor.fecha}
              onChange={(e) => onCambio(r.id, { ...valor, fecha: e.target.value })}
            />
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-n-800">Foto o PDF del carnet</label>
              {/* Sin `capture`: es un documento, y el dueño casi siempre ya
                  tiene la foto del carnet en su galería. */}
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => onCambio(r.id, { ...valor, archivo: e.target.files?.[0] ?? null })}
                className="w-full rounded-md border-[1.5px] border-n-400 bg-white p-2.5 text-sm text-n-700"
              />
              {valor.archivo && (
                <p className="mt-1 text-sm text-menta-oscuro">
                  {esPdf ? "PDF listo" : "Foto lista"}: {valor.archivo.name}
                </p>
              )}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
