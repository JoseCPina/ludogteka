"use client";

import Link from "next/link";
import { useState } from "react";
import { BuscadorCiudad } from "@/components/herramientas/buscador-ciudad";
import { ReciboPorWhatsApp } from "@/components/herramientas/recibelo-por-whatsapp";
import { Resultado } from "@/components/herramientas/resultado";
import { Selector } from "@/components/herramientas/selector";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { useEspera } from "@/hooks/use-espera";
import { registrarEventoCliente } from "@/lib/herramientas/cliente";
import { herramientaPorClave } from "@/lib/herramientas/lista";
import type { Analisis } from "@/lib/mapa/competencia";
import { urlImagenMapa } from "@/lib/mapa/competencia";
import { GIROS_MERCADO, type GiroMercado } from "@/lib/mercado/catalogo";
import type { CiudadMercado } from "@/lib/mercado/ciudades";
import { analizarCompetencia } from "./acciones";
import { recibirPorWhatsApp } from "../herramientas/acciones";

/** /mapa-competencia: dirección o colonia + ciudad + giro → anillos de 1, 2 y 5 km, mapa, colonias con menos cobertura. */
export function MapaCompetencia({ giroInicial }: { giroInicial: GiroMercado }) {
  const [giro, setGiro] = useState<GiroMercado>(giroInicial);
  const [texto, setTexto] = useState("");
  const [ciudad, setCiudad] = useState<CiudadMercado | null>(null);
  const [a, setA] = useState<Analisis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const envio = useEspera();
  const g = GIROS_MERCADO.find((x) => x.clave === giro)!;
  const escuela = herramientaPorClave("escuela");

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <form
        method="post"
        className="hta-regla grid gap-6 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-x-12"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const r = await envio.ejecutar(() => analizarCompetencia({ texto, ciudad: ciudad?.nombre ?? null, giro }));
          if (r.error) return setError(r.error);
          setA(r.analisis ?? null);
          registrarEventoCliente("mapa-competencia", "uso", { giro, ciudad: ciudad?.nombre ?? null });
        }}
      >
        <div className="flex flex-col gap-5">
          <Selector etiqueta="Giro" opciones={GIROS_MERCADO.map((x) => ({ clave: x.clave, nombre: x.nombre }))} valor={giro} onChange={setGiro} nombre="giro" />
          <div>
            <label htmlFor="mc-texto" className="hta-etiqueta">Dirección o colonia</label>
            <input id="mc-texto" className="hta-campo" value={texto} onChange={(e) => setTexto(e.target.value.slice(0, 160))} placeholder="Av. Himno Nacional 1200, o solo «Lomas»" required />
          </div>
          <BuscadorCiudad valor={ciudad} onChange={setCiudad} etiqueta="Ciudad" />
        </div>
        <div className="flex flex-col justify-end gap-3">
          <AccionesFormulario error={error}>
            <Button type="submit" cargando={envio.cargando} sinBloqueo>Ver la competencia</Button>
          </AccionesFormulario>
          <p className="text-sm text-n-600">La dirección se usa para ubicar el punto y no se guarda. Los negocios salen de Google Maps (los que el Directorio PeluDesk tiene ubicados).</p>
        </div>
      </form>

      {a && (
        <>
          <section className="hta-regla grid gap-8 py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-x-12" data-analisis aria-live="polite">
            <div className="flex flex-col gap-6">
              <Resultado etiqueta={`${g.plural} a 2 km de ${a.punto.texto}`} valor={a.anillos[1].n} nota={a.resumen} />
              <dl className="grid grid-cols-3 gap-3">
                {a.anillos.map((r) => (
                  <div key={r.km} className="border-t border-n-200 pt-2">
                    <dt className="hta-etiqueta mb-0">A {r.km} km</dt>
                    <dd className="text-2xl font-bold tabular-nums text-n-900">{r.n}</dd>
                    <dd className="text-xs text-n-600">{r.promedio ? `calificación ${r.promedio}` : "sin calificación"}</dd>
                  </div>
                ))}
              </dl>
              {a.municipio && (
                <p className="text-sm text-n-700">
                  <b className="text-n-900">{a.municipio.nombre}</b>: {a.municipio.negocios.toLocaleString("es-MX")} {g.plural} para {a.municipio.poblacion.toLocaleString("es-MX")} habitantes (INEGI 2020): {a.municipio.por10k} por cada 10 mil.
                </p>
              )}
              {a.colonias.length > 0 && (
                <div>
                  <p className="hta-etiqueta">Colonias alrededor, de menos a más {g.plural}</p>
                  <ul className="flex flex-wrap gap-2">
                    {a.colonias.slice(0, 12).map((c) => (
                      <li key={c.nombre} className="rounded-full bg-n-100 px-3 py-1 text-sm text-n-800">{c.nombre} <b>{c.n}</b></li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-n-600">Cuenta los negocios de cada colonia a 5 km; la colonia sale de la dirección en Google.</p>
                </div>
              )}
            </div>
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlImagenMapa(a)} alt={`Mapa con ${g.plural} a 5 km alrededor del punto; el círculo marca 2 km`} width={640} height={480} className="w-full rounded-xl border border-n-200 bg-n-100" loading="lazy" />
              <p className="mt-1 text-xs text-n-600">Mapa de Google. T = tu punto; el círculo son 2 km; los puntos verdes, {g.plural}.</p>
              <ol className="mt-4 max-h-80 overflow-y-auto text-sm" data-cercanos>
                {a.cercanos.slice(0, 30).map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-3 border-t border-n-200 py-1.5">
                    <span><Link href={`/directorio/${giro}/${c.ciudad.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}/${c.slug}`} className="hta-enlace">{c.nombre}</Link>{c.colonia ? <span className="text-n-600"> · {c.colonia}</span> : null}</span>
                    <span className="shrink-0 tabular-nums text-n-700">{c.distancia_m < 1000 ? `${c.distancia_m} m` : `${(c.distancia_m / 1000).toFixed(1)} km`}{c.calificacion ? ` · ★ ${c.calificacion.toFixed(1)}` : ""}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
          <section className="hta-regla grid gap-8 py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-x-12">
            <ReciboPorWhatsApp herramienta="mapa-competencia" accion={recibirPorWhatsApp} resumen={a.resumen} ruta={`/mapa-competencia?giro=${giro}`} giro={giro} ciudad={ciudad} datos={{ giro, punto: { lat: a.punto.lat, lng: a.punto.lng }, anillos: a.anillos, colonias: a.colonias.slice(0, 10), municipio: a.municipio }} titulo="Recibe el análisis completo por WhatsApp" texto="Te mandamos el resumen con los negocios a 1, 2 y 5 km y las colonias con menos cobertura." />
            <div className="text-sm leading-relaxed text-n-600">
              <p className="hta-etiqueta">Siguiente paso</p>
              {escuela?.publicada ? (
                <p><Link href="/escuela" className="hta-enlace">La sesión «Cuánto cuesta abrir» de la Escuela PeluDesk</Link> recorre renta, equipo, insumos y el primer mes con números reales.</p>
              ) : (
                <p>Con el Índice PeluDesk de precios ves <Link href={`/precios-mercado?giro=${giro}${ciudad ? `&ciudad=${ciudad.slug}` : ""}`} className="hta-enlace">cuánto cobran {g.plural} en tu ciudad</Link>.</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
