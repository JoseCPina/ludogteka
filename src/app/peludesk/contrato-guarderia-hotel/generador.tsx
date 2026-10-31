"use client";

import { useEffect, useMemo, useState } from "react";
import { ReciboPorWhatsApp } from "@/components/herramientas/recibelo-por-whatsapp";
import { Selector } from "@/components/herramientas/selector";
import { Button } from "@/components/ui/button";
import { useEspera } from "@/hooks/use-espera";
import { registrarEventoCliente } from "@/lib/herramientas/cliente";
import { descargar } from "@/lib/herramientas/dibujar-lista";
import { TIPOS_CONTRATO, cuerpoContrato, cuerpoParaPdf, eleccionesPorOmision, politicasDe, resumenContrato, tituloContrato, type TipoContrato } from "@/lib/herramientas/contrato-generador";
import { recibirPorWhatsApp } from "../herramientas/acciones";

/**
 * /contrato-guarderia-hotel: tipo (hotel, guardería o estética) → nombre, ciudad, horario → una opción por política,
 * con el texto ya redactado → vista previa del contrato completo → PDF con su nombre (pdf-lib en el navegador). Al
 * dejar el WhatsApp, el contrato queda para precargarse en su cuenta y que sus clientes lo firmen desde el celular.
 */
const slugDeNombre = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function GeneradorContrato({ tipoInicial }: { tipoInicial: TipoContrato }) {
  const [tipo, setTipo] = useState<TipoContrato>(tipoInicial);
  const [negocio, setNegocio] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [horario, setHorario] = useState("");
  const [elecciones, setElecciones] = useState<Record<string, string>>(() => eleccionesPorOmision(tipoInicial));
  const [verTodo, setVerTodo] = useState(false);
  const bajando = useEspera();
  const datos = useMemo(() => ({ tipo, negocio, ciudad, horario, elecciones }), [tipo, negocio, ciudad, horario, elecciones]);
  const titulo = tituloContrato(datos);
  const cuerpo = useMemo(() => cuerpoContrato(datos), [datos]);
  const politicas = politicasDe(tipo);

  const cambiarTipo = (t: TipoContrato) => {
    setTipo(t);
    setElecciones((e) => ({ ...eleccionesPorOmision(t), ...Object.fromEntries(Object.entries(e).filter(([k]) => politicasDe(t).some((p) => p.clave === k))) }));
  };

  useEffect(() => {
    if (negocio.trim().length >= 3) registrarEventoCliente("contrato", "uso", { giro: tipo });
  }, [negocio, tipo]);

  const bajarPdf = () =>
    bajando.correr(async () => {
      const { generarPdfContrato } = await import("@/lib/contratos/generar-pdf");
      const bytes = await generarPdfContrato({ titulo, cuerpo: cuerpoParaPdf(cuerpo) });
      descargar(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), `${tipo === "estetica" ? "condiciones-estetica" : `contrato-${tipo}`}-${slugDeNombre(negocio) || "mi-negocio"}.pdf`);
    });

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="hta-regla grid gap-8 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-x-12">
        <div className="flex flex-col gap-6">
          <Selector etiqueta="Tipo de documento" opciones={TIPOS_CONTRATO.map((t) => ({ clave: t.clave, nombre: t.nombre, detalle: t.detalle }))} valor={tipo} onChange={cambiarTipo} nombre="tipo" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ct-negocio" className="hta-etiqueta">Nombre del negocio</label>
              <input id="ct-negocio" className="hta-campo" value={negocio} onChange={(e) => setNegocio(e.target.value.slice(0, 80))} placeholder="Como aparece en tu letrero" />
            </div>
            <div>
              <label htmlFor="ct-ciudad" className="hta-etiqueta">Ciudad (opcional)</label>
              <input id="ct-ciudad" className="hta-campo" value={ciudad} onChange={(e) => setCiudad(e.target.value.slice(0, 60))} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="ct-horario" className="hta-etiqueta">Horario de entrega y recogida (opcional)</label>
              <input id="ct-horario" className="hta-campo" value={horario} onChange={(e) => setHorario(e.target.value.slice(0, 160))} placeholder="lunes a sábado de 8:00 a 19:00" />
            </div>
          </div>
          {politicas.map((p) => (
            <div key={p.clave} data-politica={p.clave}>
              <Selector etiqueta={p.titulo} opciones={p.opciones.map((o) => ({ clave: o.clave, nombre: o.nombre }))} valor={elecciones[p.clave] ?? p.opciones[0].clave} onChange={(v) => setElecciones((e) => ({ ...e, [p.clave]: v }))} nombre={p.clave} />
              <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-n-700">{(p.opciones.find((o) => o.clave === elecciones[p.clave]) ?? p.opciones[0]).texto.replace(/\{\{negocio\}\}/g, negocio.trim() || "tu negocio")}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-4 md:sticky md:top-20 md:self-start">
          <p className="hta-etiqueta">Vista previa</p>
          <article className={`rounded-xl border border-n-200 bg-white p-5 text-[13px] leading-relaxed text-n-800 sm:p-6 ${verTodo ? "" : "max-h-[32rem] overflow-hidden"} relative`} data-vista-contrato>
            <h2 className="text-base font-bold text-n-900">{titulo}</h2>
            <pre className="mt-3 whitespace-pre-wrap font-sans">{cuerpoParaPdf(cuerpo)}</pre>
            {!verTodo && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white" aria-hidden />}
          </article>
          <button type="button" className="hta-enlace self-start text-sm" onClick={() => setVerTodo((v) => !v)} data-sin-bloqueo>{verTodo ? "Ver menos" : "Ver el contrato completo"}</button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" sinBloqueo cargando={bajando.cargando} onClick={bajarPdf} data-bajar-contrato>Bajar PDF con mi nombre</Button>
          </div>
          <p className="text-sm text-n-600">{tipo === "estetica" ? "Una hoja de condiciones para pegar en el mostrador o mandar por WhatsApp." : "Las líneas en blanco son los datos del cliente y del perro; en PeluDesk se llenan solos y el dueño firma desde su celular."}</p>
        </div>
      </section>

      <section className="hta-regla grid gap-8 py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-x-12">
        <ReciboPorWhatsApp
          herramienta="contrato"
          accion={recibirPorWhatsApp}
          resumen={resumenContrato(datos)}
          ruta={`/contrato-guarderia-hotel?tipo=${tipo}`}
          giro={tipo}
          ciudad={null}
          datos={{ tipo, negocio, ciudad, horario, elecciones, titulo, cuerpo }}
          titulo="Guarda tu contrato por WhatsApp"
          texto={tipo === "estetica" ? "Te mandamos el resumen de tus condiciones." : "Te mandamos el resumen y, si abres tu prueba de PeluDesk con este número, el contrato ya está publicado en tu cuenta: tus clientes lo firman desde su celular al dar de alta a su perro."}
        />
        <div className="text-sm leading-relaxed text-n-600">
          <p className="hta-etiqueta">De dónde sale</p>
          <p>De la plantilla general de contrato de PeluDesk, escrita con la estructura del contrato real de un negocio que la usa, sin sus datos. Cada política tiene opciones redactadas en español de México; ninguna cláusula se interpreta en contra de los derechos irrenunciables del consumidor. No sustituye la revisión de un abogado para tu caso.</p>
        </div>
      </section>
    </div>
  );
}
