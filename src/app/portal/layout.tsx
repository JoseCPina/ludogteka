import { redirect } from "next/navigation";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { PortalShell } from "@/components/chrome/portal-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { esCorreoSintetico } from "@/lib/auth/identidad";
import { formatearTelefono } from "@/lib/telefono";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesionConRol();
  if (!sesion) redirect("/login");

  // El nombre sale del expediente; si por lo que sea no hay, se cae al
  // teléfono, que es lo que la persona sí reconoce. El correo interno no
  // se enseña nunca — ver el comentario de PortalShell.
  const correo = sesion.user.email ?? "";
  let identidad = correo;
  if (esCorreoSintetico(correo)) {
    const supabase = await createSupabaseServerClient();
    const { data: perfil } = await supabase
      .from("profiles")
      .select("clientes(telefono)")
      .eq("id", sesion.user.id)
      .maybeSingle();
    const relacion = perfil?.clientes as unknown as
      | { telefono: string | null }
      | { telefono: string | null }[]
      | null;
    const fila = Array.isArray(relacion) ? relacion[0] : relacion;
    const telefono = fila?.telefono ?? null;
    identidad = telefono ? formatearTelefono(telefono) : "";
  }

  return (
    <PortalShell identidad={identidad} nombreCompleto={sesion.nombreCompleto}>
      {children}
    </PortalShell>
  );
}
