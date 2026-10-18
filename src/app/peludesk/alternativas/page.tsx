import type { Metadata } from "next";
import Link from "next/link";
import { MarcoSitio } from "@/components/peludesk/sitio";
import { LlamadaSobria, Migas } from "@/components/peludesk/blog";
import { Relacionadas } from "@/components/peludesk/seo-bloques";
import { REVISADO_ALTERNATIVAS, todasLasAlternativas } from "@/lib/peludesk/guias";
import { pesos, planUnico } from "@/lib/peludesk/plan";
import { JsonLd, SITIO, metaPagina, migas, preguntasFrecuentes } from "@/lib/peludesk/seo";

export const metadata: Metadata = metaPagina({
  titulo: "Alternativas a PeluDesk: MoeGo, Gingr y PetExec frente a un software hecho en México",
  descripcion: "Qué hace cada software para guarderías, hoteles y estéticas caninas, en qué idioma funciona, si factura en México y cuándo conviene cada uno. Comparativa honesta.",
  ruta: "/alternativas",
});

const PREGUNTAS_PROVEEDOR = [
  "¿Cuánto cuesta en pesos, con IVA, y qué se cobra aparte (mensajes, usuarios, sucursales)?",
  "¿La interfaz, el portal de mis clientes y el soporte están en español?",
  "¿Emite CFDI 4.0 y con qué proveedor de timbrado?",
  "¿Puedo cobrar con una terminal de Mercado Pago o Clip y se concilia solo?",
  "¿Puedo sacar mis datos si me voy?",
];

export default async function Alternativas() {
  const plan = await planUnico();
  const alts = todasLasAlternativas();
  const preguntas: [string, string][] = [
    ["¿Qué software de gestión existe para guarderías y estéticas caninas?", "Hay opciones internacionales como MoeGo, Gingr y PetExec, pensadas para Estados Unidos y en inglés, y opciones hechas en México como PeluDesk, con cobro en pesos y facturación CFDI."],
    ["¿Alguno de los otros factura CFDI 4.0?", "No encontramos evidencia pública de facturación CFDI en MoeGo, Gingr ni PetExec. Confírmalo con cada proveedor antes de contratar."],
    ["¿PeluDesk es mejor que MoeGo o Gingr?", "Depende de tu negocio. Si operas en Estados Unidos o tienes unidades móviles de grooming, probablemente MoeGo o Gingr te convengan más. Si estás en México y necesitas pesos, español, Mercado Pago, CFDI y clínica veterinaria en el mismo sistema, PeluDesk."],
  ];
  const ficha = [
    ["Giro", ...alts.map((a) => a.giro), "Clínica veterinaria, hotel y guardería, estética."],
    ["Precio", ...alts.map((a) => a.precio), plan ? `Un plan: ${pesos(plan.mensual)} + IVA al mes, todo incluido.` : "Un plan con todo incluido."],
    ["Español", ...alts.map((a) => a.idioma), "Sí: app, ayuda, portal del dueño y bot de WhatsApp."],
    ["Factura CFDI 4.0", ...alts.map((a) => a.cfdi), "Sí, desde el cobro, con Facturapi (etapa inicial)."],
    ["Pagos en México", ...alts.map((a) => a.pagos), "Mercado Pago (terminal y link), efectivo, transferencia y tarjeta manual."],
  ];
  return (
    <MarcoSitio>
      <JsonLd datos={[migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Alternativas", ruta: "/alternativas" }]), preguntasFrecuentes(preguntas), { "@context": "https://schema.org", "@type": "WebPage", name: "Alternativas a PeluDesk", url: `${SITIO}/alternativas`, inLanguage: "es-MX", dateModified: REVISADO_ALTERNATIVAS }]} />
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
        <Migas items={[{ nombre: "Inicio", ruta: "/" }, { nombre: "Alternativas" }]} />
        <h1 className="mt-4 max-w-[24ch] text-3xl font-bold leading-tight tracking-tight text-n-900 md:text-[2.6rem]">Alternativas a PeluDesk, sin maquillaje</h1>
        <p className="mt-4 max-w-[62ch] text-lg text-n-700">
          Somos PeluDesk, así que desconfía de esta página y verifica lo que importe. Aquí va lo que sabemos de cada alternativa, lo que no pudimos confirmar y cuándo te conviene otra.
        </p>
        <p className="mt-3 max-w-[62ch] rounded-2xl bg-menta-suave p-4 text-sm text-n-800">
          Revisado el 18 de octubre de 2026 con información pública de directorios de software. No pudimos abrir los sitios de cada proveedor, así que no publicamos precios exactos: confírmalos en su sitio. Si algo está desactualizado, escríbenos a contacto@peludesk.mx y lo corregimos.
        </p>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-n-200">
                <th scope="col" className="p-3"><span className="sr-only">Criterio</span></th>
                {alts.map((a) => <th key={a.slug} scope="col" className="p-3 text-base font-bold text-n-900"><Link href={`/alternativas/${a.slug}`} className="text-morado underline underline-offset-2">{a.nombre}</Link></th>)}
                <th scope="col" className="p-3 text-base font-bold text-n-900">PeluDesk</th>
              </tr>
            </thead>
            <tbody>
              {ficha.map(([c, ...vals]) => (
                <tr key={c} className="border-b border-n-200 align-top">
                  <th scope="row" className="p-3 font-semibold text-n-900">{c}</th>
                  {vals.map((v, i) => <td key={i} className="p-3 text-n-700">{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-12 text-2xl font-bold text-n-900">Y las hechas en México</h2>
        <p className="mt-3 max-w-[66ch] text-n-700">
          Existen otros programas veterinarios en español. No pudimos verificar sus precios, su facturación ni su estado con fuentes confiables, así que no los listamos para no inventar nada. Si evalúas alguno, hazle estas preguntas, igual que a cualquiera:
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-n-700">
          {PREGUNTAS_PROVEEDOR.map((q) => <li key={q}>{q}</li>)}
        </ul>

        <h2 className="mt-12 text-2xl font-bold text-n-900">Preguntas frecuentes</h2>
        <dl className="mt-4 flex flex-col gap-3">
          {preguntas.map(([q, r]) => (
            <div key={q} className="rounded-2xl border border-n-200 bg-white p-5">
              <dt className="text-lg font-bold text-n-900">{q}</dt>
              <dd className="mt-2 text-n-700">{r}</dd>
            </div>
          ))}
        </dl>
        <Relacionadas rutas={["/precios", "/software-para-guarderias-caninas", "/software-para-esteticas-caninas", "/software-para-hoteles-caninos", "/veterinaria"]} />
        <div className="mt-10"><LlamadaSobria /></div>
      </section>
    </MarcoSitio>
  );
}
