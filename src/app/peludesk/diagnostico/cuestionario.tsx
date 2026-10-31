"use client";

import { useEffect, useMemo, useState } from "react";
import { ReciboPorWhatsApp } from "@/components/herramientas/recibelo-por-whatsapp";
import { Selector } from "@/components/herramientas/selector";
import { registrarEventoCliente } from "@/lib/herramientas/cliente";
import { diagnosticar, preguntasDe, resumenParaBot, type Respuestas } from "@/lib/herramientas/diagnostico";
import { GIROS_MERCADO, type GiroMercado } from "@/lib/mercado/catalogo";
import { recibirPorWhatsApp } from "../herramientas/acciones";

/** /diagnostico: 10 preguntas, el puntaje, las tres recomendaciones y el dinero que se va al mes, con sus cuentas. */
export function Cuestionario({ giroInicial }: { giroInicial: GiroMercado }) {
  const [giro, setGiro] = useState<GiroMercado>(giroInicial);
  const [r, setR] = useState<Respuestas>({});
  const preguntas = preguntasDe(giro);
  const contestadas = preguntas.filter((p) => r[p.clave] !== undefined && r[p.clave] !== "").length;
  const completo = contestadas === preguntas.length;
  const d = useMemo(() => diagnosticar(giro, r), [giro, r]);
  useEffect(() => {
    if (completo) registrarEventoCliente("diagnostico", "uso", { giro });
  }, [completo, giro]);
  const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-MX")}`;
  const color = d.nivel === "verde" ? "text-menta-oscuro" : d.nivel === "ambar" ? "text-ambar-oscuro" : "text-coral-oscuro";

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="hta-regla grid gap-10 py-10 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-x-12">
        <div className="flex flex-col gap-7">
          <Selector etiqueta="Tipo de negocio" opciones={GIROS_MERCADO.map((g) => ({ clave: g.clave, nombre: g.nombre }))} valor={giro} onChange={(g) => { setGiro(g); setR({}); }} nombre="giro" />
          <ol className="flex flex-col gap-6" data-preguntas>
            {preguntas.map((p, i) => (
              <li key={p.clave} data-pregunta={p.clave}>
                <p className="font-semibold text-n-900"><span className="mr-2 text-sm font-bold text-morado">{String(i + 1).padStart(2, "0")}</span>{p.texto}</p>
                {p.tipo === "numero" ? (
                  <div className="mt-2 flex items-center gap-2">
                    <input aria-label={p.texto} inputMode="numeric" className="hta-campo max-w-[9rem]" value={r[p.clave] ?? ""} onChange={(e) => setR({ ...r, [p.clave]: e.target.value.replace(/[^\d.]/g, "").slice(0, 7) })} />
                    <span className="text-sm text-n-600">{p.unidad}</span>
                  </div>
                ) : (
                  <div role="radiogroup" aria-label={p.texto} className="mt-2 flex flex-wrap gap-2">
                    {p.opciones!.map((o) => (
                      <button key={o.clave} type="button" role="radio" aria-checked={r[p.clave] === o.clave} className="hta-opcion" onClick={() => setR({ ...r, [p.clave]: o.clave })} data-sin-bloqueo>{o.nombre}</button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-col gap-6 md:sticky md:top-20 md:self-start" aria-live="polite" data-diagnostico data-completo={completo ? "1" : undefined}>
          {!completo ? (
            <div>
              <p className="hta-etiqueta">Tu diagnóstico</p>
              <p className="hta-cifra text-n-400">{contestadas}<small> de {preguntas.length}</small></p>
              <p className="mt-2 text-n-700">Contesta las diez y aquí sale tu puntaje, las tres cosas que más te conviene cambiar y cuánto dinero se te está yendo al mes, con tus números.</p>
            </div>
          ) : (
            <>
              <div>
                <p className="hta-etiqueta">Puntaje</p>
                <p className={`hta-cifra ${color}`} data-puntaje={d.puntaje}>{d.puntaje}<small> de 100</small></p>
              </div>
              <div>
                <p className="hta-etiqueta">Dinero que se va al mes</p>
                <p className="hta-cifra" data-fuga>{pesos(d.fugaMensual)}</p>
                {d.lineas.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-2 text-sm text-n-700">
                    {d.lineas.map((l) => (
                      <li key={l.concepto} className="border-t border-n-200 pt-2"><b className="text-n-900">{pesos(l.monto)}</b> · {l.concepto}<br /><span className="text-xs text-n-600">Cómo: {l.como}</span></li>
                    ))}
                  </ul>
                )}
                {d.lineas.length === 0 && <p className="mt-2 text-sm text-n-700">Con tus respuestas no detectamos fugas grandes.</p>}
              </div>
              <div>
                <p className="hta-etiqueta">Lo que más te conviene cambiar</p>
                <ol className="mt-2 flex flex-col gap-3">
                  {d.recomendaciones.map((x, i) => (
                    <li key={x.titulo} className="flex gap-3">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-menta text-sm font-bold text-morado">{i + 1}</span>
                      <span><b className="text-n-900">{x.titulo}.</b> <span className="text-n-700">{x.texto}</span></span>
                    </li>
                  ))}
                  {d.recomendaciones.length === 0 && <li className="text-n-700">Vas bien: lo que sigue es medir cada mes.</li>}
                </ol>
              </div>
              <p className="text-xs leading-relaxed text-n-600">Las cuentas usan supuestos conservadores que se dicen en cada línea (lo que recupera un recordatorio, la merma de una caja sin corte, clientes nuevos por semana). No son una promesa: son para que veas de dónde sale cada peso.</p>
            </>
          )}
        </div>
      </section>

      {completo && (
        <section className="hta-regla grid gap-8 py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-x-12">
          <ReciboPorWhatsApp
            herramienta="diagnostico"
            accion={recibirPorWhatsApp}
            resumen={`Tu diagnóstico: ${d.puntaje} de 100. Se te van cerca de ${pesos(d.fugaMensual)} al mes. Lo primero: ${d.recomendaciones[0]?.titulo.toLowerCase() ?? "medir cada mes"}.`}
            ruta={`/diagnostico?giro=${giro}`}
            giro={giro}
            ciudad={null}
            datos={{ giro, respuestas: r, puntaje: d.puntaje, fuga_mensual: Math.round(d.fugaMensual), recomendaciones: d.recomendaciones.map((x) => x.titulo), resumen_bot: resumenParaBot(giro, r, d) }}
            titulo="Recibe tu reporte completo por WhatsApp"
            texto="Te mandamos el puntaje, las cuentas de cada fuga y las tres recomendaciones."
          />
          <div className="text-sm leading-relaxed text-n-600">
            <p className="hta-etiqueta">Con PeluDesk</p>
            <p>Las tres recomendaciones son lo que PeluDesk hace solo: recordatorio con confirmación, caja con corte de turno y el portal donde el cliente ve a su mascota. 15 días gratis, sin tarjeta.</p>
          </div>
        </section>
      )}
    </div>
  );
}
