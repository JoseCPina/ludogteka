import type { Metadata } from "next";
import { AvisoSimplificado } from "@/components/peludesk/aviso-simplificado";
import { PaginaLegal } from "@/components/peludesk/pagina-legal";
import { metaPagina } from "@/lib/peludesk/seo";

export const metadata: Metadata = metaPagina({
  titulo: "Aviso de privacidad | PeluDesk",
  descripcion: "Quién es el responsable de tus datos en PeluDesk, qué datos recabamos, para qué, con quién los compartimos y cómo ejercer tus derechos ARCO.",
  ruta: "/aviso-de-privacidad",
});

export default function AvisoDePrivacidad() {
  return (
    <PaginaLegal
      doc="aviso_privacidad"
      archivo="aviso-de-privacidad"
      intro="La versión corta va primero; abajo está el aviso integral."
      antes={<AvisoSimplificado className="mb-10 max-w-[68ch]" />}
    />
  );
}
