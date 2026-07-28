import { redirect } from "next/navigation";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { cerrarSesion } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export default async function PortalPage() {
  const sesion = await obtenerSesionConRol();
  if (!sesion) redirect("/login");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-n-600">Tu portal</p>
      <h1 className="text-2xl font-bold text-n-900">Hola, {sesion.user.email}</h1>

      {sesion.clienteId ? (
        <p className="max-w-sm text-n-600">
          Esta pantalla es un placeholder — se construye en los siguientes pasos de Fase 1.
        </p>
      ) : (
        <div className="max-w-sm text-left">
          <Alert variante="advertencia" titulo="Tu cuenta aún no está vinculada">
            Todavía no encontramos tu expediente de cliente. Contacta a recepción para que
            asocien tu cuenta.
          </Alert>
        </div>
      )}

      <form action={cerrarSesion}>
        <Button type="submit" variante="secundario">
          Cerrar sesión
        </Button>
      </form>
    </main>
  );
}
