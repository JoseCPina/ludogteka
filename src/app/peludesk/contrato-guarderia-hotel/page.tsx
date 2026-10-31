import type { Metadata } from "next";
import { MarcoHerramienta } from "@/components/herramientas/marco";
import { herramientaPorClave } from "@/lib/herramientas/lista";
import type { TipoContrato } from "@/lib/herramientas/contrato-generador";
import { JsonLd, ORGANIZACION, SITIO, metaPagina, migas, preguntasFrecuentes } from "@/lib/peludesk/seo";
import { GeneradorContrato } from "./generador";

/** /contrato-guarderia-hotel: el generador de contrato (hotel, guardería) y de condiciones de servicio (estética). */
export const dynamic = "force-dynamic";
const h = herramientaPorClave("contrato")!;

export const metadata: Metadata = metaPagina({
  titulo: "Generador de contrato para guardería y hotel canino (y estética) | PeluDesk",
  descripcion: "Arma el contrato de tu guardería u hotel canino con tus políticas de entrega, recogida tardía, salud, urgencias y cancelación, y bájalo en PDF con tu nombre. Gratis, sin cuenta.",
  ruta: "/contrato-guarderia-hotel",
});

const PREGUNTAS: [string, string][] = [
  ["¿De dónde sale el contrato?", "De la plantilla general de PeluDesk, con la estructura del contrato real de un negocio que la usa (sin sus datos). Tú escoges cada política entre opciones ya redactadas."],
  ["¿Sirve legalmente?", "Es un contrato de prestación de servicios en español de México, con cláusulas de uso común y respeto a los derechos del consumidor. No sustituye la revisión de un abogado para tu caso."],
  ["¿Qué son las líneas en blanco del PDF?", "Los datos del cliente y del perro (nombre, teléfono, raza, contacto de emergencia…). En PeluDesk se llenan solos con la ficha del cliente y el dueño firma desde su celular."],
  ["¿Y para estética?", "Sale como «Condiciones del servicio»: una hoja corta con pelo maltratado, pulgas, entrega y cancelaciones, para el mostrador o para mandar por WhatsApp."],
];

export default async function ContratoGuarderiaHotel({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const t = Array.isArray(sp.tipo) ? sp.tipo[0] : sp.tipo;
  const tipo: TipoContrato = t === "guarderia" || t === "estetica" ? t : "hotel";
  return (
    <MarcoHerramienta clave="contrato" relacionadas={["/guias/contratos-y-vacunas-obligatorias-en-guarderias-y-hoteles-caninos", "/software-para-hoteles-caninos", "/software-para-guarderias-caninas"]} cierre={{ titulo: "En PeluDesk tus clientes firman desde el celular.", texto: "El contrato se llena solo con la ficha del cliente y de su perro, se firma con el dedo y queda guardado. 15 días gratis, sin tarjeta; tu contrato ya queda publicado." }}>
      <JsonLd datos={[migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Herramientas", ruta: "/herramientas" }, { nombre: h.nombre, ruta: h.ruta }]), { "@context": "https://schema.org", "@type": "WebApplication", name: h.nombre, url: `${SITIO}${h.ruta}`, description: h.que, applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "es-MX", isAccessibleForFree: true, offers: { "@type": "Offer", price: 0, priceCurrency: "MXN" }, publisher: ORGANIZACION }, preguntasFrecuentes(PREGUNTAS)]} />
      <GeneradorContrato tipoInicial={tipo} />
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
