import type { Metadata } from "next";
import { metaPagina } from "@/lib/peludesk/seo";
import { ListadoBlog } from "./listado";

export const metadata: Metadata = {
  ...metaPagina({
    titulo: "Blog de PeluDesk — guías para guarderías, hoteles y estéticas caninas",
    descripcion: "Cómo abrir una guardería canina, qué vacunas pedir, cómo fijar precios, hacer el corte de caja y controlar el cupo de un hotel canino.",
    ruta: "/blog",
  }),
  alternates: { canonical: "/blog", types: { "application/rss+xml": "/blog/rss.xml" } },
};

export default function BlogPage() {
  return <ListadoBlog pagina={1} />;
}
