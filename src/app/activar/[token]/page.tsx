import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { EncabezadoNegocio } from "@/components/marca/encabezado-negocio";
import { negocioActual } from "@/lib/negocio/actual";
import { leerInvitacionPortal } from "./acciones";
import { ActivarForm } from "./activar-form";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Pública a propósito (no hay sesión todavía): la abre solo el token.
export default async function ActivarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const negocio = await negocioActual();
  const inv = await leerInvitacionPortal(token);
  const mensajes = {
    invalida: "Este enlace no existe. Pídele a recepción que te mande uno nuevo.",
    usada: "Este enlace ya se usó. Entra con tu teléfono y tu contraseña.",
    cancelada: "Este enlace ya no sirve porque se generó otro. Usa el más reciente o pídele uno a recepción.",
    vencida: "Este enlace venció. Pídele a recepción que te mande uno nuevo.",
  } as const;
  return (
    <main className="mx-auto max-w-md space-y-6 p-4 sm:p-8">
      <EncabezadoNegocio />
      {inv.estado === "vigente" ? (
        <>
          <div>
            <h1 className="text-xl font-semibold">Hola, {inv.nombre}</h1>
            <p className="text-sm text-muted-foreground">
              Abre tu cuenta de {negocio.nombre}: escoge una contraseña y entrarás con tu teléfono.
            </p>
          </div>
          <ActivarForm token={token} />
        </>
      ) : (
        <Alert variante="error" titulo="Este enlace no sirve">{mensajes[inv.estado]}</Alert>
      )}
    </main>
  );
}
