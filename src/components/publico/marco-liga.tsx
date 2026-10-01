import { EncabezadoNegocio } from "@/components/marca/encabezado-negocio";

/** Marco de las ligas públicas del negocio (/r y /f): su marca arriba, nada más. */
export function MarcoLiga({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col gap-5 px-4 pb-10 pt-6 sm:px-6">
      <EncabezadoNegocio />
      {children}
    </main>
  );
}

/** Liga falsa, vencida o archivo ya borrado: un mensaje amable en la voz del negocio. */
export function LigaNoDisponible({ negocio, vencida }: { negocio: string; vencida: boolean }) {
  return (
    <section role="status" className="rounded-xl border border-n-200 bg-white p-6">
      <h1 className="text-xl font-bold text-n-900">{vencida ? "Esta liga ya venció" : "Esta liga no está disponible"}</h1>
      <p className="mt-2 text-n-700">
        {vencida
          ? `Por privacidad, las ligas duran pocos días. Pídele a ${negocio} que te la mande de nuevo.`
          : `Revisa que la liga esté completa. Si el problema sigue, pídele a ${negocio} que te la mande de nuevo.`}
      </p>
    </section>
  );
}
