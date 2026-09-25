import { redirect } from "next/navigation";
import { negocioActual } from "@/lib/negocio/actual";
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
    // El expediente de ESTE negocio (la membresía de cliente aquí).
    const supabase = await createSupabaseServerClient();
    const { data: cliente } = sesion.clienteId
      ? await supabase.from("clientes").select("telefono").eq("id", sesion.clienteId).maybeSingle()
      : { data: null };
    const telefono = (cliente?.telefono as string | null | undefined) ?? null;
    identidad = telefono ? formatearTelefono(telefono) : "";
  }

  return (
    <PortalShell nombreNegocio={(await negocioActual()).nombre} identidad={identidad} nombreCompleto={sesion.nombreCompleto}>
      {children}
    </PortalShell>
  );
}
