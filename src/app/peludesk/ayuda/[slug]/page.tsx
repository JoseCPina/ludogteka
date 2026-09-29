import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ARTICULOS, articuloPorSlug } from "@/lib/ayuda";
import { ArticuloAyuda } from "@/components/ayuda/articulo-ayuda";
import { EncabezadoAyuda } from "../encabezado";

export function generateStaticParams() {
  return ARTICULOS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = articuloPorSlug((await params).slug);
  return a
    ? { metadataBase: new URL("https://peludesk.mx"), title: { absolute: `${a.titulo} — Ayuda de PeluDesk` }, description: a.resumen, alternates: { canonical: `/ayuda/${a.slug}` } }
    : {};
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
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
        <Link href="/ayuda" className="text-sm font-semibold text-morado hover:underline">← Todos los artículos</Link>
        <ArticuloAyuda articulo={a} linkDe={linkPublico} />
        <p className="max-w-3xl text-sm text-n-600">
          ¿No se resolvió? Dentro de tu cuenta, en <strong>Ayuda</strong>, puedes preguntarle al asistente o crear un ticket y te contestamos.
        </p>
      </main>
    </div>
  );
}
