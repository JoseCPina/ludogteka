import type { Metadata } from "next";
import Link from "next/link";
import { MarcoHerramienta } from "@/components/herramientas/marco";
import { herramientaPorClave } from "@/lib/herramientas/lista";
import { sesionesVivas } from "@/lib/escuela/datos";
import { SESIONES, fechaEnTexto, textoInscripcion } from "@/lib/escuela/sesiones";
import { numeroBot } from "@/lib/directorio/reclamo";
import { JsonLd, ORGANIZACION, SITIO, metaPagina, migas, preguntasFrecuentes } from "@/lib/peludesk/seo";

/** /escuela: la serie educativa, su calendario y la inscripción por WhatsApp. */
export const dynamic = "force-dynamic";
const h = herramientaPorClave("escuela")!;

export const metadata: Metadata = metaPagina({
  titulo: "Escuela PeluDesk: seis sesiones gratis para negocios de mascotas | PeluDesk",
  descripcion: "Cuánto cobrar, plantones, cuánto cuesta abrir, caja sin sorpresas, clientes que vuelven y lo que te van a pedir: sesiones en vivo con guía escrita y herramienta. Inscripción por WhatsApp.",
  ruta: "/escuela",
});

const PREGUNTAS: [string, string][] = [
  ["¿Cuánto cuesta?", "Nada. Las sesiones, las guías y las herramientas son gratis, con o sin cuenta de PeluDesk."],
  ["¿Cómo me inscribo?", "Con el botón de cada sesión se abre WhatsApp con el mensaje listo; al mandarlo quedas inscrito y una hora antes te llega la liga. Te preguntamos tu giro y tu ciudad para preparar la sesión."],
  ["¿Y si no puedo ese día?", "La grabación queda en la página de la sesión, con la guía escrita y la herramienta del tema."],
];

export default async function Escuela() {
  const vivas = await sesionesVivas();
  const bot = numeroBot();
  return (
    <MarcoHerramienta clave="escuela" relacionadas={["/precios-mercado", "/diagnostico"]} cierre={{ titulo: "La calculadora de precios de la Escuela", texto: "Es el Índice PeluDesk de precios más el costo por servicio: dónde cobra tu ciudad y cuánto te cuesta a ti.", boton: "Abrir el índice de precios", href: "/precios-mercado" }}>
      <JsonLd datos={[migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Herramientas", ruta: "/herramientas" }, { nombre: h.nombre, ruta: h.ruta }]), { "@context": "https://schema.org", "@type": "WebApplication", name: h.nombre, url: `${SITIO}${h.ruta}`, description: h.que, applicationCategory: "EducationalApplication", operatingSystem: "Web", inLanguage: "es-MX", isAccessibleForFree: true, offers: { "@type": "Offer", price: 0, priceCurrency: "MXN" }, publisher: ORGANIZACION }, { "@context": "https://schema.org", "@type": "Course", name: "Escuela PeluDesk", description: h.que, provider: ORGANIZACION, inLanguage: "es-MX", isAccessibleForFree: true, url: `${SITIO}/escuela`, hasCourseInstance: SESIONES.map((s) => { const v = vivas.find((x) => x.clave === s.clave); return { "@type": "CourseInstance", name: s.titulo, courseMode: "online", ...(v?.fecha_at ? { startDate: v.fecha_at } : {}), url: `${SITIO}/escuela/${s.clave}` }; }), offers: { "@type": "Offer", price: 0, priceCurrency: "MXN" } }, preguntasFrecuentes(PREGUNTAS)]} />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <ol className="hta-regla" data-sesiones>
          {SESIONES.map((s, i) => {
            const v = vivas.find((x) => x.clave === s.clave);
            const fecha = fechaEnTexto(v?.fecha_at);
            return (
              <li key={s.clave} className="grid gap-x-10 gap-y-3 border-b border-n-200 py-8 md:grid-cols-[5rem_minmax(0,1.3fr)_minmax(0,1fr)]" data-sesion={s.clave}>
                <span className="text-sm font-bold tracking-[0.14em] text-morado">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-n-900"><Link href={`/escuela/${s.clave}`} className="hover:underline">{s.titulo}</Link></h2>
                  <p className="mt-2 text-n-800">{s.resumen}</p>
                  <p className="mt-2 text-sm text-n-600">{fecha ?? "Fecha por anunciar"}{v?.youtube_id ? " · Grabación disponible" : ""}{v && v.inscritos > 0 ? ` · ${v.inscritos} inscritos` : ""}</p>
                </div>
                <div className="flex flex-col items-start gap-2">
                  {bot ? (
                    <a href={`https://wa.me/${bot}?text=${encodeURIComponent(textoInscripcion(s))}`} target="_blank" rel="noopener noreferrer" className="hta-boton" data-inscribirme>Inscribirme por WhatsApp</a>
                  ) : (
                    <Link href={`/escuela/${s.clave}`} className="hta-boton">Ver la sesión</Link>
                  )}
                  <Link href={s.herramienta.ruta} className="hta-enlace text-sm">Herramienta: {s.herramienta.nombre}</Link>
                </div>
              </li>
            );
          })}
        </ol>
        <section className="py-10">
          <h2 className="text-2xl font-bold tracking-tight text-n-900">Preguntas</h2>
          <dl className="mt-6 grid gap-x-12 gap-y-6 md:grid-cols-2">
            {PREGUNTAS.map(([q, a]) => (
              <div key={q}><dt className="font-bold text-n-900">{q}</dt><dd className="mt-1 text-n-700">{a}</dd></div>
            ))}
          </dl>
        </section>
      </div>
    </MarcoHerramienta>
  );
}
