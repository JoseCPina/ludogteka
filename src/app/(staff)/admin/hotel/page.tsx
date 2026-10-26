import { accesoDeSesion, puedeAbrir } from "@/lib/auth/acceso";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { PoliticaSalidaForm } from "./politica-salida-form";

// Configuración → Hotel: las reglas de las estancias de hotel y guardería que decide cada negocio (N132: qué se cobra
// cuando un perro sale antes de su salida prevista).
export default async function ConfiguracionHotelPage() {
  const sesion = await obtenerSesionConRol();
  if (!puedeAbrir(accesoDeSesion(sesion), "/admin/hotel")) redirect("/admin");
  const supabase = await createSupabaseServerClient();
  const { data: completa } = await supabase.rpc("cobrar_estancia_completa");
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-n-900">Configuración de hotel y guardería</h1>
        <p className="mt-1 text-n-700">Las reglas de las estancias que decide tu negocio.</p>
      </header>
      <PoliticaSalidaForm completa={Boolean(completa)} />
    </div>
  );
}
