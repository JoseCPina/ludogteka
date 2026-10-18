import type { Metadata } from "next";
import { MarcoSitio } from "@/components/peludesk/sitio";
import { LlamadaSobria, Migas } from "@/components/peludesk/blog";
import { EnlaceRegistro } from "@/components/peludesk/enlace-registro";
import { EventoPixelAlVer } from "@/components/peludesk/consentimiento/evento-pixel";
import { Ilustracion } from "@/components/peludesk/ilustracion";
import { urlDemo } from "@/lib/peludesk/landing";
import { CAPTURAS_VET, DESCRIPCION_VET, FUNCIONES_VET, MENSAJES_CLAVE, MODULOS_TRES, PREGUNTAS_VET } from "@/lib/peludesk/veterinaria";
import { CasoLudogteka, Relacionadas } from "@/components/peludesk/seo-bloques";
import { CASO_POR_GIRO } from "@/lib/peludesk/ludogteka";
import { PrecioPlan } from "@/components/peludesk/precio-plan";
import { planUnico, pesos } from "@/lib/peludesk/plan";
import { JsonLd, SITIO, aplicacionPeluDesk, metaPagina, migas, preguntasFrecuentes } from "@/lib/peludesk/seo";

const RUTA = "/veterinaria";
const TITULO = "Software para veterinarias en México: expediente, recetas y carnet | PeluDesk";

export const metadata: Metadata = metaPagina({
  titulo: TITULO,
  descripcion: DESCRIPCION_VET,
  ruta: RUTA,
  imagen: { url: "/peludesk/capturas/vet-expediente-escritorio-1600.webp", width: 1600, height: 1000, alt: "Expediente clínico de una mascota en PeluDesk" },
});

const botonPrimario =
  "pd-boton pd-boton-primario inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full bg-morado px-6 text-base font-semibold text-white hover:bg-morado-oscuro focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave";
const botonSecundario =
  "pd-boton inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full border-2 border-morado/25 bg-white px-6 text-base font-semibold text-morado hover:border-morado/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave";

export default async function PaginaVeterinaria() {
  const plan = await planUnico();
  const demo = `${urlDemo()}/demo/entrar/veterinaria`;
  return (
    <MarcoSitio>
      <JsonLd
        datos={[
          migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Veterinaria", ruta: RUTA }]),
          preguntasFrecuentes(PREGUNTAS_VET),
          {
            ...aplicacionPeluDesk(plan, { nombre: "PeluDesk Veterinaria", url: `${SITIO}${RUTA}`, descripcion: DESCRIPCION_VET }),
            "@id": `${SITIO}${RUTA}#aplicacion`,
            applicationSubCategory: "Software para clínicas veterinarias",
            featureList: FUNCIONES_VET.map((f) => f.titulo),
            isPartOf: { "@id": `${SITIO}/#aplicacion` },
          },
        ]}
      />
      <EventoPixelAlVer nombre="ViewContent" datos={{ content_name: TITULO, content_category: "veterinaria" }} />

      {/* ── Encabezado ── */}
      <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.2fr_1fr] md:py-16">
        <div>
          <Migas items={[{ nombre: "Inicio", ruta: "/" }, { nombre: "Veterinaria" }]} />
          <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-n-900 md:text-[2.6rem]">
            Software para clínicas veterinarias: expediente, carnet, recetas y hospitalización
          </h1>
          <p className="mt-4 max-w-[52ch] text-lg text-n-700">
            Lo clínico y lo del mostrador en el mismo lugar: la consulta se firma, la vacuna se recuerda, la receta queda ligada al lote y todo lo que se hace
            llega a la cuenta para cobrarlo.
          </p>
          {plan && <PrecioPlan plan={plan} tamano="mediano" className="mt-6" />}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <EnlaceRegistro className={botonPrimario}>Pruébalo 15 días gratis</EnlaceRegistro>
            <a href={demo} data-pixel-evento="Lead" className={botonSecundario}>
              Ver demo
            </a>
          </div>
          <p className="mt-3 text-sm text-n-600">Sin tarjeta. La demo es de solo lectura y no manda mensajes de verdad.</p>
        </div>
        <div className="grid place-items-center rounded-3xl bg-menta-suave p-6">
          <Ilustracion nombre="escena-vacunas" prioridad className="h-auto w-full max-w-[26rem]" sizes="(min-width: 768px) 420px, 90vw" />
        </div>
      </section>

      {/* ── Lo que hace ── */}
      <section aria-labelledby="funciones" className="border-y border-n-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 id="funciones" className="text-2xl font-bold text-n-900">Lo que ya hace por tu clínica</h2>
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FUNCIONES_VET.map((f) => (
              <li key={f.titulo} className="rounded-2xl border border-n-200 bg-crema p-5">
                <h3 className="text-lg font-bold text-n-900">{f.titulo}</h3>
                <p className="mt-2 text-n-700">{f.texto}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Se ve así ── */}
      <section aria-labelledby="capturas" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 id="capturas" className="text-2xl font-bold text-n-900">Así se ve</h2>
        <p className="mt-2 max-w-[60ch] text-n-700">Capturas del negocio de ejemplo: todos los datos son inventados.</p>
        <ul className="mt-8 grid gap-8 md:grid-cols-2">
          {CAPTURAS_VET.map((c) => (
            <li key={c.captura} className="flex flex-col gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/peludesk/capturas/${c.captura}-escritorio-1600.webp`}
                srcSet={`/peludesk/capturas/${c.captura}-escritorio-800.webp 800w, /peludesk/capturas/${c.captura}-escritorio-1600.webp 1600w`}
                sizes="(min-width: 768px) 560px, 100vw"
                width={1600}
                height={1000}
                alt={c.alt}
                loading="lazy"
                decoding="async"
                className="h-auto w-full rounded-[18px] border border-n-200 bg-white"
              />
              <h3 className="text-lg font-bold text-n-900">{c.titulo}</h3>
              <p className="text-n-700">{c.texto}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Lo que cuidamos ── */}
      <section aria-labelledby="cuidado" className="border-y border-n-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 id="cuidado" className="text-2xl font-bold text-n-900">Lo clínico se cuida</h2>
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              ["Una consulta firmada no se edita", "Se le agrega una adenda firmada o se anula con motivo. Nada se borra."],
              ["Quien abre un expediente queda registrado", "Y el dueño nunca ve las notas internas ni lo que cuesta."],
              ["Un controlado no sale sin su receta", "El inventario se niega a darlo de baja sin el documento que le toca."],
              ["Cada médico, con su cédula", "La firma lleva la cédula y el nombre de quien atendió, y solo un médico designado firma o emite recetas."],
            ].map(([t, x]) => (
              <li key={t} className="rounded-2xl border border-n-200 bg-crema p-5">
                <p className="text-lg font-semibold text-n-900">{t}</p>
                <p className="mt-2 text-n-700">{x}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Los tres módulos ── */}
      <section aria-labelledby="modulos" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 id="modulos" className="text-2xl font-bold text-n-900">Y también hotel, guardería y estética, ya incluidos</h2>
        <p className="mt-2 max-w-[62ch] text-n-700">
          {plan ? `Todo va en el mismo plan de ${pesos(plan.mensual)} + IVA al mes. ` : ""}Usa solo lo que tu negocio hace: cada módulo se prende o se apaga desde el panel de administración, y apagar uno nunca borra lo que ya tenías.
        </p>
        <ul className="mt-6 grid gap-5 md:grid-cols-3">
          {MODULOS_TRES.map((m) => (
            <li key={m.clave} className="rounded-2xl border border-n-200 bg-white p-5">
              <h3 className="text-lg font-bold text-n-900">{m.nombre}</h3>
              <p className="mt-2 text-n-700">{m.texto}</p>
            </li>
          ))}
        </ul>
        <ul className="mt-6 flex flex-wrap gap-2">
          {MENSAJES_CLAVE.map((m) => (
            <li key={m} className="rounded-full bg-menta-suave px-4 py-2 text-sm font-semibold text-morado">
              {m}
            </li>
          ))}
        </ul>
      </section>

      <CasoLudogteka caso={CASO_POR_GIRO.veterinaria} />

      {/* ── Preguntas ── */}
      <section aria-labelledby="preguntas" className="mx-auto max-w-3xl px-4 pb-12 sm:px-6">
        <h2 id="preguntas" className="text-2xl font-bold text-n-900">Preguntas frecuentes</h2>
        <dl className="mt-6 flex flex-col gap-3">
          {PREGUNTAS_VET.map(([q, r]) => (
            <div key={q} className="rounded-2xl border border-n-200 bg-white p-5">
              <dt className="text-lg font-bold text-n-900">{q}</dt>
              <dd className="mt-2 text-n-700">{r}</dd>
            </div>
          ))}
        </dl>
        <Relacionadas rutas={["/precios", "/guias/facturacion-cfdi-para-esteticas-y-veterinarias", "/guias/recordatorios-por-whatsapp-y-portal-para-duenos-de-mascotas", "/alternativas", "/ayuda/carnet-de-la-mascota"]} />
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <EnlaceRegistro className={botonPrimario}>Pruébalo 15 días gratis</EnlaceRegistro>
          <a href={demo} data-pixel-evento="Lead" className={botonSecundario}>
            Ver demo
          </a>
        </div>
        <div className="mt-10">
          <LlamadaSobria />
        </div>
      </section>
    </MarcoSitio>
  );
}
