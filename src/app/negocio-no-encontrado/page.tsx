// El dominio no corresponde a ningún negocio de PeluDesk (o el negocio ya
// no está activo). El middleware reescribe aquí con 404; no hay negocio ni
// sesión que consultar.
import { LogoPeluDesk } from "@/components/marca/peludesk";

export const metadata = {
  title: "PeluDesk",
  icons: { icon: [{ url: "/marca/peludesk/isotipo.svg", type: "image/svg+xml" }, { url: "/marca/peludesk/favicon-32.png", sizes: "32x32" }], apple: "/marca/peludesk/favicon-180.png" },
};

export default function NegocioNoEncontrado() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-3 p-6">
      <LogoPeluDesk tamano={40} lema className="mb-4" />
      <h1 className="text-2xl font-bold text-n-900">Este sitio no existe</h1>
      <p className="text-n-600">
        No encontramos ningún negocio con esta dirección. Revisa que esté bien escrita; si te la pasó tu
        guardería o estética, pídeles el link otra vez.
      </p>
    </main>
  );
}
