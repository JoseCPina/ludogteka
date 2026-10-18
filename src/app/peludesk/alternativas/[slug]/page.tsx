import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarcoSitio } from "@/components/peludesk/sitio";
import { LlamadaSobria, Migas } from "@/components/peludesk/blog";
import { Relacionadas } from "@/components/peludesk/seo-bloques";
import { Fuentes } from "@/components/peludesk/fuentes";
import { CAMPOS_ALTERNATIVA, FILA_PELUDESK, REVISADO_ALTERNATIVAS, REVISADO_ALTERNATIVAS_TEXTO, alternativa, todasLasAlternativas } from "@/lib/peludesk/guias";
import { pesos, planUnico } from "@/lib/peludesk/plan";
import { JsonLd, SITIO, metaPagina, migas, preguntasFrecuentes } from "@/lib/peludesk/seo";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return todasLasAlternativas().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = alternativa((await params).slug);
  if (!a) return { robots: { index: false } };
  return metaPagina({
    titulo: `PeluDesk o ${a.nombre}: cuál conviene a un negocio canino en México`,
    descripcion: `${a.nombre} frente a PeluDesk: giro, precio vigente, idioma, factura CFDI, pagos en México, en qué es mejor cada uno y cuándo conviene.`,
    ruta: `/alternativas/${a.slug}`,
  });
}

export default async function PaginaAlternativa({ params }: Props) {
  const a = alternativa((await params).slug);
  if (!a) notFound();
  const plan = await planUnico();
  const ruta = `/alternativas/${a.slug}`;
  const precioPeluDesk = plan ? `Un plan: ${pesos(plan.mensual)} + IVA al mes, todo incluido, sin costo inicial.` : "Un plan con todo incluido.";
  const preguntas: [string, string][] = [
    [`¿${a.nombre} factura CFDI 4.0?`, a.cfdi],
    [`¿${a.nombre} está en español?`, a.idioma],
    [`¿Cuándo conviene ${a.nombre} y cuándo PeluDesk?`, `${a.nombre} conviene si: ${a.conviene.join(" ")} PeluDesk conviene si estás en México y necesitas pesos, español, CFDI y todo en un plan.`],
    [`¿En qué es mejor ${a.nombre} que PeluDesk?`, a.mejorEn.join(" ")],
  ];
  return (
    <MarcoSitio>
      <JsonLd datos={[migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Alternativas", ruta: "/alternativas" }, { nombre: a.nombre, ruta }]), preguntasFrecuentes(preguntas), { "@context": "https://schema.org", "@type": "WebPage", name: `PeluDesk o ${a.nombre}`, url: `${SITIO}${ruta}`, inLanguage: "es-MX", dateModified: REVISADO_ALTERNATIVAS }]} />
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 md:py-14">
        <Migas items={[{ nombre: "Inicio", ruta: "/" }, { nombre: "Alternativas", ruta: "/alternativas" }, { nombre: a.nombre }]} />
        <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-n-900 md:text-[2.4rem]">PeluDesk o {a.nombre}: cuál conviene en México</h1>
        <p className="mt-4 max-w-[62ch] text-lg text-n-700">{a.resumen}</p>
        <p className="mt-3 rounded-2xl bg-menta-suave p-4 text-sm text-n-800">
          Revisado el {REVISADO_ALTERNATIVAS_TEXTO} contra el sitio oficial de {a.nombre}; cada dato dice de qué página salió. Somos parte interesada: confirma lo que te importe en el <a href={a.sitio} target="_blank" rel="noopener nofollow" className="font-semibold text-morado underline underline-offset-2">sitio de {a.nombre}</a>.
        </p>
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-n-200">
                <th scope="col" className="p-3"><span className="sr-only">Criterio</span></th>
                <th scope="col" className="p-3 text-base font-bold text-n-900">{a.nombre}</th>
                <th scope="col" className="p-3 text-base font-bold text-n-900">PeluDesk</th>
              </tr>
            </thead>
            <tbody>
              {CAMPOS_ALTERNATIVA.map(([campo, etiqueta]) => (
                <tr key={campo} className="border-b border-n-200 align-top">
                  <th scope="row" className="p-3 font-semibold text-n-900">{etiqueta}</th>
                  <td className="p-3 text-n-700">{a[campo]}<Fuentes fuentes={a.fuentes[campo]} /></td>
                  <td className="p-3 text-n-700">{campo === "precio" ? precioPeluDesk : FILA_PELUDESK[campo]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section aria-labelledby="mejor" className="mt-10">
          <h2 id="mejor" className="text-xl font-bold text-n-900">En qué {a.nombre} es mejor que PeluDesk</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-n-700">{a.mejorEn.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <section aria-labelledby="otro">
            <h2 id="otro" className="text-xl font-bold text-n-900">Conviene {a.nombre} si…</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-n-700">{a.conviene.map((x) => <li key={x}>{x}</li>)}</ul>
          </section>
          <section aria-labelledby="pd">
            <h2 id="pd" className="text-xl font-bold text-n-900">Conviene PeluDesk si…</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-n-700">{a.noConviene.map((x) => <li key={x}>{x}</li>)}</ul>
          </section>
        </div>
        <p className="mt-6 max-w-[66ch] text-n-700">{a.peludesk}</p>
        <Relacionadas rutas={["/alternativas", "/precios", "/software-para-guarderias-caninas", "/guias/facturacion-cfdi-para-esteticas-y-veterinarias"]} />
        <p className="mt-6 text-sm text-n-600">Otras comparativas: {todasLasAlternativas().filter((x) => x.slug !== a.slug).map((x, i) => <span key={x.slug}>{i > 0 && " · "}<Link href={`/alternativas/${x.slug}`} className="font-semibold text-morado underline underline-offset-2">{x.nombre}</Link></span>)}</p>
        <div className="mt-10"><LlamadaSobria /></div>
      </section>
    </MarcoSitio>
  );
}
