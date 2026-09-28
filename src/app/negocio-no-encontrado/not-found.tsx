import { LogoPeluDesk } from "@/components/marca/peludesk";

export default function SitioNoExiste() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-3 p-6">
      <LogoPeluDesk tamano={40} className="mb-4" />
      <h1 className="text-2xl font-bold text-n-900">Este sitio no existe</h1>
      <p className="text-n-600">
        No encontramos ningún negocio con esta dirección. Revisa que esté bien escrita; si te la pasó tu
        guardería o estética, pídeles el link otra vez.
      </p>
    </main>
  );
}
