"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { BarraRango } from "@/components/herramientas/barra-rango";
import { BuscadorCiudad } from "@/components/herramientas/buscador-ciudad";
import { Compartir } from "@/components/herramientas/compartir";
import { ReciboPorWhatsApp } from "@/components/herramientas/recibelo-por-whatsapp";
import { Resultado } from "@/components/herramientas/resultado";
import { Selector } from "@/components/herramientas/selector";
import { registrarEventoCliente } from "@/lib/herramientas/cliente";
import { herramientaPorClave } from "@/lib/herramientas/lista";
import { GIROS_MERCADO, SERVICIO_PRINCIPAL, TALLAS, mesEnTexto, pesosMercado, posicionEnRango, servicioMercado, serviciosDeGiro, textoPosicion, type GiroMercado, type Rango, type Talla } from "@/lib/mercado/catalogo";
import type { CiudadMercado } from "@/lib/mercado/ciudades";
import { consultarRango, recibirPorWhatsApp } from "../herramientas/acciones";

/**
 * La herramienta /precios-mercado: giro → servicio → ciudad (→ talla), el rango con su barra, «¿Cuánto cobras tú?»
 * que ubica el precio sin pedir nada, y después la captura por WhatsApp. La dirección guarda la consulta
 * (?giro=&servicio=&ciudad=&talla=) para que el link se comparta tal cual.
 */
type Inicial = { giro: GiroMercado; servicio: string; ciudad: CiudadMercado | null; talla: Talla | null; rango: Rango; frase: string };

const rutaDe = (giro: string, servicio: string, ciudad: CiudadMercado | null, talla: Talla | null, precio?: number | null) => {
  const q = new URLSearchParams({ giro, servicio });
  if (ciudad) q.set("ciudad", ciudad.slug);
  if (talla) q.set("talla", talla);
  if (precio) q.set("precio", String(precio));
  return `/precios-mercado?${q}`;
};

export function IndicePrecios({ inicial, precioInicial }: { inicial: Inicial; precioInicial: number | null }) {
  const [giro, setGiro] = useState<GiroMercado>(inicial.giro);
  const [servicio, setServicio] = useState(inicial.servicio);
  const [ciudad, setCiudad] = useState<CiudadMercado | null>(inicial.ciudad);
  const [talla, setTalla] = useState<Talla | null>(inicial.talla);
  const [rango, setRango] = useState<Rango>(inicial.rango);
  const [frase, setFrase] = useState(inicial.frase);
  const [precioTexto, setPrecioTexto] = useState(precioInicial ? String(precioInicial) : "");
  const [pendiente, empezar] = useTransition();
  const primera = useRef(true);
  const s = servicioMercado(servicio)!;
  const precio = Number(precioTexto.replace(/[^\d.]/g, "")) || null;
  const ruta = rutaDe(giro, servicio, ciudad, s.conTalla ? talla : null, precio);
  const calculadora = herramientaPorClave("costo-por-servicio");
  const listaPrecios = herramientaPorClave("lista-de-precios");

  // Cada cambio de consulta: el rango nuevo del servidor y la dirección actualizada.
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    const t = s.conTalla ? talla : null;
    empezar(async () => {
      const r = await consultarRango({ giro, servicio, ciudad: ciudad?.slug ?? null, talla: t });
      if (!r.error && r.rango) {
        setRango(r.rango);
        setFrase(r.frase ?? "");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giro, servicio, ciudad, talla]);

  useEffect(() => {
    history.replaceState(null, "", ruta);
  }, [ruta]);

  useEffect(() => {
    if (rango.nivel !== "sin_datos") registrarEventoCliente("precios-mercado", "uso", { giro, ciudad: ciudad?.nombre ?? null });
  }, [rango, giro, ciudad]);

  const cambiarGiro = (g: GiroMercado) => {
    setGiro(g);
    setServicio(SERVICIO_PRINCIPAL[g]);
  };
  const mes = mesEnTexto(rango.fecha);
  const posicion = precio ? posicionEnRango(precio, rango) : null;
  const resumenWhatsApp = precio && posicion ? `${frase} ${textoPosicion(precio, rango, s.nombre)}` : frase;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section aria-label="Tu consulta" className="hta-regla grid gap-6 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-x-12">
        <Selector etiqueta="Tipo de negocio" opciones={GIROS_MERCADO.map((g) => ({ clave: g.clave, nombre: g.nombre }))} valor={giro} onChange={cambiarGiro} nombre="giro" />
        <Selector etiqueta="Servicio" opciones={serviciosDeGiro(giro).map((x) => ({ clave: x.clave, nombre: x.nombre }))} valor={servicio} onChange={setServicio} nombre="servicio" />
        <BuscadorCiudad valor={ciudad} onChange={setCiudad} />
        {s.conTalla && <Selector etiqueta="Tamaño del perro" opciones={[...TALLAS.map((t) => ({ clave: t.clave as Talla | "todas", nombre: t.nombre, detalle: t.detalle })), { clave: "todas" as const, nombre: "Todos" }]} valor={talla ?? "todas"} onChange={(v) => setTalla(v === "todas" ? null : (v as Talla))} nombre="talla" />}
      </section>

      <section aria-live="polite" aria-busy={pendiente} className="hta-regla grid gap-10 py-12 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-x-12" data-rango data-nivel={rango.nivel}>
        <div className={pendiente ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {rango.nivel !== "sin_datos" && rango.p25 != null && rango.p75 != null ? (
            <Resultado
              etiqueta={`${s.nombre}${talla && s.conTalla ? ` · perro ${talla}` : ""} · ${rango.nivel === "ciudad" ? rango.lugar : rango.nivel === "estado" ? `estado de ${rango.lugar}` : "México"}`}
              valor={<>{pesosMercado(rango.p25)}<small> a </small>{pesosMercado(rango.p75)}</>}
              unidad={s.unidad}
              nota={
                <>
                  Ahí cobra la mitad de los negocios. Mediana {pesosMercado(rango.mediana!)}. {rango.muestras} precios{mes ? `, actualizado en ${mes}` : ""}.
                  {rango.nivel !== "ciudad" && ciudad ? ` ${ciudad.nombre} todavía no junta 8 precios de este servicio: se muestra el rango ${rango.nivel === "estado" ? "del estado" : "del país"}.` : ""}
                </>
              }
            >
              <div className="mt-8">
                <BarraRango rango={rango} precio={precio} unidad={s.unidad} />
              </div>
            </Resultado>
          ) : (
            <Resultado etiqueta={`${s.nombre}${ciudad ? ` · ${ciudad.nombre}` : ""}`} valor="Sin datos todavía" nota="Todavía no juntamos 8 precios de este servicio ni en la ciudad, ni en el estado, ni en el país. El índice crece cada mes; si nos dejas tu WhatsApp te avisamos cuando haya rango." />
          )}
        </div>

        <div className="flex flex-col gap-8">
          <div>
            <label htmlFor="tu-precio" className="hta-etiqueta">¿Cuánto cobras tú?</label>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-n-600">$</span>
              <input id="tu-precio" type="text" inputMode="numeric" placeholder="Tu precio" className="hta-campo max-w-[12rem] text-2xl font-bold" value={precioTexto} onChange={(e) => setPrecioTexto(e.target.value)} data-tu-precio-campo />
              <span className="text-n-600">{s.unidad}</span>
            </div>
            <p className="mt-2 max-w-[48ch] text-sm text-n-600">No se guarda ni se manda a ningún lado: solo ubica tu precio en la barra.</p>
            {precio && posicion && (
              <p className="hta-aparece mt-4 rounded-xl bg-morado-suave px-4 py-3 text-n-900" data-posicion={posicion}>
                {textoPosicion(precio, rango, s.nombre)}
              </p>
            )}
          </div>
          <Compartir
            ruta={ruta}
            texto={frase}
            imagen={rango.nivel !== "sin_datos" ? `/precios-mercado/imagen?${new URLSearchParams({ giro, servicio, ...(ciudad ? { ciudad: ciudad.slug } : {}), ...(talla && s.conTalla ? { talla } : {}) })}` : null}
            insignia={precio && posicion === "dentro" && rango.nivel === "ciudad" ? `/precios-mercado/insignia?${new URLSearchParams({ giro, servicio, ciudad: ciudad!.slug, precio: String(precio) })}` : null}
          />
        </div>
      </section>

      <section className="hta-regla grid gap-8 py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-x-12">
        <ReciboPorWhatsApp
          herramienta="precios-mercado"
          accion={recibirPorWhatsApp}
          resumen={resumenWhatsApp}
          ruta={ruta}
          giro={giro}
          ciudad={ciudad}
          datos={{ servicio, talla: s.conTalla ? talla : null, precio, rango: { p25: rango.p25, mediana: rango.mediana, p75: rango.p75, nivel: rango.nivel } }}
          conReporteMensual
        />
        <div className="flex flex-col gap-5">
          <div>
            <p className="hta-etiqueta">Con esto en la mano</p>
            <ul className="mt-2 flex flex-col gap-3 text-n-800">
              {calculadora?.publicada && (
                <li><Link href={calculadora.ruta} className="hta-enlace">Calcula cuánto te cuesta este servicio</Link> y mira tu margen contra tu precio y contra el rango.</li>
              )}
              {listaPrecios?.publicada && (
                <li><Link href={listaPrecios.ruta} className="hta-enlace">Arma tu lista de precios</Link> con el rango de tu ciudad al lado de cada servicio.</li>
              )}
              <li><Link href={`/registro?utm_source=herramientas&utm_medium=precios-mercado`} className="hta-enlace">Pon tus precios en PeluDesk</Link>: el que escribiste aquí queda como tarifa, marcado «Calculado» hasta que lo confirmes.</li>
            </ul>
          </div>
          <div className="text-sm leading-relaxed text-n-600">
            <p className="hta-etiqueta">Cómo se calcula</p>
            <p>Juntamos precios públicos de negocios reales (sus sitios web y reseñas de Google), lo que capturan quienes usan esta herramienta y las tarifas de negocios de PeluDesk que lo autorizan, siempre como promedio. Se toman los del último año; un precio fuera de lo creíble para el servicio no cuenta. Una ciudad necesita 8 precios para tener rango propio; si no, se usa el del estado, y luego el del país. Se actualiza cada mes.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
