"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { dinero } from "@/components/cfdi/textos";
import { useZonaNegocio } from "@/components/zona-negocio";
import { formatearFecha, formatearFechaCalendario } from "@/lib/formato";
import { emitirGlobal } from "../facturacion-actions";

export type PeriodoGlobal = {
  desde: string;
  hasta: string;
  n_cobros: number;
  total: number;
  limite_emision: string;
  vencida: boolean;
  factura_id: string | null;
  factura_estado: string | null;
};

// La factura global al público en general: los cobros sin factura propia de un
// periodo ya cerrado. Debe salir dentro de las 24 horas siguientes al cierre.
export function BloqueGlobal({ periodos, periodicidad }: { periodos: PeriodoGlobal[]; periodicidad: string }) {
  const nombre = periodicidad === "dia" ? "diaria" : periodicidad === "semana" ? "semanal" : "mensual";
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-bold text-n-900">Factura global al público en general</h2>
        <p className="text-sm text-n-600">
          Periodicidad {nombre}. Junta los cobros que no se facturaron a nombre de nadie, con el IVA separado. Hay que emitirla dentro de las 24 horas siguientes al cierre del periodo.
        </p>
      </div>
      {periodos.length === 0 ? (
        <p className="text-sm text-menta-oscuro">No hay periodos cerrados con cobros por facturar.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {periodos.map((p) => (
            <Periodo key={`${p.desde}-${p.hasta}`} p={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Periodo({ p }: { p: PeriodoGlobal }) {
  const router = useRouter();
  const zona = useZonaNegocio();
  const envio = useEspera({ tope: 70_000 });
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  async function emitir() {
    setError(null);
    setExito(null);
    const r = await envio.ejecutar(() => emitirGlobal(p.desde, p.hasta));
    if (r.error) setError(r.error);
    else setExito(r.aviso ?? "Factura global emitida.");
    router.refresh();
  }
  return (
    <li className={`flex flex-col gap-2 rounded-md border-l-4 px-3 py-2 ${p.vencida ? "border-coral bg-coral-suave/40" : "border-ambar bg-n-50"}`}>
      <p className="font-semibold text-n-900">
        Del {formatearFechaCalendario(p.desde)} al {formatearFechaCalendario(p.hasta)} · {p.n_cobros} {p.n_cobros === 1 ? "cobro" : "cobros"} · {dinero(p.total)}
      </p>
      <p className={`text-sm ${p.vencida ? "font-semibold text-coral-oscuro" : "text-n-700"}`}>
        {p.vencida ? "Ya pasaron las 24 horas siguientes al cierre: emítela ya. Venció el " : "Hay que emitirla antes del "}
        {formatearFecha(p.limite_emision, zona)}.
        {p.factura_estado === "borrador" ? " Hay un borrador pendiente de timbrar." : ""}
        {p.factura_estado === "revisar" ? " Está por revisar: ábrela abajo." : ""}
      </p>
      {p.factura_estado !== "revisar" && p.factura_estado !== "timbrando" && (
        <AccionesFormulario error={error} exito={exito}>
          <Button type="button" cargando={envio.cargando} onClick={emitir}>
            {envio.cargando ? "Timbrando…" : p.factura_estado === "borrador" ? "Timbrar la global" : "Emitir la factura global"}
          </Button>
        </AccionesFormulario>
      )}
    </li>
  );
}
