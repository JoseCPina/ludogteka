import type { Metadata } from "next";
import { MarcoHerramienta } from "@/components/herramientas/marco";
import { herramientaPorClave } from "@/lib/herramientas/lista";
import { JsonLd, ORGANIZACION, SITIO, metaPagina, migas, preguntasFrecuentes } from "@/lib/peludesk/seo";
import { CalculadoraComisiones } from "./calculadora";

/** /comisiones-groomers: la calculadora de comisiones de estilistas con los tres esquemas. */
export const dynamic = "force-dynamic";
const h = herramientaPorClave("comisiones")!;

export const metadata: Metadata = metaPagina({
  titulo: "Calculadora de comisiones para estilistas caninas | PeluDesk",
  descripcion: "Captura los servicios de la semana y compara cuánto se lleva la estilista y cuánto el negocio con comisión por porcentaje, pago fijo por servicio o sueldo más comisión. Gratis.",
  ruta: "/comisiones-groomers",
});

const PREGUNTAS: [string, string][] = [
  ["¿Qué esquema es mejor?", "Depende de tu semana: con pocas citas el sueldo fijo protege a la estilista; con muchas, el porcentaje le paga más y a ti te deja un margen parejo. La calculadora lo muestra con tus números."],
  ["¿Qué porcentaje se usa en México?", "Varía por ciudad y por negocio; por eso la calculadora no sugiere uno: pon el tuyo y el que te proponga tu estilista y compara."],
  ["¿Incluye propinas e impuestos?", "No. Compara los esquemas con la misma semana, sin IMSS, impuestos ni propinas; las propinas son de la estilista y van aparte."],
];

export default function ComisionesGroomers() {
  return (
    <MarcoHerramienta clave="comisiones" relacionadas={["/software-para-esteticas-caninas", "/precios-mercado"]} cierre={{ titulo: "En PeluDesk la nómina de tu estilista sale sola.", texto: "Cada cita terminada suma su comisión con el esquema que elijas; propinas, adelantos y descuentos aparte. 15 días gratis, sin tarjeta." }}>
      <JsonLd datos={[migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Herramientas", ruta: "/herramientas" }, { nombre: h.nombre, ruta: h.ruta }]), { "@context": "https://schema.org", "@type": "WebApplication", name: h.nombre, url: `${SITIO}${h.ruta}`, description: h.que, applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "es-MX", isAccessibleForFree: true, offers: { "@type": "Offer", price: 0, priceCurrency: "MXN" }, publisher: ORGANIZACION }, preguntasFrecuentes(PREGUNTAS)]} />
      <CalculadoraComisiones />
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
