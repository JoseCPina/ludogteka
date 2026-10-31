import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarraRango } from "@/components/herramientas/barra-rango";
import { MarcoHerramienta } from "@/components/herramientas/marco";
import { ReciboPorWhatsApp } from "@/components/herramientas/recibelo-por-whatsapp";
import { Compartir } from "@/components/herramientas/compartir";
import { GIROS_MERCADO, TALLAS, esGiroMercado, giroMercado, mesEnTexto, pesosMercado, serviciosDeGiro, type GiroMercado, type Rango } from "@/lib/mercado/catalogo";
import { ciudadPorSlug } from "@/lib/mercado/ciudades";
import { ciudadesConDatos, fraseDeRango, rangoDe } from "@/lib/mercado/rangos";
import { JsonLd, ORGANIZACION, SITIO, metaPagina, migas, preguntasFrecuentes } from "@/lib/peludesk/seo";
import { recibirPorWhatsApp } from "../../../herramientas/acciones";

/**
 * /precios-mercado/<giro>/<ciudad>: «Cuánto cobra una estética canina en Guadalajara en 2026». Solo existe (200 e
 * indexable) si la ciudad junta 8 precios o más de ese giro; si no, 404. El sitemap la lista desde
 * precios_mercado_ciudades. Dinámica como el resto del sitio (con ISR las lecturas a la base tronaban con
 * DYNAMIC_SERVER_USAGE); los datos cambian una vez al mes.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ giro: string; ciudad: string }> };
const anio = () => new Date().getFullYear();

async function datos(giroParam: string, ciudadSlug: string) {
  if (!esGiroMercado(giroParam)) return null;
  const ciudad = ciudadPorSlug(ciudadSlug);
  if (!ciudad) return null;
  const con = (await ciudadesConDatos(giroParam)).find((x) => x.ciudad.localeCompare(ciudad.nombre, "es", { sensitivity: "base" }) === 0);
  if (!con) return null;
  const giro: GiroMercado = giroParam;
  const servicios = serviciosDeGiro(giro);
  const rangos = await Promise.all(
    servicios.map(async (s) => ({
      servicio: s,
      general: await rangoDe({ giro, servicio: s.clave, ciudad, talla: null }),
      tallas: s.conTalla ? await Promise.all(TALLAS.map(async (t) => ({ talla: t, rango: await rangoDe({ giro, servicio: s.clave, ciudad, talla: t.clave }) }))) : [],
    }))
  );
  return { giro, ciudad, con, rangos: rangos.filter((r) => r.general.nivel !== "sin_datos") };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { giro, ciudad } = await params;
  const d = await datos(giro, ciudad);
  if (!d) return { robots: { index: false } };
  const g = giroMercado(d.giro);
  return metaPagina({
    titulo: `Cuánto cobra ${g.articulo} en ${d.ciudad.nombre} en ${anio()} | Índice PeluDesk`,
    descripcion: `Rango de precios de ${g.plural} en ${d.ciudad.nombre}: ${d.rangos.map((r) => r.servicio.nombre.toLowerCase()).join(", ")}. ${d.con.muestras} precios públicos de negocios reales, actualizado cada mes.`.slice(0, 200),
    ruta: `/precios-mercado/${d.giro}/${ciudad}`,
    imagen: { url: `/precios-mercado/imagen?${new URLSearchParams({ giro: d.giro, servicio: d.rangos[0]?.servicio.clave ?? "", ciudad, formato: "og" })}`, width: 1200, height: 630, alt: `Precios de ${g.plural} en ${d.ciudad.nombre}` },
  });
}

export default async function PreciosPorCiudad({ params }: Props) {
  const { giro, ciudad: ciudadSlug } = await params;
  const d = await datos(giro, ciudadSlug);
  if (!d) notFound();
  const g = giroMercado(d.giro);
  const ruta = `/precios-mercado/${d.giro}/${ciudadSlug}`;
  const principal = d.rangos[0];
  const mes = mesEnTexto(d.con.fecha);
  const otrasCiudades = (await ciudadesConDatos(d.giro)).filter((x) => x.ciudad !== d.con.ciudad).slice(0, 10);
  const preguntas: [string, string][] = [
    [`¿Cuánto cobra ${g.articulo} en ${d.ciudad.nombre}?`, principal ? fraseDeRango({ giro: d.giro, servicio: principal.servicio.clave, ciudad: d.ciudad, talla: null }, principal.general, pesosMercado, mes) : "Todavía no hay suficientes precios."],
    ["¿De dónde salen estos precios?", "De precios públicos de negocios reales: sus sitios web, lo que dicen las reseñas de Google, lo que capturan quienes usan el índice y las tarifas de negocios de PeluDesk que lo autorizan, como promedio. No se publica el precio de ningún negocio en particular."],
    ["¿Cómo sé si mi precio está bien?", `En el índice escribes tu precio y te dice si queda dentro del rango de ${d.ciudad.nombre}, abajo del 25 % o arriba del 75 %, sin pedirte nada.`],
  ];
  const fraseCompartir = principal ? fraseDeRango({ giro: d.giro, servicio: principal.servicio.clave, ciudad: d.ciudad, talla: null }, principal.general, pesosMercado, mes) : "";

  return (
    <MarcoHerramienta
      clave="precios-mercado"
      titulo={`Cuánto cobra ${g.articulo} en ${d.ciudad.nombre} en ${anio()}`}
      intro={`El rango de cada servicio de ${g.plural} en ${d.ciudad.nombre}, con ${d.con.muestras} precios públicos${mes ? ` actualizados en ${mes}` : ""}.`}
      migas={[{ nombre: "Inicio", ruta: "/" }, { nombre: "Índice de precios", ruta: "/precios-mercado" }, { nombre: `${g.nombre} en ${d.ciudad.nombre}` }]}
      relacionadas={[d.giro === "veterinaria" ? "/veterinaria" : d.giro === "estetica" ? "/software-para-esteticas-caninas" : d.giro === "hotel" ? "/software-para-hoteles-caninos" : "/software-para-guarderias-caninas"]}
      cierre={{ titulo: `Pon tus precios de ${d.ciudad.nombre} en PeluDesk.`, texto: "Tarifas por talla y pelaje, agenda, caja y recordatorios por WhatsApp. 15 días gratis, sin tarjeta." }}
    >
      <JsonLd
        datos={[
          migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Índice de precios", ruta: "/precios-mercado" }, { nombre: `${g.nombre} en ${d.ciudad.nombre}`, ruta }]),
          {
            "@context": "https://schema.org",
            "@type": "Dataset",
            name: `Precios de ${g.plural} en ${d.ciudad.nombre}`,
            description: `Rango de precios (percentil 25, mediana y percentil 75) por servicio de ${g.plural} en ${d.ciudad.nombre}, ${d.ciudad.estado}, con ${d.con.muestras} precios públicos.`,
            url: `${SITIO}${ruta}`,
            inLanguage: "es-MX",
            creator: ORGANIZACION,
            spatialCoverage: `${d.ciudad.nombre}, ${d.ciudad.estado}, México`,
            isAccessibleForFree: true,
            dateModified: d.con.fecha,
            variableMeasured: d.rangos.map((r) => ({ "@type": "PropertyValue", name: r.servicio.nombre, value: r.general.mediana, unitText: "MXN", description: `Mediana; rango ${pesosMercado(r.general.p25!)} a ${pesosMercado(r.general.p75!)} ${r.servicio.unidad}` })),
          },
          preguntasFrecuentes(preguntas),
        ]}
      />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {d.rangos.map((r) => (
          <section key={r.servicio.clave} className="hta-regla grid gap-8 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:gap-x-12" data-servicio={r.servicio.clave}>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-n-900">{r.servicio.nombre}</h2>
              <p className="hta-cifra mt-3">
                {pesosMercado(r.general.p25!)}<small> a </small>{pesosMercado(r.general.p75!)}
                <small> {r.servicio.unidad}</small>
              </p>
              <p className="mt-2 text-n-700">
                Mediana {pesosMercado(r.general.mediana!)} · {r.general.muestras} precios{r.general.nivel !== "ciudad" ? ` (rango ${r.general.nivel === "estado" ? "del estado" : "del país"}: la ciudad aún no junta 8 de este servicio)` : ""}.
              </p>
              {r.tallas.filter((t) => t.rango.nivel === "ciudad").length > 0 && (
                <dl className="mt-4 grid grid-cols-3 gap-3">
                  {r.tallas.filter((t) => t.rango.nivel === "ciudad").map((t) => (
                    <div key={t.talla.clave}>
                      <dt className="hta-etiqueta mb-0">{t.talla.nombre}</dt>
                      <dd className="font-bold text-n-900">{pesosMercado(t.rango.mediana!)}</dd>
                      <dd className="text-xs text-n-600">{t.rango.muestras} precios</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="mt-4">
                <Link href={`/precios-mercado?${new URLSearchParams({ giro: d.giro, servicio: r.servicio.clave, ciudad: ciudadSlug })}`} className="hta-enlace">Ubica tu precio de {r.servicio.nombre.toLowerCase()}</Link>
              </p>
            </div>
            <div className="pt-2">
              <BarraRango rango={r.general as Rango} unidad={r.servicio.unidad} />
            </div>
          </section>
        ))}

        <section className="hta-regla grid gap-8 py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-x-12">
          <ReciboPorWhatsApp
            herramienta="precios-mercado"
            accion={recibirPorWhatsApp}
            resumen={fraseCompartir}
            ruta={ruta}
            giro={d.giro}
            ciudad={d.ciudad}
            datos={{ servicio: principal?.servicio.clave ?? null, talla: null, precio: null }}
            conReporteMensual
            titulo={`Recibe los precios de ${d.ciudad.nombre} por WhatsApp`}
            texto="Te mandamos este rango y, si quieres, el actualizado cada mes."
          />
          <div className="flex flex-col gap-6">
            <Compartir ruta={ruta} texto={fraseCompartir} imagen={principal ? `/precios-mercado/imagen?${new URLSearchParams({ giro: d.giro, servicio: principal.servicio.clave, ciudad: ciudadSlug })}` : null} />
            {otrasCiudades.length > 0 && (
              <div>
                <p className="hta-etiqueta">{g.plural} en otras ciudades</p>
                <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                  {otrasCiudades.map((c) => (
                    <li key={c.ciudad}><Link href={`/precios-mercado/${d.giro}/${c.ciudad.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`} className="hta-enlace">{c.ciudad}</Link></li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="hta-etiqueta">Otros giros en {d.ciudad.nombre}</p>
              <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                {GIROS_MERCADO.filter((x) => x.clave !== d.giro).map((x) => (
                  <li key={x.clave}><Link href={`/precios-mercado?${new URLSearchParams({ giro: x.clave, ciudad: ciudadSlug })}`} className="hta-enlace">{x.plural}</Link></li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="hta-regla py-10">
          <h2 className="text-2xl font-bold tracking-tight text-n-900">Preguntas</h2>
          <dl className="mt-6 grid gap-x-12 gap-y-6 md:grid-cols-2">
            {preguntas.map(([q, a]) => (
              <div key={q}>
                <dt className="font-bold text-n-900">{q}</dt>
                <dd className="mt-1 text-n-700">{a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </MarcoHerramienta>
  );
}
