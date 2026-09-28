import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { negocioActual } from "@/lib/negocio/actual";
import { stripe } from "@/lib/cobro/stripe";
import { METADATA_NEGOCIO, aplicarSuscripcion } from "@/lib/cobro/suscripcion";
import { Alert } from "@/components/ui/alert";

// El regreso de Stripe Checkout. No se confía en haber llegado a esta URL:
// se lee la sesión en Stripe, se comprueba que es de ESTE negocio y se
// aplica la suscripción tal como Stripe la tiene (el webhook hace lo mismo;
// esto solo evita esperarlo).
export default async function RegresoDelPago({ searchParams }: { searchParams: Promise<{ sesion?: string }> }) {
  const sesion = await obtenerSesionConRol();
  if (sesion?.rol !== "admin") redirect("/admin");
  const { sesion: idSesion } = await searchParams;
  const negocio = await negocioActual();
  let problema: string | null = null;

  if (!idSesion || !/^cs_[A-Za-z0-9_]+$/.test(idSesion)) {
    problema = "No reconocimos el pago.";
  } else {
    try {
      const checkout = await stripe().checkout.sessions.retrieve(idSesion);
      const sub = typeof checkout.subscription === "string" ? checkout.subscription : checkout.subscription?.id;
      if (checkout.metadata?.[METADATA_NEGOCIO] !== negocio.id) {
        problema = "Ese pago no es de este negocio.";
      } else if (checkout.status !== "complete" || !sub) {
        problema = "El pago no se completó. Puedes intentarlo de nuevo.";
      } else {
        await aplicarSuscripcion(negocio.id, sub);
      }
    } catch (e) {
      console.error("[cobro] regreso del checkout", e);
      problema = "Tu pago quedó registrado en Stripe, pero no pudimos actualizar tu plan en este momento. Se va a actualizar solo en unos minutos.";
    }
  }
  if (!problema) redirect("/admin/modulos?pago=ok");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight text-n-900">Tu suscripción</h1>
      <Alert variante="advertencia" titulo="Revisa tu pago">
        {problema}
      </Alert>
      <Link href="/admin/modulos" className="font-semibold text-morado underline underline-offset-2">
        Volver a Módulos y plan
      </Link>
    </div>
  );
}
