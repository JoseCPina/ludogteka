import { Alert } from "@/components/ui/alert";

/**
 * El aviso de una lista clínica que no cargó. Si la base la rechazó por permiso
 * (42501 o «No tienes el permiso…»), es el mismo aviso de acceso de las demás
 * pantallas clínicas y dice cuál permiso falta; solo lo demás es «no pudimos cargar».
 */
export function AvisoErrorClinico({ error, titulo }: { error: { message?: string; code?: string } | null; titulo: string }) {
  const mensaje = error?.message ?? "";
  if (error?.code === "42501" || /No tienes (el )?permiso|Solo un admin|Solo un m[eé]dico|es de un m[eé]dico/i.test(mensaje)) {
    return (
      <Alert variante="advertencia" titulo="No tienes acceso">
        {mensaje || "Esta pantalla pide un permiso que tu cuenta no tiene."} Pídeselo a un admin (Permisos).
      </Alert>
    );
  }
  return (
    <Alert variante="error" titulo={titulo}>
      Recarga la página. Si sigue, avísale al equipo técnico.
    </Alert>
  );
}
