import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { negocioActual } from "@/lib/negocio/actual";
import { cargarTextosPoliticas } from "@/lib/politicas/cargar";
import { PoliticasForm } from "./politicas-form";

// Las reglas que el negocio le dice a sus clientes (alta por link,
// complemento y portal). Las vacunas que pide salen del catálogo de
// requisitos y el horario, de Administración: aquí va lo que se redacta.
export default async function PoliticasPage() {
  const sesion = await obtenerSesionConRol();
  if (!tienePermiso(sesion, "configuracion_negocio")) redirect("/admin");
  const supabase = await createSupabaseServerClient();
  const negocio = await negocioActual();
  const textos = await cargarTextosPoliticas(supabase, negocio.id);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-n-900">Políticas y reglas</h1>
        <p className="mt-1 text-n-700">
          Lo que le decimos al dueño cuando se registra por link y en su portal. Cada regla solo se muestra
          con el módulo que la usa prendido; lo que dejes vacío no se menciona. Las vacunas que pides y su
          vigencia salen del catálogo de requisitos, y el horario, de Administración.
        </p>
      </header>
      <PoliticasForm textos={textos} modulos={sesion?.modulos ?? []} />
    </div>
  );
}
