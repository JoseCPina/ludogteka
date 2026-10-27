import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ARTICULOS, articuloPorSlug } from "@/lib/ayuda";
import { ArticuloAyuda } from "@/components/ayuda/articulo-ayuda";
import { PieSitio } from "@/components/peludesk/sitio";
import { JsonLd, ORGANIZACION_RAIZ, metaPagina, migas } from "@/lib/peludesk/seo";
import { ldArticuloAyuda, type TutorialConFecha } from "@/lib/peludesk/ld-ayuda";
import { tituloDeRuta } from "@/lib/peludesk/paginas";
import { EncabezadoAyuda } from "../encabezado";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { COLUMNAS_TUTORIAL, tieneVideo } from "@/lib/tutoriales";
import { videosDeArticulo } from "@/lib/ayuda/videos";
import { articuloConPrecios } from "@/lib/ayuda/precios";
import { preciosAyuda } from "@/lib/ayuda/precios-servidor";
import { videosParaArticulo } from "@/components/ayuda/videos-del-articulo";

export const dynamic = "force-dynamic";

// El centro público no distingue negocios: enseña los videos publicados del artículo.
async function videosPublicos(slug: string): Promise<TutorialConFecha[]> {
  const numeros = videosDeArticulo(slug);
  if (numeros.length === 0) return [];
  const { data } = await createSupabaseAdminClient().from("tutoriales").select(`${COLUMNAS_TUTORIAL}, created_at`).in("numero", numeros).eq("publicado", true).is("deleted_at", null);
  return videosParaArticulo(slug, ((data ?? []) as unknown as TutorialConFecha[]).filter(tieneVideo)) as TutorialConFecha[];
}

export function generateStaticParams() {
  return ARTICULOS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = articuloPorSlug((await params).slug);
  return a
    ? metaPagina({ titulo: a.titulo.length + 18 <= 70 ? `${a.titulo} | Ayuda PeluDesk` : a.titulo, descripcion: a.resumen, ruta: `/ayuda/${a.slug}` })
    : { robots: { index: false } };
}

// En el centro público, un link a otro artículo sigue siendo link; uno a una
// pantalla de la app (que vive en el dominio de cada negocio) es texto.
const linkPublico = (href: string) => (href.startsWith("/ayuda/") || href.startsWith("http") ? href : "");

export default async function ArticuloPublico({ params }: { params: Promise<{ slug: string }> }) {
  const base = articuloPorSlug((await params).slug);
  if (!base) notFound();
  // Con los precios de la base ya puestos: los leen el artículo y su JSON-LD.
  const [videos, precios] = await Promise.all([videosPublicos(base.slug), preciosAyuda()]);
  const a = articuloConPrecios(base, precios);
  return (
    <div className="min-h-full bg-n-50">
      <JsonLd datos={[ORGANIZACION_RAIZ, ldArticuloAyuda(a, videos), migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Ayuda", ruta: "/ayuda" }, { nombre: a.titulo, ruta: `/ayuda/${a.slug}` }])]} />
      <EncabezadoAyuda />
      <main id="contenido" className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
        <Link href="/ayuda" className="text-sm font-semibold text-morado hover:underline">← Todos los artículos</Link>
        <ArticuloAyuda articulo={a} linkDe={linkPublico} videos={videos} />
        <nav aria-label="Más de PeluDesk" className="max-w-3xl text-sm text-n-700">
          <p className="font-semibold text-n-900">Sobre PeluDesk</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {["/precios", "/veterinaria", "/software-para-guarderias-caninas", "/software-para-esteticas-caninas", "/software-para-hoteles-caninos"].map((r) => (
              <li key={r}><Link href={r} className="font-semibold text-morado hover:underline">{tituloDeRuta(r)}</Link></li>
            ))}
          </ul>
        </nav>
        <p className="max-w-3xl text-sm text-n-600">
          ¿No se resolvió? Dentro de tu cuenta, en <strong>Ayuda</strong>, puedes preguntarle al asistente o crear un ticket y te contestamos.
        </p>
      </main>
      <PieSitio />
    </div>
  );
}
