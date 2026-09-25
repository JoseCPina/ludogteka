import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { CUENTAS_DEMO, type RolDemo } from "@/lib/demo/cuentas";
import { EncabezadoNegocio } from "@/components/marca/encabezado-negocio";
import { HechoConPeluDesk } from "@/components/marca/peludesk";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Demo de PeluDesk", robots: { index: false } };

// Qué ve cada rol, en una línea: lo que de verdad hay en su pantalla.
const QUE_VE: Record<RolDemo, string> = {
  recepcion: "El tablero del día: quién llega, quién se va, la ocupación, las citas y la caja.",
  estetica: "La agenda de estética con las citas de cada estilista, y la ficha de cada perro.",
  admin: "Todo lo anterior más reportes, utilidad del mes, nómina, gastos, inventario y precios.",
  cliente: "El portal del dueño: sus perros, vacunas, fotos del día, pases y contratos firmados.",
};

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const negocio = await cargarNegocioLanding();
  if (negocio.plan !== "demo") notFound();
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6">
      <EncabezadoNegocio />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-n-900 sm:text-3xl">Explora la demo de PeluDesk</h1>
        <p className="mt-2 max-w-[60ch] text-n-700">
          {negocio.nombre} es un negocio de ejemplo con dos meses de operación: clientes, perros, reservas, cobros y
          contratos inventados. Escoge con qué cuenta entrar. Todo es de solo lectura: puedes abrir cualquier pantalla,
          pero no guardar cambios.
        </p>
      </div>
      {error && (
        <Alert variante="error" titulo="No pudimos abrir la demo">
          Intenta de nuevo en un momento.
        </Alert>
      )}
      <ul className="flex flex-col divide-y divide-n-200 overflow-hidden rounded-xl border border-n-200 bg-white">
        {(Object.keys(CUENTAS_DEMO) as RolDemo[]).map((rol) => (
          <li key={rol}>
            <a
              href={`/demo/entrar/${rol}`}
              className="group flex items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-crema focus-visible:bg-crema focus-visible:outline-none"
            >
              <span className="flex-1">
                <span className="block font-semibold text-n-900">{CUENTAS_DEMO[rol].nombre}</span>
                <span className="mt-0.5 block text-sm text-n-700">{QUE_VE[rol]}</span>
              </span>
              <span aria-hidden className="text-lg font-semibold text-morado transition-transform duration-150 group-hover:translate-x-0.5">
                →
              </span>
            </a>
          </li>
        ))}
      </ul>
      <HechoConPeluDesk className="mt-auto" />
    </main>
  );
}
