import { redirect } from "next/navigation";
import { sesionPlataforma } from "@/lib/plataforma/sesion";
import { FormEntrar } from "./form-entrar";
import { LogoPeluDesk } from "@/components/marca/peludesk";

export default async function EntrarPlataforma() {
  if (await sesionPlataforma()) redirect("/plataforma");
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex justify-center">
          <LogoPeluDesk tamano={48} lema />
        </div>
        <h1 className="sr-only">PeluDesk</h1>
        <p className="mb-8 text-center text-n-600">Administración de la plataforma</p>
        <FormEntrar />
      </div>
    </main>
  );
}
