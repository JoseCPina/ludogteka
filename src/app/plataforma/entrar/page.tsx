import { redirect } from "next/navigation";
import { sesionPlataforma } from "@/lib/plataforma/sesion";
import { FormEntrar } from "./form-entrar";

export default async function EntrarPlataforma() {
  if (await sesionPlataforma()) redirect("/plataforma");
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-3xl font-extrabold tracking-tight text-azul">PeluDesk</h1>
        <p className="mb-8 text-center text-n-600">Administración de la plataforma</p>
        <FormEntrar />
      </div>
    </main>
  );
}
