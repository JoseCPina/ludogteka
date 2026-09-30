import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarcoSitio } from "@/components/peludesk/sitio";
import { LlamadaSobria, Migas, RejillaArticulos } from "@/components/peludesk/blog";
import { EnlaceRegistro } from "@/components/peludesk/enlace-registro";
import { EventoPixelAlVer } from "@/components/peludesk/consentimiento/evento-pixel";
import { Ilustracion } from "@/components/peludesk/ilustracion";
import { aterrizaje, todosLosAterrizajes } from "@/lib/peludesk/aterrizajes";
import { articuloPorSlug } from "@/lib/peludesk/blog";
import { urlDemo } from "@/lib/peludesk/landing";
import { JsonLd, ORGANIZACION, SITIO, metaPagina, migas, preguntasFrecuentes } from "@/lib/peludesk/seo";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = aterrizaje((await params).slug);
  if (!a) return { robots: { index: false } };
  return metaPagina({ titulo: a.titulo, descripcion: a.descripcion, ruta: `/${a.slug}` });
}

export default async function Aterrizaje({ params }: Props) {
  const a = aterrizaje((await params).slug);
  if (!a) notFound();
  const arts = a.articulos.map((s) => articuloPorSlug(s)).filter((x) => x !== null);
  const otras = todosLosAterrizajes().filter((x) => x.slug !== a.slug);
  const ruta = `/${a.slug}`;
  return (
    <MarcoSitio>
      <JsonLd
        datos={[
          migas([{ nombre: "Inicio", ruta: "/" }, { nombre: a.h1, ruta }]),
          preguntasFrecuentes(a.preguntas),
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: a.titulo,
            description: a.descripcion,
            url: `${SITIO}${ruta}`,
            inLanguage: "es-MX",
            isPartOf: ORGANIZACION,
          },
        ]}
      />
      <EventoPixelAlVer nombre="ViewContent" datos={{ content_name: a.titulo, content_category: "aterrizaje" }} />

      <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.2fr_1fr] md:py-16">
        <div>
          <Migas items={[{ nombre: "Inicio", ruta: "/" }, { nombre: a.h1 }]} />
          <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-n-900 md:text-[2.6rem]">{a.h1}</h1>
          <p className="mt-4 max-w-[52ch] text-lg text-n-700">{a.gancho}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <EnlaceRegistro className="pd-boton pd-boton-primario inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full bg-morado px-6 text-base font-semibold text-white hover:bg-morado-oscuro focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave">
              Pruébalo 15 días gratis
            </EnlaceRegistro>
            <a
              href={`${urlDemo()}/demo`}
              data-pixel-evento="Lead"
              className="pd-boton inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full border-2 border-morado/25 bg-white px-6 text-base font-semibold text-morado hover:border-morado/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
            >
              Ve el demo en 1 minuto
            </a>
          </div>
          <p className="mt-3 text-sm text-n-600">Sin tarjeta. Al terminar la prueba tu información se queda.</p>
        </div>
        <div className="grid place-items-center rounded-3xl bg-menta-suave p-6">
          <Ilustracion nombre={a.ilustracion} prioridad className="h-auto w-full max-w-[26rem]" sizes="(min-width: 768px) 420px, 90vw" />
        </div>
      </section>

      <section aria-labelledby="alivios" className="border-y border-n-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 id="alivios" className="text-2xl font-bold text-n-900">Lo que te quitas de encima</h2>
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {a.alivios.map((x) => (
              <li key={x.antes} className="rounded-2xl border border-n-200 bg-crema p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-n-600 line-through decoration-coral/60">{x.antes}</p>
                <p className="mt-2 text-lg font-semibold text-n-900">{x.ahora}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="funciones" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 id="funciones" className="text-2xl font-bold text-n-900">Lo que hace por tu negocio</h2>
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {a.funciones.map((f) => (
            <li key={f.titulo} className="rounded-2xl border border-n-200 bg-white p-5">
              <h3 className="text-lg font-bold text-n-900">{f.titulo}</h3>
              <p className="mt-2 text-n-700">{f.texto}</p>
            </li>
          ))}
        </ul>
      </section>

      {arts.length > 0 && (
        <section aria-labelledby="guias" className="border-t border-n-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            <h2 id="guias" className="text-2xl font-bold text-n-900">Guías para leer antes</h2>
            <p className="mt-2 max-w-[60ch] text-n-700">Sirven aunque nunca uses PeluDesk.</p>
            <div className="mt-6">
              <RejillaArticulos articulos={arts} />
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="preguntas" className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h2 id="preguntas" className="text-2xl font-bold text-n-900">Preguntas frecuentes</h2>
        <dl className="mt-6 flex flex-col gap-3">
          {a.preguntas.map(([q, r]) => (
            <div key={q} className="rounded-2xl border border-n-200 bg-white p-5">
              <dt className="text-lg font-bold text-n-900">{q}</dt>
              <dd className="mt-2 text-n-700">{r}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-10">
          <LlamadaSobria />
        </div>
        <p className="mt-8 text-sm text-n-600">
          También para:{" "}
          {otras.map((o, i) => (
            <span key={o.slug}>
              {i > 0 && " · "}
              <Link href={`/${o.slug}`} className="font-semibold text-morado underline underline-offset-2">
                {o.h1.split(" que ")[0]}
              </Link>
            </span>
          ))}
        </p>
      </section>
    </MarcoSitio>
  );
}
