"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { guardarTopeRecordatorios } from "@/app/(staff)/admin/recordatorios/actions";

export type UsoRecordatorios = {
  mes: string;
  enviados: number;
  entregados: number;
  gratis: number;
  excedentes: number;
  precio: number | null;
  excedente_mxn: number;
  tope: number | null;
  pausados: number;
  estado_cobro: string | null;
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const pesos = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Recordatorios por WhatsApp en «Módulos y plan»: los del mes, los gratis que quedan, el excedente con su costo
 * estimado, el precio por mensaje y el tope (solo el admin lo cambia).
 */
export function UsoRecordatoriosPanel({ uso, puedeCambiarTope }: { uso: UsoRecordatorios; puedeCambiarTope: boolean }) {
  const router = useRouter();
  const guardando = useEspera();
  const [sinTope, setSinTope] = useState(uso.tope === null);
  const [tope, setTope] = useState(uso.tope === null ? "200" : String(uso.tope));
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [, m] = uso.mes.split("-").map(Number);
  const gratisRestantes = Math.max(0, uso.gratis - uso.entregados);
  const pagado = uso.estado_cobro === "al_corriente" || uso.estado_cobro === "gracia";
  const exento = uso.estado_cobro === "exento";

  async function guardar() {
    setError(null);
    setExito(null);
    const valor = sinTope ? null : Number(tope.replace(/[$,\s]/g, ""));
    if (valor !== null && !Number.isFinite(valor)) return setError("Escribe el tope en pesos, por ejemplo 200.");
    const res = await guardando.ejecutar(() => guardarTopeRecordatorios(valor));
    if (res.error) return setError(res.error);
    setExito(res.exito ?? "Guardado");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-n-200 bg-white p-4" data-uso-recordatorios>
      <h2 className="text-lg font-semibold text-n-900">Recordatorios por WhatsApp</h2>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-n-600">Entregados en {MESES[(m ?? 1) - 1]}</dt>
          <dd className="text-xl font-bold text-n-900" data-uso-entregados>{uso.entregados}</dd>
        </div>
        <div>
          <dt className="text-n-600">Gratis que quedan</dt>
          <dd className="text-xl font-bold text-n-900" data-uso-gratis>{exento ? "Sin límite" : `${gratisRestantes} de ${uso.gratis}`}</dd>
        </div>
        <div>
          <dt className="text-n-600">Adicionales</dt>
          <dd className="text-xl font-bold text-n-900" data-uso-excedentes>{uso.excedentes}</dd>
        </div>
        <div>
          <dt className="text-n-600">Costo estimado del mes</dt>
          <dd className="text-xl font-bold text-n-900" data-uso-costo>{pesos(uso.excedente_mxn)} <span className="text-xs font-normal text-n-600">+ IVA</span></dd>
        </div>
      </dl>
      <p className="text-sm text-n-700">
        {uso.precio !== null ? `${uso.gratis} entregados gratis al mes; cada adicional cuesta ${pesos(uso.precio)} + IVA y se cobra en tu factura mensual.` : "Cada mes tienes recordatorios gratis; los adicionales se cobran en tu factura mensual."}{" "}
        Los que no se entregan no cuentan.
        {!pagado && !exento && " Mientras no tengas tu plan contratado, al llegar a los gratis los recordatorios se pausan hasta el mes que entra."}
      </p>
      {uso.pausados > 0 && (
        <p className="rounded-lg bg-ambar-suave p-2 text-sm text-ambar-oscuro" data-uso-pausados>
          {uso.pausados === 1 ? "Un recordatorio está en pausa" : `${uso.pausados} recordatorios están en pausa`} este mes.{" "}
          {pagado ? "Sube o quita el tope para que sigan saliendo." : "Contrata tu plan para que sigan saliendo."}
        </p>
      )}
      {pagado && (
        <div className="flex flex-col gap-2 border-t border-n-100 pt-3">
          <p className="text-sm font-semibold text-n-900">Tope mensual de adicionales</p>
          {puedeCambiarTope ? (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sinTope} onChange={(e) => setSinTope(e.target.checked)} />
                Sin tope
              </label>
              {!sinTope && (
                <label className="flex items-center gap-2 text-sm">
                  $
                  <input
                    inputMode="decimal"
                    className="w-28 rounded-lg border border-n-300 px-3 py-2"
                    value={tope}
                    onChange={(e) => setTope(e.target.value)}
                    aria-label="Tope mensual en pesos"
                  />
                  + IVA al mes. Al llegar, los recordatorios se pausan y te avisamos.
                </label>
              )}
              <AccionesFormulario error={error} exito={exito}>
                <Button type="button" variante="secundario" cargando={guardando.cargando} onClick={guardar}>
                  Guardar tope
                </Button>
              </AccionesFormulario>
            </>
          ) : (
            <p className="text-sm text-n-700">{uso.tope === null ? "Sin tope." : `${pesos(uso.tope)} + IVA al mes.`} Solo el administrador lo cambia.</p>
          )}
        </div>
      )}
    </section>
  );
}
