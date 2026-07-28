import { redirect } from "next/navigation";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { navStaffPara } from "@/lib/nav/config";
import { StaffShell } from "@/components/chrome/staff-shell";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesionConRol();
  if (!sesion) redirect("/login");

  return (
    <StaffShell
      rol={sesion.rol}
      email={sesion.user.email ?? ""}
      nombreCompleto={sesion.nombreCompleto}
      items={navStaffPara(sesion.rol)}
    >
      {children}
    </StaffShell>
  );
}
