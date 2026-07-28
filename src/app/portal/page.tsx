import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";

export default async function PortalPage() {
  const sesion = await obtenerSesionConRol();
  if (!sesion) return null;

  if (!sesion.clienteId) {
    return (
      <div className="max-w-sm">
        <Alert variante="advertencia" titulo="Tu cuenta aún no está vinculada">
          Todavía no encontramos tu expediente de cliente. Contacta a recepción para que asocien
          tu cuenta.
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-n-900">Tu portal</h1>
      <p className="mt-2 text-n-600">
        Esta pantalla es un placeholder — se construye en los siguientes pasos de Fase 1.
      </p>
    </div>
  );
}
