import { Alert } from "@/components/ui/alert";

// La pantalla que se ve cuando no hay conexión y la página pedida no está guardada.
// Es pública y estática: el service worker (public/sw.js) la guarda al instalarse.
export const metadata = { title: "Sin conexión", robots: { index: false, follow: false } };

export default function SinConexionPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-5 p-6">
      <h1 className="text-2xl font-bold tracking-tight text-n-900">Sin conexión</h1>
      <Alert variante="advertencia" titulo="No hay internet en este momento">
        Esta pantalla no se guardó para verla sin conexión. Cuando vuelva la señal, se abre sola al recargar.
      </Alert>
      <section className="rounded-lg border border-n-200 bg-white p-5">
        <p className="font-semibold text-n-900">Sin conexión sí puedes ver, solo para consultar:</p>
        <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-n-800">
          <li>El tablero del día y la agenda de estética que abriste hoy.</li>
          <li>La ficha de un cliente y la de una mascota que ya abriste.</li>
        </ul>
        <p className="mt-3 text-n-700">Nada se guarda sin conexión: espera a que vuelva para registrar o cobrar.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {/* Página completa a propósito: sin conexión, la copia guardada se abre como documento. */}
          <a href="/recepcion" className="inline-flex min-h-12 items-center rounded-md bg-morado px-5 font-semibold text-white">
            Tablero del día
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/estetica" className="inline-flex min-h-12 items-center rounded-md border-[1.5px] border-borde bg-white px-5 font-semibold text-n-900">
            Agenda de estética
          </a>
        </div>
      </section>
    </main>
  );
}
