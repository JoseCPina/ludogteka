import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CATEGORIAS, todosLosArticulos, type CategoriaBlog } from "@/lib/peludesk/blog";
import { metaPagina } from "@/lib/peludesk/seo";
import { ListadoBlog } from "../../listado";

type Props = { params: Promise<{ cat: string }> };

function categoriaValida(c: string): CategoriaBlog | null {
  return c in CATEGORIAS && todosLosArticulos().some((a) => a.categoria === c) ? (c as CategoriaBlog) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = categoriaValida((await params).cat);
  if (!c) return { robots: { index: false } };
  return metaPagina({
    titulo: `${CATEGORIAS[c].nombre} — Blog de PeluDesk`,
    descripcion: CATEGORIAS[c].descripcion,
    ruta: `/blog/categoria/${c}`,
  });
}

export default async function BlogCategoria({ params }: Props) {
  const c = categoriaValida((await params).cat);
  if (!c) notFound();
  return <ListadoBlog categoria={c} />;
}
