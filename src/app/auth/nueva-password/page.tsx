import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NuevaPasswordForm } from "./nueva-password-form";
import { esPlataforma, negocioActual } from "@/lib/negocio/actual";
import { EncabezadoNegocio } from "@/components/marca/encabezado-negocio";
import { LogoPeluDesk } from "@/components/marca/peludesk";

export default async function NuevaPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-3 flex justify-center">
          {(await esPlataforma()) ? <LogoPeluDesk tamano={40} /> : <EncabezadoNegocio />}
        </div>
        <h1 className="sr-only">{(await esPlataforma()) ? "PeluDesk" : (await negocioActual()).nombre}</h1>
        <p className="mb-8 text-center text-n-600">Define tu contraseña para continuar</p>
        <NuevaPasswordForm />
      </div>
    </main>
  );
}
