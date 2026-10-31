import type { Metadata } from "next";
import { MarcoHerramienta } from "@/components/herramientas/marco";
import { herramientaPorClave } from "@/lib/herramientas/lista";
import { esGiroMercado, type GiroMercado } from "@/lib/mercado/catalogo";
import { JsonLd, ORGANIZACION, SITIO, metaPagina, migas, preguntasFrecuentes } from "@/lib/peludesk/seo";
import { GeneradorLista } from "./generador";

/** /lista-de-precios: el generador de lista de precios (PDF e imagen) con el rango de la ciudad al lado. */
export const dynamic = "force-dynamic";
const h = herramientaPorClave("lista-de-precios")!;

export const metadata: Metadata = metaPagina({
  titulo: "Generador de lista de precios para negocios de mascotas | PeluDesk",
  descripcion: "Captura tus servicios y precios y baja tu lista en imagen para WhatsApp o PDF para imprimir, en tres estilos. Gratis, sin cuenta; con el rango de tu ciudad al lado.",
  ruta: "/lista-de-precios",
});

const PREGUNTAS: [string, string][] = [
  ["¿Tengo que crear una cuenta?", "No. Capturas, ves la vista previa y bajas la imagen o el PDF. Solo si quieres el resumen por WhatsApp dejas tu número."],
  ["¿Mi logo y mis precios se suben a algún lado?", "No. La imagen y el PDF se dibujan en tu navegador. Si pides el resumen por WhatsApp, se guardan tus servicios y precios ligados a tu teléfono para precargarlos si abres tu prueba de PeluDesk."],
  ["¿Qué es el rango que sale junto a cada servicio?", "Lo que cobra la mitad de los negocios de tu ciudad según el Índice PeluDesk de precios (del 25 % al 75 %). Sale solo para los servicios del catálogo y si tu ciudad tiene datos."],
  ["¿Qué tamaño tienen los archivos?", "La imagen es de 1080×1350 píxeles (el formato vertical de WhatsApp e Instagram). El PDF es tamaño carta, listo para imprimir."],
];

export default async function ListaDePrecios({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const g = Array.isArray(sp.giro) ? sp.giro[0] : sp.giro;
  const giro: GiroMercado = esGiroMercado(g) ? g : "estetica";
  return (
    <MarcoHerramienta clave="lista-de-precios" relacionadas={["/precios-mercado", "/software-para-esteticas-caninas"]} cierre={{ titulo: "Con PeluDesk tus precios cobran solos.", texto: "Tarifas por talla y pelaje, la cuenta de cada cita y el cobro en caja. 15 días gratis, sin tarjeta; tus precios ya quedan capturados." }}>
      <JsonLd datos={[migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Herramientas", ruta: "/herramientas" }, { nombre: h.nombre, ruta: h.ruta }]), { "@context": "https://schema.org", "@type": "WebApplication", name: h.nombre, url: `${SITIO}${h.ruta}`, description: h.que, applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "es-MX", isAccessibleForFree: true, offers: { "@type": "Offer", price: 0, priceCurrency: "MXN" }, publisher: ORGANIZACION }, preguntasFrecuentes(PREGUNTAS)]} />
      <GeneradorLista giroInicial={giro} />
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
