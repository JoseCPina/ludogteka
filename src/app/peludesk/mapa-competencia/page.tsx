import type { Metadata } from "next";
import { MarcoHerramienta } from "@/components/herramientas/marco";
import { herramientaPorClave } from "@/lib/herramientas/lista";
import { esGiroMercado, type GiroMercado } from "@/lib/mercado/catalogo";
import { JsonLd, ORGANIZACION, SITIO, metaPagina, migas, preguntasFrecuentes } from "@/lib/peludesk/seo";
import { MapaCompetencia } from "./mapa";

/** /mapa-competencia: cuántos negocios del giro hay a 1, 2 y 5 km de una dirección y las zonas con menos cobertura. */
export const dynamic = "force-dynamic";
const h = herramientaPorClave("mapa-competencia")!;

export const metadata: Metadata = metaPagina({
  titulo: "Mapa de competencia: estéticas, hoteles, guarderías y veterinarias cerca de ti | PeluDesk",
  descripcion: "Escribe una dirección o colonia y tu giro: cuántos negocios hay a 1, 2 y 5 km, su calificación promedio, las colonias con menos cobertura y la proporción por habitante del municipio (INEGI). Gratis.",
  ruta: "/mapa-competencia",
});

const PREGUNTAS: [string, string][] = [
  ["¿De dónde salen los negocios?", "De Google Maps: los negocios del Directorio PeluDesk con ubicación. Si falta alguno, no está en Google o todavía no lo encontramos."],
  ["¿Qué significa «por cada 10 mil habitantes»?", "Los negocios del giro en el municipio entre su población del Censo 2020 del INEGI. Sirve para comparar municipios, no colonias."],
  ["¿Se guarda mi dirección?", "No. Se usa para ubicar el punto y se descarta. Solo si pides el análisis por WhatsApp se guardan las coordenadas redondeadas con tu número."],
];

export default async function Mapa({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const g = Array.isArray(sp.giro) ? sp.giro[0] : sp.giro;
  const giro: GiroMercado = esGiroMercado(g) ? g : "estetica";
  return (
    <MarcoHerramienta clave="mapa-competencia" relacionadas={["/directorio", "/precios-mercado"]} cierre={{ titulo: "Cuando abras, que la agenda se llene sola.", texto: "Página web con cita en línea, recordatorios por WhatsApp y caja con corte desde el primer día. 15 días gratis, sin tarjeta." }}>
      <JsonLd datos={[migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Herramientas", ruta: "/herramientas" }, { nombre: h.nombre, ruta: h.ruta }]), { "@context": "https://schema.org", "@type": "WebApplication", name: h.nombre, url: `${SITIO}${h.ruta}`, description: h.que, applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "es-MX", isAccessibleForFree: true, offers: { "@type": "Offer", price: 0, priceCurrency: "MXN" }, publisher: ORGANIZACION }, preguntasFrecuentes(PREGUNTAS)]} />
      <MapaCompetencia giroInicial={giro} />
      <section className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
        <div className="hta-regla pt-10">
          <h2 className="text-2xl font-bold tracking-tight text-n-900">Preguntas</h2>
          <dl className="mt-6 grid gap-x-12 gap-y-6 md:grid-cols-2">
            {PREGUNTAS.map(([q, a]) => (
              <div key={q}><dt className="font-bold text-n-900">{q}</dt><dd className="mt-1 text-n-700">{a}</dd></div>
            ))}
          </dl>
        </div>
      </section>
    </MarcoHerramienta>
  );
}
