import type { Metadata } from "next";
import { PaginaLegal } from "@/components/peludesk/pagina-legal";
import { metaPagina } from "@/lib/peludesk/seo";

export const metadata: Metadata = metaPagina({
  titulo: "Términos y condiciones | PeluDesk",
  descripcion: "Las reglas de PeluDesk: la prueba de 15 días, planes y cobro, solo lectura, cancelación, tus datos, inteligencia artificial y el anexo de encargo de datos.",
  ruta: "/terminos",
});

export default function Terminos() {
  return <PaginaLegal doc="terminos" archivo="terminos" />;
}
