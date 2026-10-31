import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PaginaWeb } from "@/components/web-negocio/pagina-web";
import { MarcoSitio } from "@/components/peludesk/sitio";
import { Migas } from "@/components/peludesk/blog";
import { EventoHerramienta } from "@/components/herramientas/evento";
import { Reclamar } from "@/components/herramientas/reclamar";
import { NegocioVerificado } from "@/components/herramientas/verificado";
import { negocioPorSlug, resolverCiudad, textoGiroDirectorio } from "@/lib/directorio/consulta";
import { esGiroMercado, slugDe } from "@/lib/mercado/catalogo";
import { EMPRESA } from "@/lib/peludesk/legal";
import { JsonLd, ORGANIZACION, SITIO, metaPagina, migas } from "@/lib/peludesk/seo";
import { prospectoPorSlug, registrarVisita, whatsappQuitarPagina } from "@/lib/prospectos/pagina";
import { lugarDeGoogleParaFicha } from "@/lib/directorio/google";
import { colorDeFoto, fotoChica } from "@/lib/web-negocio/color";
import { datosDeProspecto } from "@/lib/web-negocio/desde-prospecto";
import { portalEjemplo } from "@/lib/web-negocio/catalogo";
import "@/components/herramientas/herramientas.css";

/**
 * /directorio/<giro>/<ciudad>/<slug>: la ficha pública e indexable de un negocio del directorio. Es la misma página
 * que /para/<slug> (PaginaWeb en modo demostración con sus datos de Google pedidos al mostrarla, con atribución y sin
 * guardarse), sin la parte de venta de PeluDesk y con «¿Es tu negocio? Reclámalo». La visita cuenta en el CRM como
 * una visita a su página.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ giro: string; ciudad: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { giro, ciudad, slug } = await params;
  const n = await negocioPorSlug(slug);
  if (!n || !esGiroMercado(giro)) return { robots: { index: false } };
  const g = textoGiroDirectorio(giro);
  return metaPagina({
    titulo: `${n.nombre}: ${g.nombre.toLowerCase()} en ${n.ciudad}${n.calificacion ? ` · ★ ${n.calificacion.toFixed(1)}` : ""} | Directorio PeluDesk`.slice(0, 90),
    descripcion: `${n.nombre}, ${g.nombre.toLowerCase()} en ${[n.colonia, n.ciudad].filter(Boolean).join(", ")}${n.calificacion ? `, calificación ${n.calificacion.toFixed(1)} en Google Maps con ${n.resenas ?? 0} reseñas` : ""}. Servicios, horario, fotos y cómo pedir cita. Ficha del Directorio PeluDesk.`.slice(0, 200),
    ruta: `/directorio/${giro}/${ciudad}/${slug}`,
  });
}

export default async function FichaDirectorio({ params }: Props) {
  const { giro, ciudad: ciudadSlug, slug } = await params;
  const n = await negocioPorSlug(slug);
  const ciudad = await resolverCiudad(ciudadSlug);
  if (!n || !esGiroMercado(giro) || !ciudad || !n.servicios.includes(giro) || slugDe(n.ciudad) !== ciudad.slug) notFound();
  const p = await prospectoPorSlug(slug);
  if (!p) notFound();
  const h = await headers();
  // Lo de Google se pide solo cuando la abre una persona (un robot ve la ficha con lo del CRM: así una indexación
  // completa del directorio no cuesta miles de consultas) y se recuerda dos horas por lugar.
  const [, g] = await Promise.all([
    registrarVisita({ slug, tipo: "visita", ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, navegador: h.get("user-agent") }),
    lugarDeGoogleParaFicha(p.google_place_id, h.get("user-agent")),
  ]);
  const color = await colorDeFoto(fotoChica(g?.fotos[0]?.uri));
  const datos = datosDeProspecto(p, g, color);
  const gi = textoGiroDirectorio(giro);
  const ruta = `/directorio/${giro}/${ciudadSlug}/${slug}`;
  const lista = `/directorio/${giro}/${ciudadSlug}`;

  return (
    <MarcoSitio>
      <EventoHerramienta clave="directorio" />
      <JsonLd
        datos={[
          migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Directorio", ruta: "/directorio" }, { nombre: `${gi.plural} en ${n.ciudad}`, ruta: lista }, { nombre: n.nombre, ruta }]),
          {
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            name: n.nombre,
            url: `${SITIO}${ruta}`,
            address: { "@type": "PostalAddress", streetAddress: datos.direccion ?? undefined, addressLocality: n.ciudad, addressRegion: ciudad.estado ?? undefined, addressCountry: "MX" },
            ...(datos.calificacion != null && datos.totalResenas ? { aggregateRating: { "@type": "AggregateRating", ratingValue: datos.calificacion, reviewCount: datos.totalResenas, bestRating: 5 } } : {}),
            ...(datos.mapsUri ? { hasMap: datos.mapsUri } : {}),
            description: `${gi.nombre} en ${n.ciudad}. Ficha pública del Directorio PeluDesk con datos de Google Maps; no es la página oficial del negocio.`,
            isPartOf: { "@type": "WebSite", "@id": `${SITIO}/#sitio` },
            publisher: ORGANIZACION,
          },
        ]}
      />
      <div className="hta">
        <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
          <Migas items={[{ nombre: "Inicio", ruta: "/" }, { nombre: "Directorio", ruta: "/directorio" }, { nombre: `${gi.plural} en ${n.ciudad}`, ruta: lista }, { nombre: n.nombre }]} />
          <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-n-700">
            <span>Ficha del Directorio PeluDesk hecha con datos de Google Maps. No es la página oficial del negocio.</span>
            {n.verificado && <NegocioVerificado />}
          </p>
        </div>
      </div>
      <div className="mt-4 border-y border-n-200">
        <PaginaWeb datos={datos} modo="demo" portal={portalEjemplo(datos.giro)} />
      </div>
      <div className="hta mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {n.verificado ? (
          <div className="rounded-2xl bg-menta-suave p-5 sm:p-6">
            <NegocioVerificado />
            <p className="mt-2 text-lg font-bold text-n-900">El dueño ya reclamó esta ficha.</p>
            <p className="mt-1 text-n-700">Su página web está en PeluDesk; aquí ves la ficha pública del directorio.</p>
          </div>
        ) : (
          <Reclamar slug={slug} nombre={n.nombre} />
        )}
        <div className="flex flex-col gap-5 text-sm text-n-700">
          <div>
            <p className="hta-etiqueta">En {n.ciudad}</p>
            <ul className="mt-2 flex flex-col gap-2">
              <li><Link href={lista} className="hta-enlace">Más {gi.plural} en {n.ciudad}</Link></li>
              <li><Link href={`/precios-mercado?${new URLSearchParams({ giro, ciudad: ciudadSlug })}`} className="hta-enlace">Cuánto cobran {gi.plural} en {n.ciudad}</Link></li>
            </ul>
          </div>
          <p className="text-xs leading-relaxed text-n-600">
            Fotos, horario, dirección, calificación y reseñas son de Google Maps{datos.mapsUri ? <> (<a href={datos.mapsUri} target="_blank" rel="noopener noreferrer" className="underline">ver en Google Maps</a>)</> : null}; los precios y el portal son de ejemplo. Si eres el dueño y no quieres que exista esta ficha,{" "}
            <a href={whatsappQuitarPagina(n.nombre, slug)} target="_blank" rel="noopener noreferrer" className="font-semibold underline">escríbenos por WhatsApp</a> o a <a href={`mailto:${EMPRESA.correo}?subject=${encodeURIComponent(`Quitar la ficha de ${n.nombre}`)}`} className="font-semibold underline">{EMPRESA.correo}</a> y la quitamos.
          </p>
        </div>
      </div>
    </MarcoSitio>
  );
}
