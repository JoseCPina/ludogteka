"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ReciboPorWhatsApp } from "@/components/herramientas/recibelo-por-whatsapp";
import { registrarEventoCliente } from "@/lib/herramientas/cliente";
import { ESQUEMAS_POR_OMISION, SEMANA_EJEMPLO, calcular, lectura, pesos, serviciosSemana, totalSemana, type Esquemas, type RenglonSemana } from "@/lib/herramientas/comisiones";
import { recibirPorWhatsApp } from "../herramientas/acciones";

/** /comisiones-groomers: la semana de servicios, los tres esquemas y la comparación. Todo en el navegador. */
export function CalculadoraComisiones() {
  const [renglones, setRenglones] = useState<RenglonSemana[]>(SEMANA_EJEMPLO);
  const [e, setE] = useState<Esquemas>(ESQUEMAS_POR_OMISION);
  const [tocado, setTocado] = useState(false);
  const res = useMemo(() => calcular(renglones, e), [renglones, e]);
  const total = totalSemana(renglones);
  const n = serviciosSemana(renglones);
  const editar = (i: number, cambios: Partial<RenglonSemana>) => {
    setTocado(true);
    setRenglones((l) => l.map((r, k) => (k === i ? { ...r, ...cambios } : r)));
  };
  useEffect(() => {
    if (tocado) registrarEventoCliente("comisiones", "uso", { giro: "estetica" });
  }, [tocado]);
  const num = (v: string) => Number(v.replace(/[^\d.]/g, "")) || 0;
  const resumen = `Semana de ${n} servicios (${pesos(total)}): por porcentaje ${pesos(res[0].estilista)} para la estilista; pago fijo por servicio ${pesos(res[1].estilista)}; sueldo más comisión ${pesos(res[2].estilista)}.`;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="hta-regla grid gap-8 py-10 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-x-12">
        <div className="flex flex-col gap-6">
          <div>
            <p className="hta-etiqueta">Servicios de la semana</p>
            <div className="hidden grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_6rem_2.5rem] gap-2 text-xs font-bold uppercase tracking-wide text-n-600 sm:grid">
              <span>Servicio</span><span>Precio</span><span>Cuántos</span><span>Pago fijo</span><span />
            </div>
            <ul className="mt-2 flex flex-col gap-2" data-semana>
              {renglones.map((r, i) => (
                <li key={i} className="grid grid-cols-2 gap-2 rounded-xl bg-white p-2 ring-1 ring-n-200 sm:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_6rem_2.5rem] sm:items-center sm:rounded-none sm:bg-transparent sm:p-0 sm:ring-0">
                  <input aria-label={`Servicio ${i + 1}`} className="hta-campo col-span-2 min-h-11 text-base sm:col-span-1" value={r.nombre} onChange={(ev) => editar(i, { nombre: ev.target.value.slice(0, 60) })} />
                  <label className="flex items-center gap-1 text-sm text-n-600 sm:contents"><span className="sm:hidden">Precio $</span><input aria-label="Precio" inputMode="numeric" className="hta-campo min-h-11 text-base" value={r.precio || ""} onChange={(ev) => editar(i, { precio: num(ev.target.value) })} /></label>
                  <label className="flex items-center gap-1 text-sm text-n-600 sm:contents"><span className="sm:hidden">Cuántos</span><input aria-label="Cuántos" inputMode="numeric" className="hta-campo min-h-11 text-base" value={r.cantidad || ""} onChange={(ev) => editar(i, { cantidad: num(ev.target.value) })} /></label>
                  <label className="flex items-center gap-1 text-sm text-n-600 sm:contents"><span className="sm:hidden">Pago fijo $</span><input aria-label="Pago fijo a la estilista" inputMode="numeric" className="hta-campo min-h-11 text-base" value={r.pagoFijo || ""} onChange={(ev) => editar(i, { pagoFijo: num(ev.target.value) })} /></label>
                  <button type="button" aria-label="Quitar" className="justify-self-end rounded-md px-3 text-n-600 hover:bg-n-100 sm:h-11" onClick={() => setRenglones((l) => l.filter((_, k) => k !== i))} data-sin-bloqueo>×</button>
                </li>
              ))}
            </ul>
            <button type="button" className="hta-opcion mt-3" onClick={() => setRenglones((l) => [...l, { nombre: "", precio: 0, cantidad: 1, pagoFijo: 0 }])} data-sin-bloqueo>+ Agregar servicio</button>
            <p className="mt-2 text-sm text-n-600">«Pago fijo» es lo que le pagas por cada servicio en el esquema por servicio.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="c-pct" className="hta-etiqueta">Porcentaje para la estilista</label>
              <div className="flex items-center gap-2"><input id="c-pct" inputMode="numeric" className="hta-campo min-h-11" value={e.porcentaje} onChange={(ev) => { setTocado(true); setE({ ...e, porcentaje: Math.min(100, num(ev.target.value)) }); }} /><span className="text-n-600">%</span></div>
            </div>
            <div>
              <label htmlFor="c-sueldo" className="hta-etiqueta">Sueldo fijo a la semana</label>
              <div className="flex items-center gap-2"><span className="text-n-600">$</span><input id="c-sueldo" inputMode="numeric" className="hta-campo min-h-11" value={e.sueldo} onChange={(ev) => { setTocado(true); setE({ ...e, sueldo: num(ev.target.value) }); }} /></div>
            </div>
            <div>
              <label htmlFor="c-com" className="hta-etiqueta">Comisión sobre lo producido</label>
              <div className="flex items-center gap-2"><input id="c-com" inputMode="numeric" className="hta-campo min-h-11" value={e.comisionSobreSueldo} onChange={(ev) => { setTocado(true); setE({ ...e, comisionSobreSueldo: Math.min(100, num(ev.target.value)) }); }} /><span className="text-n-600">%</span></div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6 md:sticky md:top-20 md:self-start" aria-live="polite" data-resultados>
          <div>
            <p className="hta-etiqueta">La semana</p>
            <p className="hta-cifra">{pesos(total)}<small> en {n} servicios</small></p>
          </div>
          <table className="w-full text-left text-sm">
            <thead><tr className="text-xs font-bold uppercase tracking-wide text-n-600"><th className="py-2 font-bold">Esquema</th><th className="py-2 text-right font-bold">Estilista</th><th className="py-2 text-right font-bold">Negocio</th><th className="py-2 text-right font-bold">%</th></tr></thead>
            <tbody>
              {res.map((r) => (
                <tr key={r.clave} className="border-t border-n-200" data-esquema={r.clave}>
                  <td className="py-3 pr-2"><b className="text-n-900">{r.nombre}</b><br /><span className="text-xs text-n-600">{r.detalle}</span></td>
                  <td className="py-3 text-right text-lg font-bold tabular-nums text-n-900">{pesos(r.estilista)}</td>
                  <td className="py-3 text-right tabular-nums text-n-800">{pesos(r.negocio)}</td>
                  <td className="py-3 text-right tabular-nums text-n-600">{r.porcentajeReal.toFixed(0)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="rounded-xl bg-morado-suave px-4 py-3 text-n-900">{lectura(res)}</p>
          <p className="text-sm text-n-600">Sin IMSS, impuestos ni propinas: es la comparación de los esquemas con la misma semana. Las propinas son aparte y son de la estilista.</p>
        </div>
      </section>

      <section className="hta-regla grid gap-8 py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-x-12">
        <ReciboPorWhatsApp herramienta="comisiones" accion={recibirPorWhatsApp} resumen={resumen} ruta="/comisiones-groomers" giro="estetica" ciudad={null} datos={{ esquemas: e, semana: renglones, resultados: res.map((r) => ({ clave: r.clave, estilista: Math.round(r.estilista), negocio: Math.round(r.negocio) })) }} titulo="Guarda la comparación por WhatsApp" texto="Te mandamos los tres esquemas con tu semana para que los compares con tu estilista." />
        <div className="text-sm leading-relaxed text-n-600">
          <p className="hta-etiqueta">En PeluDesk</p>
          <p>Cada cita terminada suma la comisión de la estilista con el esquema que elijas, las propinas van aparte y la nómina de la semana sale sola, con adelantos y descuentos. <Link href="/ayuda" className="hta-enlace">Cómo se configuran comisiones y nómina</Link>.</p>
        </div>
      </section>
    </div>
  );
}
