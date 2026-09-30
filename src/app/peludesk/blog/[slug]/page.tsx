import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarcoSitio } from "@/components/peludesk/sitio";
import { IlustracionDeArticulo, LlamadaSobria, Migas, RejillaArticulos } from "@/components/peludesk/blog";
import { EventoPixelAlVer } from "@/components/peludesk/consentimiento/evento-pixel";
import { Markdown, encabezados, parsearMarkdown } from "@/lib/peludesk/markdown";
import { CATEGORIAS, articuloPorSlug, fechaLarga, imagenDeArticulo, relacionados } from "@/lib/peludesk/blog";
import { JsonLd, ORGANIZACION, SITIO, metaPagina, migas } from "@/lib/peludesk/seo";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = articuloPorSlug((await params).slug);
  if (!a) return { robots: { index: false } };
  return metaPagina({
    titulo: `${a.titulo} | PeluDesk`,
    descripcion: a.descripcion,
    ruta: `/blog/${a.slug}`,
    imagen: { url: imagenDeArticulo(a), alt: a.titulo },
    tipo: "article",
    publicado: a.fecha,
    actualizado: a.actualizado,
    seccion: CATEGORIAS[a.categoria].nombre,
  });
}

export default async function ArticuloPage({ params }: Props) {
  const a = articuloPorSlug((await params).slug);
  if (!a) notFound();
  const bloques = parsearMarkdown(a.cuerpo);
  const toc = encabezados(bloques).filter((h) => h.texto.toLowerCase() !== "fuentes");
  const categoria = CATEGORIAS[a.categoria];
  const ruta = `/blog/${a.slug}`;
  return (
    <MarcoSitio>
      <JsonLd
        datos={[
          migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Blog", ruta: "/blog" }, { nombre: categoria.nombre, ruta: `/blog/categoria/${a.categoria}` }, { nombre: a.titulo, ruta }]),
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: a.titulo,
            description: a.descripcion,
            inLanguage: "es-MX",
            datePublished: a.fecha,
            dateModified: a.actualizado,
            image: `${SITIO}${imagenDeArticulo(a)}`,
            articleSection: categoria.nombre,
            wordCount: a.palabras,
            mainEntityOfPage: `${SITIO}${ruta}`,
            author: ORGANIZACION,
            publisher: ORGANIZACION,
          },
        ]}
      />
      <EventoPixelAlVer nombre="ViewContent" datos={{ content_name: a.titulo, content_category: "blog" }} />
      <article className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
        <Migas items={[{ nombre: "Inicio", ruta: "/" }, { nombre: "Blog", ruta: "/blog" }, { nombre: categoria.nombre, ruta: `/blog/categoria/${a.categoria}` }, { nombre: a.titulo }]} />
        <div className="mt-6 grid items-center gap-6 md:grid-cols-[1fr_minmax(0,18rem)]">
          <div>
            <Link href={`/blog/categoria/${a.categoria}`} className="text-sm font-bold uppercase tracking-[0.1em] text-menta-oscuro hover:underline">
              {categoria.nombre}
            </Link>
            <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-n-900 md:text-[2.5rem]">{a.titulo}</h1>
            <p className="mt-3 max-w-[60ch] text-lg text-n-700">{a.descripcion}</p>
            <p className="mt-4 text-sm text-n-600">
              Publicado el <time dateTime={a.fecha}>{fechaLarga(a.fecha)}</time>
              {a.actualizado !== a.fecha && (
                <>
                  {" "}· Actualizado el <time dateTime={a.actualizado}>{fechaLarga(a.actualizado)}</time>
                </>
              )}{" "}
              · {a.minutos} min de lectura
            </p>
          </div>
          <div className="hidden aspect-square place-items-center rounded-3xl bg-menta-suave p-6 md:grid">
            <IlustracionDeArticulo a={a} className="max-h-full w-auto object-contain" />
          </div>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="min-w-0">
            {toc.length > 2 && (
              <nav aria-label="Contenido del artículo" className="mb-8 rounded-2xl border border-n-200 bg-white p-5 lg:hidden">
                <p className="text-sm font-bold uppercase tracking-[0.1em] text-n-600">En este artículo</p>
                <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-n-800">
                  {toc.map((h) => (
                    <li key={h.id}>
                      <a href={`#${h.id}`} className="hover:text-morado hover:underline">{h.texto}</a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}
            <Markdown bloques={bloques} />
          </div>
          {toc.length > 2 && (
            <aside className="hidden lg:block">
              <nav aria-label="Contenido del artículo" className="sticky top-24 rounded-2xl border border-n-200 bg-white p-5">
                <p className="text-sm font-bold uppercase tracking-[0.1em] text-n-600">En este artículo</p>
                <ol className="mt-3 flex flex-col gap-2 text-sm">
                  {toc.map((h) => (
                    <li key={h.id}>
                      <a href={`#${h.id}`} className="text-n-800 hover:text-morado hover:underline">{h.texto}</a>
                    </li>
                  ))}
                </ol>
              </nav>
            </aside>
          )}
        </div>

        <div className="mt-14 max-w-3xl">
          <LlamadaSobria />
        </div>

        <section aria-labelledby="mas-articulos" className="mt-14">
          <h2 id="mas-articulos" className="text-2xl font-bold text-n-900">Sigue leyendo</h2>
          <div className="mt-5">
            <RejillaArticulos articulos={relacionados(a, 3)} />
          </div>
        </section>
      </article>
    </MarcoSitio>
  );
}
