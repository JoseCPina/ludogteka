import type { Metadata } from "next";
import { MarcoHerramienta } from "@/components/herramientas/marco";
import { herramientaPorClave } from "@/lib/herramientas/lista";
import { esGiroMercado, type GiroMercado } from "@/lib/mercado/catalogo";
import { JsonLd, ORGANIZACION, SITIO, metaPagina, migas, preguntasFrecuentes } from "@/lib/peludesk/seo";
import { Cuestionario } from "./cuestionario";

/** /diagnostico: el diagnóstico de rentabilidad en 10 preguntas. */
export const dynamic = "force-dynamic";
const h = herramientaPorClave("diagnostico")!;

export const metadata: Metadata = metaPagina({
  titulo: "Diagnóstico de rentabilidad para tu negocio de mascotas: 10 preguntas | PeluDesk",
  descripcion: "Contesta diez preguntas sobre citas, plantones, caja y cobros y recibe un puntaje de 0 a 100, tres recomendaciones y cuánto dinero se te va al mes, calculado con tus números. Gratis.",
  ruta: "/diagnostico",
});

const PREGUNTAS: [string, string][] = [
  ["¿De dónde sale el puntaje?", "De tus diez respuestas: seis sobre cómo operas (caja, cobro, recordatorios, expediente, contrato, cierre) valen hasta 10 puntos cada una; los plantones y los clientes que regresan, hasta 20 cada uno."],
  ["¿Cómo se calcula el dinero que se va?", "Con tus números y supuestos conservadores que se dicen en cada línea: cuántas citas caídas recupera un recordatorio con confirmación, la merma de una caja sin corte, los clientes nuevos que no vuelven."],
  ["¿Se guardan mis respuestas?", "Solo si pides el reporte por WhatsApp: entonces quedan ligadas a tu teléfono para que te podamos ayudar con lo que te salió."],
];

export default async function Diagnostico({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const g = Array.isArray(sp.giro) ? sp.giro[0] : sp.giro;
  const giro: GiroMercado = esGiroMercado(g) ? g : "estetica";
  return (
    <MarcoHerramienta clave="diagnostico" relacionadas={["/guias/control-de-pagos-y-caja-en-una-guarderia-canina", "/guias/recordatorios-por-whatsapp-y-portal-para-duenos-de-mascotas"]} cierre={{ titulo: "Lo que te salió, PeluDesk lo resuelve solo.", texto: "Recordatorio con confirmación, caja con corte y portal del cliente. 15 días gratis, sin tarjeta." }}>
      <JsonLd datos={[migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Herramientas", ruta: "/herramientas" }, { nombre: h.nombre, ruta: h.ruta }]), { "@context": "https://schema.org", "@type": "WebApplication", name: h.nombre, url: `${SITIO}${h.ruta}`, description: h.que, applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "es-MX", isAccessibleForFree: true, offers: { "@type": "Offer", price: 0, priceCurrency: "MXN" }, publisher: ORGANIZACION }, preguntasFrecuentes(PREGUNTAS)]} />
      <Cuestionario giroInicial={giro} />
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
