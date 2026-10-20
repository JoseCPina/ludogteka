import { redirect } from "next/navigation";

// QA R22 (N87): la configuración del negocio (WhatsApp de recepción, dirección, cupo y horario) vive en la sección
// «Configuración del negocio» de Administración. El redirect de next.config.ts responde antes; esta página es el
// respaldo (y la ruta que nombran el menú, Perfil y el catálogo de videos).
export default function ConfiguracionPage() {
  redirect("/admin#configuracion");
}
