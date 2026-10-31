import type { Metadata } from "next";
import Link from "next/link";
import { MarcoHerramienta } from "@/components/herramientas/marco";
import { herramientaPorClave } from "@/lib/herramientas/lista";
import { todasLasPlantillas } from "@/lib/herramientas/mensajes-whatsapp";
import { esGiroMercado, type GiroMercado } from "@/lib/mercado/catalogo";
import { FUNCION_RECORDATORIOS } from "@/lib/peludesk/recordatorios";
import { JsonLd, ORGANIZACION, SITIO, metaPagina, migas, preguntasFrecuentes } from "@/lib/peludesk/seo";
import { EditorMensajes } from "./editor";

/** /mensajes-whatsapp: 20 plantillas por giro, editables, con «Copiar» y «Probar en mi WhatsApp». */
export const dynamic = "force-dynamic";
const h = herramientaPorClave("mensajes-whatsapp")!;

export const metadata: Metadata = metaPagina({
  titulo: "Mensajes de WhatsApp para estéticas, hoteles, guarderías y veterinarias | PeluDesk",
  descripcion: "20 plantillas por giro: confirmación, recordatorio, listo para recoger, cobro pendiente, reseña, bienvenida, vacuna próxima y más, con el nombre de tu negocio. Copia o pruébalas en tu WhatsApp.",
  ruta: "/mensajes-whatsapp",
});

const PREGUNTAS: [string, string][] = [
  ["¿Puedo cambiar los textos?", "Sí: escribes tu negocio, el cliente, la mascota, el día, la hora y el monto, y cada mensaje se arma con eso. Al copiarlo lo editas en WhatsApp como quieras."],
  ["¿Qué hace «Probar en mi WhatsApp»?", "Abre WhatsApp con el mensaje ya escrito para que te lo mandes a ti o a quien escojas. PeluDesk no manda nada por ti desde esta página."],
  ["¿Cuáles salen solos con PeluDesk?", `Los marcados «PeluDesk lo manda solo»: el recordatorio del día anterior, el de la próxima vacuna y «listo para recoger». Es la función ${FUNCION_RECORDATORIOS.toLowerCase()}: salen del número de PeluDesk con el nombre de tu negocio y el cliente confirma con un botón.`],
];

export default async function MensajesWhatsApp({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const g = Array.isArray(sp.giro) ? sp.giro[0] : sp.giro;
  const giro: GiroMercado = esGiroMercado(g) ? g : "estetica";
  const todas = todasLasPlantillas();
  return (
    <MarcoHerramienta clave="mensajes-whatsapp" relacionadas={["/guias/recordatorios-por-whatsapp-y-portal-para-duenos-de-mascotas", "/precios"]} cierre={{ titulo: "O que salgan solas.", texto: "Con PeluDesk el recordatorio de la cita, el de la vacuna y el «listo para recoger» salen solos por WhatsApp, con el nombre de tu negocio, y tu cliente confirma con un botón. 15 días gratis, sin tarjeta.", boton: "Ver cómo le llega a tu cliente", href: "/#recordatorios" }}>
      <JsonLd datos={[migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Herramientas", ruta: "/herramientas" }, { nombre: h.nombre, ruta: h.ruta }]), { "@context": "https://schema.org", "@type": "WebApplication", name: h.nombre, url: `${SITIO}${h.ruta}`, description: h.que, applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "es-MX", isAccessibleForFree: true, offers: { "@type": "Offer", price: 0, priceCurrency: "MXN" }, publisher: ORGANIZACION }, { "@context": "https://schema.org", "@type": "ItemList", name: "Plantillas de mensajes de WhatsApp para negocios de mascotas", url: `${SITIO}${h.ruta}`, numberOfItems: todas.length, itemListElement: todas.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.nombre, url: `${SITIO}/mensajes-whatsapp/${p.slug}` })) }, preguntasFrecuentes(PREGUNTAS)]} />
      <EditorMensajes giroInicial={giro} />
      <section className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
        <div className="hta-regla pt-10">
          <h2 className="text-2xl font-bold tracking-tight text-n-900">Preguntas</h2>
          <dl className="mt-6 grid gap-x-12 gap-y-6 md:grid-cols-2">
            {PREGUNTAS.map(([q, a]) => (
              <div key={q}><dt className="font-bold text-n-900">{q}</dt><dd className="mt-1 text-n-700">{a}</dd></div>
            ))}
          </dl>
          <p className="mt-8 text-sm text-n-600">
            Cada plantilla tiene su página: {todas.slice(0, 8).map((p, i) => <span key={p.slug}>{i > 0 && " · "}<Link href={`/mensajes-whatsapp/${p.slug}`} className="hta-enlace">{p.nombre}</Link></span>)} y {todas.length - 8} más.
          </p>
        </div>
      </section>
    </MarcoHerramienta>
  );
}
