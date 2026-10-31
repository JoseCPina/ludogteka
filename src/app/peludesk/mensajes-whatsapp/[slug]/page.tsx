import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarcoHerramienta } from "@/components/herramientas/marco";
import { plantillaPorSlug, plantillasDe, todasLasPlantillas } from "@/lib/herramientas/mensajes-whatsapp";
import { GIROS_MERCADO, esGiroMercado, type GiroMercado } from "@/lib/mercado/catalogo";
import { JsonLd, ORGANIZACION, SITIO, metaPagina, migas, preguntasFrecuentes } from "@/lib/peludesk/seo";
import { EditorMensajes } from "../editor";

/** /mensajes-whatsapp/<slug>: una plantilla por página, indexable, con el editor de solo esa plantilla. */
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = plantillaPorSlug((await params).slug);
  if (!p) return { robots: { index: false } };
  return metaPagina({
    titulo: `Mensaje de WhatsApp: ${p.nombre.toLowerCase()} para tu negocio de mascotas | PeluDesk`.slice(0, 90),
    descripcion: `Plantilla de WhatsApp «${p.nombre}» (${p.cuando.toLowerCase()}) para estéticas, hoteles, guarderías y veterinarias: escribe el nombre de tu negocio y de la mascota, cópiala o pruébala en tu WhatsApp. Gratis.`.slice(0, 200),
    ruta: `/mensajes-whatsapp/${p.slug}`,
  });
}

export default async function Plantilla({ params, searchParams }: Props) {
  const { slug } = await params;
  const p = plantillaPorSlug(slug);
  if (!p) notFound();
  const sp = await searchParams;
  const g = Array.isArray(sp.giro) ? sp.giro[0] : sp.giro;
  const giro: GiroMercado = esGiroMercado(g) && p.giros.includes(g) ? g : p.giros[0];
  const texto = plantillasDe(giro).find((x) => x.slug === slug)!.texto;
  const otras = todasLasPlantillas().filter((x) => x.slug !== slug).slice(0, 10);
  const preguntas: [string, string][] = [
    [`¿Cuándo se manda «${p.nombre}»?`, `${p.cuando}. El texto base es: «${texto}». Las palabras entre llaves se cambian por tu negocio, el cliente y la mascota.`],
    ["¿Puedo usarla en cualquier giro?", `Esta plantilla tiene versión para ${p.giros.map((x) => GIROS_MERCADO.find((y) => y.clave === x)!.plural).join(", ")}.`],
  ];
  return (
    <MarcoHerramienta clave="mensajes-whatsapp" titulo={`Mensaje de WhatsApp: ${p.nombre.toLowerCase()}`} intro={`${p.cuando}. Escribe tu negocio y tu cliente, cópialo o pruébalo en tu WhatsApp.`} migas={[{ nombre: "Inicio", ruta: "/" }, { nombre: "Mensajes de WhatsApp", ruta: "/mensajes-whatsapp" }, { nombre: p.nombre }]} relacionadas={["/mensajes-whatsapp"]} cierre={{ titulo: "O que salga solo.", texto: "Con PeluDesk el recordatorio, el aviso de vacuna y el «listo para recoger» salen solos por WhatsApp con el nombre de tu negocio. 15 días gratis, sin tarjeta.", boton: "Ver cómo le llega a tu cliente", href: "/#recordatorios" }}>
      <JsonLd datos={[migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Mensajes de WhatsApp", ruta: "/mensajes-whatsapp" }, { nombre: p.nombre, ruta: `/mensajes-whatsapp/${slug}` }]), { "@context": "https://schema.org", "@type": "HowTo", name: `Cómo mandar el mensaje «${p.nombre}» por WhatsApp`, description: p.cuando, inLanguage: "es-MX", step: [{ "@type": "HowToStep", name: "Escribe tus datos", text: "Pon el nombre de tu negocio, del cliente y de la mascota." }, { "@type": "HowToStep", name: "Copia o prueba", text: "Copia el mensaje o ábrelo en tu WhatsApp con «Probar en mi WhatsApp»." }], publisher: ORGANIZACION, url: `${SITIO}/mensajes-whatsapp/${slug}` }, preguntasFrecuentes(preguntas)]} />
      <EditorMensajes giroInicial={giro} solo={slug} />
      <section className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
        <div className="hta-regla pt-10">
          <p className="hta-etiqueta">Otras plantillas</p>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {otras.map((x) => <li key={x.slug}><Link href={`/mensajes-whatsapp/${x.slug}`} className="hta-enlace">{x.nombre}</Link></li>)}
            <li><Link href="/mensajes-whatsapp" className="hta-enlace">Ver las {todasLasPlantillas().length}</Link></li>
          </ul>
        </div>
      </section>
    </MarcoHerramienta>
  );
}
