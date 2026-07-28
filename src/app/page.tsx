import { redirect } from "next/navigation";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { rutaPorRol } from "@/lib/auth/rutas";

export default async function Home() {
  const sesion = await obtenerSesionConRol();
  redirect(sesion ? rutaPorRol(sesion.rol) : "/login");
}
