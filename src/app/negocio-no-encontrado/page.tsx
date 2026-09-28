// El dominio no corresponde a ningún negocio de PeluDesk (o el negocio ya
// no está activo). El middleware reescribe aquí; la página responde con
// notFound() para que el código sea 404 de verdad (el `status` de un
// rewrite del middleware no llega a la respuesta: salía 200). Lo que se ve
// está en not-found.tsx.
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "PeluDesk",
  robots: { index: false, follow: false },
  icons: { icon: [{ url: "/marca/peludesk/isotipo.svg", type: "image/svg+xml" }, { url: "/marca/peludesk/favicon-32.png", sizes: "32x32" }], apple: "/marca/peludesk/favicon-180.png" },
};

export default function NegocioNoEncontrado() {
  notFound();
}
