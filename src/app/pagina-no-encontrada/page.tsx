// Una ruta de la plataforma (/plataforma, la landing de PeluDesk, el webhook
// de Stripe) pedida en el dominio de un negocio: ahí no existe. El
// middleware reescribe aquí y la página responde 404 con notFound(); lo que
// se ve está en not-found.tsx (con el enlace al inicio de ESE negocio).
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = { robots: { index: false, follow: false } };

export default function PaginaNoEncontrada() {
  notFound();
}
