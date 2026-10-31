import type { Metadata } from "next";
import Link from "next/link";
import { MarcoHerramienta } from "@/components/herramientas/marco";
import { ciudadesDirectorio, MINIMO_INDEXABLE } from "@/lib/directorio/consulta";
import { GIROS_MERCADO } from "@/lib/mercado/catalogo";
import { JsonLd, ORGANIZACION, SITIO, metaPagina, migas, preguntasFrecuentes } from "@/lib/peludesk/seo";

/** /directorio: los giros y las ciudades con negocios, con cuántos tiene cada una. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = metaPagina({
  titulo: "Directorio de estéticas, hoteles, guarderías y veterinarias en México | PeluDesk",
  descripcion: "Los negocios de cada giro y ciudad con su calificación de Google Maps. Si es el tuyo, reclámalo y conviértelo en tu página web.",
  ruta: "/directorio",
});

const PREGUNTAS: [string, string][] = [
  ["¿De dónde salen los negocios del directorio?", "De Google Maps: los negocios que aparecen al buscar estéticas, hoteles, guarderías y veterinarias en cada ciudad. Calificación y reseñas son las de Google Maps. No guardamos sus fotos ni sus reseñas: se piden al abrir cada ficha."],
  ["¿Qué pasa si reclamo mi negocio?", "Dejas tu WhatsApp, nos mandas un código desde tu número y la ficha queda como tu página web en PeluDesk, con la insignia «Negocio verificado» y 15 días gratis para probar todo lo demás."],
  ["¿Cómo quito mi negocio del directorio?", "Escríbenos por WhatsApp o a contacto@peludesk.mx desde su ficha y lo quitamos."],
];

export default async function Directorio() {
  const ciudades = await ciudadesDirectorio();
  const porGiro = GIROS_MERCADO.map((g) => ({ giro: g, ciudades: ciudades.filter((c) => c.giro === g.clave).slice(0, 40) }));
  const total = ciudades.reduce((n, c) => n + c.n, 0);
  return (
    <MarcoHerramienta clave="directorio" intro={`${total.toLocaleString("es-MX")} negocios de mascotas en México, por giro y ciudad, con su calificación de Google Maps.`} relacionadas={["/precios-mercado"]} cierre={{ titulo: "¿Tienes un negocio de mascotas?", texto: "Búscalo en su ciudad y reclámalo: la ficha queda como tu página web, verificada, con 15 días gratis de PeluDesk." }}>
      <JsonLd datos={[migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Herramientas", ruta: "/herramientas" }, { nombre: "Directorio", ruta: "/directorio" }]), { "@context": "https://schema.org", "@type": "WebApplication", name: "Directorio PeluDesk de negocios de mascotas", url: `${SITIO}/directorio`, applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "es-MX", isAccessibleForFree: true, publisher: ORGANIZACION }, preguntasFrecuentes(PREGUNTAS)]} />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {porGiro.map((g) => (
          <section key={g.giro.clave} className="hta-regla grid gap-6 py-10 md:grid-cols-[14rem_minmax(0,1fr)]">
            <h2 className="text-2xl font-bold tracking-tight text-n-900">{g.giro.plural.charAt(0).toUpperCase() + g.giro.plural.slice(1)}</h2>
            <ul className="columns-2 gap-x-8 sm:columns-3 lg:columns-4">
              {g.ciudades.map((c) => (
                <li key={c.ciudad} className="mb-2 break-inside-avoid">
                  <Link href={`/directorio/${g.giro.clave}/${c.slug}`} className="hta-enlace" rel={c.n < MINIMO_INDEXABLE ? "nofollow" : undefined}>{c.ciudad}</Link>
                  <span className="ml-2 text-sm text-n-600">{c.n}</span>
                </li>
              ))}
              {g.ciudades.length === 0 && <li className="text-n-600">Todavía no hay negocios de este giro.</li>}
            </ul>
          </section>
        ))}
        <section className="hta-regla py-10">
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
