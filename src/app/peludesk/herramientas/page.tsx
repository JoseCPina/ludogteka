import type { Metadata } from "next";
import Link from "next/link";
import { MarcoSitio } from "@/components/peludesk/sitio";
import { Migas } from "@/components/peludesk/blog";
import { EventoPixelAlVer } from "@/components/peludesk/consentimiento/evento-pixel";
import { EnlaceRegistro } from "@/components/peludesk/enlace-registro";
import { HERRAMIENTAS, herramientasPublicadas } from "@/lib/herramientas/lista";
import { GIROS_MERCADO } from "@/lib/mercado/catalogo";
import { JsonLd, ORGANIZACION, SITIO, metaPagina, migas } from "@/lib/peludesk/seo";
import "@/components/herramientas/herramientas.css";

/** /herramientas: el índice de las herramientas públicas de PeluDesk, con qué hace cada una y de dónde salen sus datos. */
export const revalidate = 3600;

export const metadata: Metadata = metaPagina({
  titulo: "Herramientas gratis para estéticas, hoteles, guarderías y veterinarias | PeluDesk",
  descripcion: "Índice de precios por ciudad y más herramientas gratuitas para negocios de mascotas en México. Sin cuenta; lo que captures se carga si abres tu prueba.",
  ruta: "/herramientas",
});

export default function Herramientas() {
  const lista = herramientasPublicadas();
  return (
    <MarcoSitio>
      <JsonLd
        datos={[
          migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Herramientas", ruta: "/herramientas" }]),
          { "@context": "https://schema.org", "@type": "ItemList", name: "Herramientas gratuitas de PeluDesk", url: `${SITIO}/herramientas`, inLanguage: "es-MX", publisher: ORGANIZACION, itemListElement: lista.map((h, i) => ({ "@type": "ListItem", position: i + 1, name: h.nombre, url: `${SITIO}${h.ruta}` })) },
        ]}
      />
      <EventoPixelAlVer nombre="ViewContent" datos={{ content_name: "herramientas", content_category: "herramienta" }} />
      <div className="hta">
        <header className="mx-auto max-w-6xl px-4 pb-6 pt-8 sm:px-6 md:pt-12">
          <Migas items={[{ nombre: "Inicio", ruta: "/" }, { nombre: "Herramientas" }]} />
          <p className="hta-ceja mt-8"><span>Herramientas</span><span aria-hidden>·</span><span>Gratis, sin cuenta</span></p>
          <h1 className="hta-titulo mt-3">Herramientas para tu negocio, con datos de tu ciudad</h1>
          <p className="hta-linea mt-5">Cada una hace una cosa y dice de dónde salen sus datos. Lo que captures se te manda por WhatsApp y, si abres tu prueba de PeluDesk, se carga en tu cuenta.</p>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <ol className="hta-regla">
            {lista.map((h) => {
              const numero = String(HERRAMIENTAS.findIndex((x) => x.clave === h.clave) + 1).padStart(2, "0");
              return (
                <li key={h.clave} className="grid gap-x-10 gap-y-3 border-b border-n-200 py-8 md:grid-cols-[6rem_minmax(0,1.2fr)_minmax(0,1fr)]">
                  <span className="text-sm font-bold tracking-[0.14em] text-morado">{numero}</span>
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-n-900"><Link href={h.ruta} className="hover:underline">{h.nombre}</Link></h2>
                    <p className="mt-2 text-n-800">{h.que}</p>
                    <p className="mt-3"><Link href={h.ruta} className="hta-enlace">Abrir</Link></p>
                  </div>
                  <div className="text-sm text-n-700">
                    <p><span className="hta-etiqueta">Datos</span>{h.datos}</p>
                    <p className="mt-3"><span className="hta-etiqueta">Para</span>{h.giros.map((g) => GIROS_MERCADO.find((x) => x.clave === g)!.plural).join(", ")}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          <aside aria-label="Prueba PeluDesk" className="mt-12 grid gap-6 md:grid-cols-[minmax(0,1.4fr)_auto] md:items-end">
            <div>
              <p className="hta-etiqueta">Con PeluDesk</p>
              <p className="mt-2 max-w-[26ch] text-2xl font-bold leading-tight tracking-tight text-n-900">La agenda, la caja, los contratos y los recordatorios por WhatsApp, en un lugar.</p>
              <p className="mt-2 max-w-[56ch] text-n-700">15 días con todo abierto, sin tarjeta.</p>
            </div>
            <EnlaceRegistro className="hta-boton">Pruébalo gratis</EnlaceRegistro>
          </aside>
        </main>
      </div>
    </MarcoSitio>
  );
}
