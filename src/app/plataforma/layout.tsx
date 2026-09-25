import { notFound } from "next/navigation";
import { esPlataforma } from "@/lib/negocio/actual";

// La administración de PeluDesk solo existe en el dominio de la plataforma
// (el middleware ya la esconde en el de un negocio; esto es la segunda red).
export default async function PlataformaLayout({ children }: { children: React.ReactNode }) {
  if (!(await esPlataforma())) notFound();
  return <div className="flex min-h-full flex-1 flex-col bg-n-50">{children}</div>;
}
