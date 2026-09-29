import type { Metadata } from "next";
import { ARTICULOS } from "@/lib/ayuda";
import { IndiceAyuda } from "@/components/ayuda/indice-ayuda";
import { EncabezadoAyuda } from "./encabezado";

// peludesk.mx/ayuda: el centro de ayuda público. Un artículo por tarea real,
// agrupados por módulo, con buscador. Dentro de la app, cada negocio ve solo
// los de sus módulos (/ayuda en su dominio).
export const metadata: Metadata = {
  metadataBase: new URL("https://peludesk.mx"),
  title: { absolute: "Ayuda de PeluDesk — cómo hacer cada cosa, paso a paso" },
  description: "Cómo registrar un check-in, cobrar con terminal, hacer el corte de caja y todo lo del día a día en PeluDesk.",
  alternates: { canonical: "/ayuda" },
};

export default function CentroDeAyuda() {
  return (
    <div className="min-h-full bg-n-50">
      <EncabezadoAyuda />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
        <div>
          <h1 className="text-3xl font-bold text-n-900">¿Qué quieres hacer?</h1>
          <p className="mt-1 text-n-600">Cada artículo es una tarea del día a día, paso a paso. Las capturas son de un negocio de ejemplo.</p>
        </div>
        <IndiceAyuda articulos={ARTICULOS} />
      </main>
    </div>
  );
}
