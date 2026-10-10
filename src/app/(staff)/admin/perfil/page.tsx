import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { urlPublicaArchivo } from "@/lib/negocio/publico";
import { AvanceWeb } from "@/components/avance-web";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { usaVeterinaria } from "@/lib/plan/modulos";
import { PerfilForm } from "./perfil-form";
import { Establecimiento } from "./establecimiento";

// El perfil público del negocio: lo que sale en su página web (logo, fotos,
// descripción, dirección). Los servicios y precios salen de Servicios; el
// horario, de Administración; el WhatsApp, del teléfono de recepción.
export default async function PerfilPage() {
  const sesion = await obtenerSesionConRol();
  if (!tienePermiso(sesion, "configuracion_negocio")) redirect("/admin");
  const supabase = await createSupabaseServerClient();
  const negocio = await cargarNegocioLanding();
  const [{ data: perfil }, { data: fotos }] = await Promise.all([
    supabase.from("negocio_perfil").select("descripcion, direccion, logo_path, logo_ancho, logo_alto").is("deleted_at", null).maybeSingle(),
    supabase.from("negocio_fotos").select("id, path").is("deleted_at", null).order("orden").order("created_at"),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-n-900">Perfil del negocio</h1>
        <p className="mt-1 text-n-700">Lo que ven tus clientes en tu página web. Tus servicios y precios salen solos de lo que ya capturaste.</p>
      </header>
      <AvanceWeb />
      <PerfilForm
        descripcion={(perfil?.descripcion as string | null) ?? ""}
        direccion={(perfil?.direccion as string | null) ?? ""}
        logoUrl={urlPublicaArchivo(perfil?.logo_path as string | null)}
        logoAncho={(perfil?.logo_ancho as number | null) ?? null}
        logoAlto={(perfil?.logo_alto as number | null) ?? null}
        nombreNegocio={negocio.nombre}
        colorNegocio={negocio.marca?.color ?? null}
        fotos={(fotos ?? []).map((f) => ({ id: f.id as string, url: urlPublicaArchivo(f.path as string)! }))}
      />
      {usaVeterinaria(sesion?.modulos ?? []) && <Establecimiento />}
    </div>
  );
}
