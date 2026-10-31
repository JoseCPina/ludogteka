import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarcoHerramienta } from "@/components/herramientas/marco";
import { sesionesVivas } from "@/lib/escuela/datos";
import { SESIONES, fechaEnTexto, sesionPorClave, textoInscripcion } from "@/lib/escuela/sesiones";
import { numeroBot } from "@/lib/directorio/reclamo";
import { JsonLd, ORGANIZACION, SITIO, metaPagina, migas } from "@/lib/peludesk/seo";

/** /escuela/<clave>: una sesión con su grabación (si existe), su guía escrita y la herramienta de su tema. */
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ clave: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = sesionPorClave((await params).clave);
  if (!s) return { robots: { index: false } };
  return metaPagina({ titulo: `${s.titulo}: sesión de la Escuela PeluDesk`, descripcion: `${s.resumen} Guía escrita, grabación y la herramienta del tema: ${s.herramienta.nombre}.`.slice(0, 200), ruta: `/escuela/${s.clave}` });
}

export default async function SesionEscuela({ params }: Props) {
  const { clave } = await params;
  const s = sesionPorClave(clave);
  if (!s) notFound();
  const v = (await sesionesVivas()).find((x) => x.clave === clave);
  const bot = numeroBot();
  const fecha = fechaEnTexto(v?.fecha_at);
  const siguiente = SESIONES[SESIONES.findIndex((x) => x.clave === clave) + 1];
  return (
    <MarcoHerramienta clave="escuela" titulo={s.titulo} intro={s.resumen} migas={[{ nombre: "Inicio", ruta: "/" }, { nombre: "Escuela PeluDesk", ruta: "/escuela" }, { nombre: s.titulo }]} relacionadas={[s.herramienta.ruta, "/escuela"]} cierre={{ titulo: `Herramienta de esta sesión: ${s.herramienta.nombre}.`, texto: "Úsala con tus números mientras ves la sesión.", boton: `Abrir ${s.herramienta.nombre}`, href: s.herramienta.ruta }}>
      <JsonLd datos={[migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Escuela PeluDesk", ruta: "/escuela" }, { nombre: s.titulo, ruta: `/escuela/${clave}` }]), { "@context": "https://schema.org", "@type": "LearningResource", name: s.titulo, description: s.resumen, inLanguage: "es-MX", isAccessibleForFree: true, provider: ORGANIZACION, url: `${SITIO}/escuela/${clave}`, ...(v?.youtube_id ? { video: { "@type": "VideoObject", name: s.titulo, description: s.resumen, embedUrl: `https://www.youtube-nocookie.com/embed/${v.youtube_id}`, uploadDate: v.fecha_at ?? undefined } } : {}) }]} />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="hta-regla grid gap-8 py-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-x-12">
          <div>
            {v?.youtube_id ? (
              <div className="aspect-video overflow-hidden rounded-xl border border-n-200 bg-n-900">
                <iframe title={`Grabación: ${s.titulo}`} src={`https://www.youtube-nocookie.com/embed/${v.youtube_id}`} className="h-full w-full" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
              </div>
            ) : (
              <div className="rounded-xl border border-n-200 bg-white p-5">
                <p className="hta-etiqueta">Sesión en vivo</p>
                <p className="text-lg font-bold text-n-900">{fecha ?? "Fecha por anunciar"}</p>
                <p className="mt-1 text-sm text-n-600">{v?.fecha_at ? "La grabación queda aquí después de la sesión." : "Inscríbete y te avisamos por WhatsApp en cuanto tenga fecha."}</p>
                {bot && <a href={`https://wa.me/${bot}?text=${encodeURIComponent(textoInscripcion(s))}`} target="_blank" rel="noopener noreferrer" className="hta-boton mt-4" data-inscribirme>Inscribirme por WhatsApp</a>}
              </div>
            )}
          </div>
          <div>
            <p className="hta-etiqueta">Herramienta de esta sesión</p>
            <Link href={s.herramienta.ruta} className="text-xl font-bold text-morado hover:underline">{s.herramienta.nombre}</Link>
            {siguiente && <p className="mt-6 text-sm text-n-600">Siguiente sesión: <Link href={`/escuela/${siguiente.clave}`} className="hta-enlace">{siguiente.titulo}</Link></p>}
          </div>
        </section>
        <article className="hta-regla max-w-3xl py-10" data-guia>
          <h2 className="text-2xl font-bold tracking-tight text-n-900">La guía escrita</h2>
          <div className="pd-prosa mt-4">
            {s.guia.map((b, i) => (Array.isArray(b) ? <ul key={i}>{b.map((x) => <li key={x}>{x}</li>)}</ul> : <p key={i}>{b}</p>))}
          </div>
        </article>
      </div>
    </MarcoHerramienta>
  );
}
