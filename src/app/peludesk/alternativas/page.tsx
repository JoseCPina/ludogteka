import type { Metadata } from "next";
import Link from "next/link";
import { MarcoSitio } from "@/components/peludesk/sitio";
import { LlamadaSobria, Migas } from "@/components/peludesk/blog";
import { Fuentes } from "@/components/peludesk/fuentes";
import { Relacionadas } from "@/components/peludesk/seo-bloques";
import { CAMPOS_ALTERNATIVA, FILA_PELUDESK, REVISADO_ALTERNATIVAS, REVISADO_ALTERNATIVAS_TEXTO, todasLasAlternativas, type Alternativa } from "@/lib/peludesk/guias";
import { pesos, planUnico } from "@/lib/peludesk/plan";
import { recordatoriosVigentes } from "@/lib/peludesk/recordatorios";
import { JsonLd, SITIO, metaPagina, migas, preguntasFrecuentes } from "@/lib/peludesk/seo";

export const metadata: Metadata = metaPagina({
  titulo: "Alternativas a PeluDesk: MoeGo, Gingr, SICAR, AgendaPro, QVET y más",
  descripcion: "Software para guarderías, hoteles, estéticas y veterinarias, de Estados Unidos y de Latinoamérica: precio vigente, idioma, factura CFDI y en qué es mejor cada uno.",
  ruta: "/alternativas",
});

const PREGUNTAS_PROVEEDOR = [
  "¿Cuánto cuesta en pesos, con IVA, y qué se cobra aparte (mensajes, usuarios, sucursales, timbres)?",
  "¿La interfaz, el portal de mis clientes y el soporte están en español?",
  "¿Emite CFDI 4.0 y con qué proveedor de timbrado?",
  "¿Puedo cobrar con una terminal de Mercado Pago o Clip y se concilia sola?",
  "¿Puedo sacar mis datos si me voy?",
];

function Tabla({ alts, precioPeluDesk, recordatoriosPeluDesk }: { alts: Alternativa[]; precioPeluDesk: string; recordatoriosPeluDesk: string }) {
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-n-200">
            <th scope="col" className="p-3"><span className="sr-only">Criterio</span></th>
            {alts.map((a) => <th key={a.slug} scope="col" className="p-3 text-base font-bold text-n-900"><Link href={`/alternativas/${a.slug}`} className="text-morado underline underline-offset-2">{a.nombre}</Link></th>)}
            <th scope="col" className="p-3 text-base font-bold text-n-900">PeluDesk</th>
          </tr>
        </thead>
        <tbody>
          {CAMPOS_ALTERNATIVA.map(([campo, etiqueta]) => (
            <tr key={campo} className={`border-b border-n-200 align-top ${campo === "recordatorios" ? "bg-menta-suave" : ""}`}>
              <th scope="row" className="p-3 font-semibold text-n-900">{etiqueta}</th>
              {alts.map((a) => <td key={a.slug} className="p-3 text-n-700">{a[campo]}<Fuentes fuentes={a.fuentes[campo]} /></td>)}
              <td className={`p-3 ${campo === "recordatorios" ? "font-semibold text-n-900" : "text-n-700"}`}>{campo === "precio" ? precioPeluDesk : campo === "recordatorios" ? recordatoriosPeluDesk : FILA_PELUDESK[campo]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-n-600">«—»: no lo verificamos en su sitio.</p>
    </div>
  );
}

export default async function Alternativas() {
  const [plan, recordatorios] = await Promise.all([planUnico(), recordatoriosVigentes()]);
  const alts = todasLasAlternativas();
  const internacionales = alts.filter((a) => a.region === "internacional");
  const latam = alts.filter((a) => a.region === "latam");
  const precioPeluDesk = plan ? `Un plan: ${pesos(plan.mensual)} + IVA al mes, todo incluido.` : "Un plan con todo incluido.";
  const preguntas: [string, string][] = [
    ["¿Qué software de gestión existe para guarderías, estéticas y veterinarias?", "De Estados Unidos, en inglés y en dólares: MoeGo, Gingr y PetExec (hoy parte de Gingr). En español: SICAR (punto de venta mexicano con versión para veterinarias), AgendaPro (agenda latinoamericana con precios en pesos), QVET (software veterinario español con oficina en la Ciudad de México), OkVet (software veterinario colombiano) y PeluDesk."],
    ["¿Cuáles facturan CFDI 4.0?", "De los que revisamos, SICAR factura CFDI 4.0 y QVET dice facturar conforme a los requisitos de México. AgendaPro lo tiene como «próximamente», OkVet factura con la DIAN de Colombia y MoeGo, Gingr y PetExec no lo mencionan. PeluDesk factura CFDI 4.0 desde el cobro."],
    ["¿Cuáles mandan recordatorios automáticos por WhatsApp?", `De los que revisamos, AgendaPro los vende como complemento aparte y QVET menciona campañas por WhatsApp, OkVet menciona recordatorios por correo y MoeGo menciona recordatorios sin que verificáramos el canal. PeluDesk los manda solo un día antes de cada cita, consulta o llegada, y el cliente confirma con un botón. ${recordatorios.lineaPrecio}`],
    ["¿PeluDesk es mejor que los demás?", "Depende de tu negocio. MoeGo es mejor para estéticas móviles, Gingr para cadenas de guarderías en Estados Unidos con app de reservas, SICAR para tiendas y farmacias veterinarias con mucho mostrador, AgendaPro para reservas en línea y QVET para hospitales y grupos grandes. PeluDesk conviene si estás en México y quieres veterinaria, hotel, guardería y estética en un solo plan, en pesos y con CFDI."],
  ];
  return (
    <MarcoSitio>
      <JsonLd datos={[migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Alternativas", ruta: "/alternativas" }]), preguntasFrecuentes(preguntas), { "@context": "https://schema.org", "@type": "WebPage", name: "Alternativas a PeluDesk", url: `${SITIO}/alternativas`, inLanguage: "es-MX", dateModified: REVISADO_ALTERNATIVAS }]} />
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
        <Migas items={[{ nombre: "Inicio", ruta: "/" }, { nombre: "Alternativas" }]} />
        <h1 className="mt-4 max-w-[24ch] text-3xl font-bold leading-tight tracking-tight text-n-900 md:text-[2.6rem]">Alternativas a PeluDesk, sin maquillaje</h1>
        <p className="mt-4 max-w-[62ch] text-lg text-n-700">
          Somos PeluDesk, así que desconfía de esta página y verifica lo que importe. Aquí va lo que dice cada proveedor en su propio sitio, lo que no pudimos confirmar, en qué es mejor que nosotros y cuándo te conviene.
        </p>
        <p className="mt-3 max-w-[62ch] rounded-2xl bg-menta-suave p-4 text-sm text-n-800">
          Revisado el {REVISADO_ALTERNATIVAS_TEXTO} contra el sitio oficial de cada proveedor; cada dato dice de qué página salió. Los precios cambian: confírmalos antes de contratar. Si algo está desactualizado, escríbenos a contacto@peludesk.mx y lo corregimos.
        </p>

        <h2 className="mt-12 text-2xl font-bold text-n-900">Hechas para Estados Unidos</h2>
        <p className="mt-3 max-w-[66ch] text-n-700">En inglés y en dólares. Muy buenas en lo suyo, pensadas para ese mercado.</p>
        <Tabla alts={internacionales} precioPeluDesk={precioPeluDesk} recordatoriosPeluDesk={recordatorios.filaComparativa} />

        <h2 className="mt-12 text-2xl font-bold text-n-900">En español, que se usan en México y Latinoamérica</h2>
        <p className="mt-3 max-w-[66ch] text-n-700">Solo listamos las que pudimos confirmar en su sitio oficial. Hay más programas veterinarios en español; si evalúas otro, hazle estas preguntas:</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-n-700">
          {PREGUNTAS_PROVEEDOR.map((q) => <li key={q}>{q}</li>)}
        </ul>
        <Tabla alts={latam} precioPeluDesk={precioPeluDesk} recordatoriosPeluDesk={recordatorios.filaComparativa} />

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
