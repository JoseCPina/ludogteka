import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ARTICULOS, articuloPorSlug } from "@/lib/ayuda";
import { ArticuloAyuda } from "@/components/ayuda/articulo-ayuda";
import { PieSitio } from "@/components/peludesk/sitio";
import { metaPagina } from "@/lib/peludesk/seo";
import { EncabezadoAyuda } from "../encabezado";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { COLUMNAS_TUTORIAL, tieneVideo, type Tutorial } from "@/lib/tutoriales";
import { videosDeArticulo } from "@/lib/ayuda/videos";
import { videosParaArticulo } from "@/components/ayuda/videos-del-articulo";

export const dynamic = "force-dynamic";

// El centro público no distingue negocios: enseña los videos publicados del artículo.
async function videosPublicos(slug: string): Promise<Tutorial[]> {
  const numeros = videosDeArticulo(slug);
  if (numeros.length === 0) return [];
  const { data } = await createSupabaseAdminClient().from("tutoriales").select(COLUMNAS_TUTORIAL).in("numero", numeros).eq("publicado", true).is("deleted_at", null);
  return videosParaArticulo(slug, ((data ?? []) as unknown as Tutorial[]).filter(tieneVideo));
}

export function generateStaticParams() {
  return ARTICULOS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = articuloPorSlug((await params).slug);
  return a
    ? metaPagina({ titulo: `${a.titulo} — Ayuda de PeluDesk`, descripcion: a.resumen, ruta: `/ayuda/${a.slug}` })
    : { robots: { index: false } };
}

// En el centro público, un link a otro artículo sigue siendo link; uno a una
// pantalla de la app (que vive en el dominio de cada negocio) es texto.
const linkPublico = (href: string) => (href.startsWith("/ayuda/") || href.startsWith("http") ? href : "");

export default async function ArticuloPublico({ params }: { params: Promise<{ slug: string }> }) {
  const a = articuloPorSlug((await params).slug);
  if (!a) notFound();
  return (
    <div className="min-h-full bg-n-50">
      <EncabezadoAyuda />
      <main id="contenido" className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
        <Link href="/ayuda" className="text-sm font-semibold text-morado hover:underline">← Todos los artículos</Link>
        <ArticuloAyuda articulo={a} linkDe={linkPublico} videos={await videosPublicos(a.slug)} />
        <p className="max-w-3xl text-sm text-n-600">
          ¿No se resolvió? Dentro de tu cuenta, en <strong>Ayuda</strong>, puedes preguntarle al asistente o crear un ticket y te contestamos.
        </p>
      </main>
      <PieSitio />
    </div>
  );
}
