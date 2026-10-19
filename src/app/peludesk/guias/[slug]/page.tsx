import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarcoSitio } from "@/components/peludesk/sitio";
import { LlamadaSobria, Migas } from "@/components/peludesk/blog";
import { EventoPixelAlVer } from "@/components/peludesk/consentimiento/evento-pixel";
import { BloquePrecio, CapturaSeo, Relacionadas } from "@/components/peludesk/seo-bloques";
import { EnlaceRegistro } from "@/components/peludesk/enlace-registro";
import { guia, todasLasGuias } from "@/lib/peludesk/guias";
import { planUnico } from "@/lib/peludesk/plan";
import { urlDemo } from "@/lib/peludesk/landing";
import { JsonLd, ORGANIZACION, SITIO, metaPagina, migas, preguntasFrecuentes } from "@/lib/peludesk/seo";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return todasLasGuias().map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = guia((await params).slug);
  if (!g) return { robots: { index: false } };
  return metaPagina({ titulo: g.titulo, descripcion: g.descripcion, ruta: `/guias/${g.slug}` });
}

export default async function Guia({ params }: Props) {
  const g = guia((await params).slug);
  if (!g) notFound();
  const plan = await planUnico();
  const ruta = `/guias/${g.slug}`;
  return (
    <MarcoSitio>
      <JsonLd
        datos={[
          migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Guías", ruta: "/guias" }, { nombre: g.h1, ruta }]),
          preguntasFrecuentes(g.preguntas),
          { "@context": "https://schema.org", "@type": "WebPage", name: g.titulo, description: g.descripcion, url: `${SITIO}${ruta}`, inLanguage: "es-MX", isPartOf: ORGANIZACION },
        ]}
      />
      <EventoPixelAlVer nombre="ViewContent" datos={{ content_name: g.titulo, content_category: "guia" }} />
      <section className="mx-auto grid max-w-6xl items-start gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.3fr_1fr] md:py-14">
        <div>
          <Migas items={[{ nombre: "Inicio", ruta: "/" }, { nombre: g.h1 }]} />
          <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-n-900 md:text-[2.4rem]">{g.h1}</h1>
          <p className="mt-4 max-w-[56ch] text-lg text-n-700">{g.gancho}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <EnlaceRegistro className="pd-boton pd-boton-primario inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full bg-morado px-6 text-base font-semibold text-white hover:bg-morado-oscuro focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave">
              Pruébalo gratis
            </EnlaceRegistro>
            <a href={`${urlDemo()}/demo`} data-pixel-evento="Lead" className="pd-boton inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full border-2 border-morado/25 bg-white px-6 text-base font-semibold text-morado hover:border-morado/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave">
              Ve el demo en 1 minuto
            </a>
          </div>
        </div>
        <div>
          <CapturaSeo {...g.captura} />
          <p className="mt-2 text-xs text-n-600">Captura del negocio de ejemplo: los datos son inventados.</p>
        </div>
      </section>

      <article className="mx-auto max-w-3xl px-4 pb-6 sm:px-6">
        {g.secciones.map((s) => (
          <section key={s.h2} className="mt-8">
            <h2 className="text-2xl font-bold text-n-900">{s.h2}</h2>
            {s.parrafos?.map((p) => (
              <p key={p} className="mt-3 text-n-700">{p}</p>
            ))}
            {s.lista && (
              <ul className="mt-3 list-disc space-y-2 pl-5 text-n-700">
                {s.lista.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </article>

      <BloquePrecio plan={plan} />

      <section aria-labelledby="preguntas" className="mx-auto max-w-3xl px-4 pb-12 sm:px-6">
        <h2 id="preguntas" className="text-2xl font-bold text-n-900">Preguntas frecuentes</h2>
        <dl className="mt-6 flex flex-col gap-3">
          {g.preguntas.map(([q, r]) => (
            <div key={q} className="rounded-2xl border border-n-200 bg-white p-5">
              <dt className="text-lg font-bold text-n-900">{q}</dt>
              <dd className="mt-2 text-n-700">{r}</dd>
            </div>
          ))}
        </dl>
        <Relacionadas rutas={[...g.relacionadas, ...todasLasGuias().filter((x) => x.slug !== g.slug).map((x) => `/guias/${x.slug}`)]} />
        <div className="mt-10"><LlamadaSobria /></div>
      </section>
    </MarcoSitio>
  );
}
