import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { POR_PAGINA, todosLosArticulos } from "@/lib/peludesk/blog";
import { metaPagina } from "@/lib/peludesk/seo";
import { ListadoBlog } from "../../listado";

type Props = { params: Promise<{ n: string }> };

function paginaValida(n: string): number | null {
  const v = Number(n);
  const total = Math.max(1, Math.ceil(todosLosArticulos().length / POR_PAGINA));
  return Number.isInteger(v) && v >= 1 && v <= total ? v : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const n = paginaValida((await params).n);
  if (!n) return { robots: { index: false } };
  return metaPagina({
    titulo: `Blog de PeluDesk — página ${n}`,
    descripcion: "Guías para guarderías, hoteles y estéticas caninas: abrir, cobrar y cuidar tu negocio.",
    ruta: `/blog/pagina/${n}`,
  });
}

export default async function BlogPaginaN({ params }: Props) {
  const n = paginaValida((await params).n);
  if (!n) notFound();
  // La primera página es /blog: una sola dirección por contenido.
  if (n === 1) permanentRedirect("/blog");
  return <ListadoBlog pagina={n} />;
}
