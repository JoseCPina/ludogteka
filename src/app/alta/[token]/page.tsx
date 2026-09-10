import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Alert } from "@/components/ui/alert";
import { formatearFecha } from "@/lib/formato";
import { cargarRazas } from "@/lib/razas";
import { AltaForm } from "./alta-form";

// Pantalla pública: no hay sesión todavía (la cuenta se crea al final) y
// por eso NO está en las zonas protegidas del middleware. Lo único que la
// abre es el token del link.
//
// Los catálogos se leen con la secret key porque sus políticas de RLS son
// `to authenticated` y aquí no hay nadie autenticado. Son catálogos
// (tamaños y tipos de pelaje), no datos de nadie: lo que se expone es la
// misma lista que ve cualquier empleado, sin tocar el RLS de las tablas
// que sí traen información de clientes.
export default async function AltaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();

  const { data: invitacion } = await admin
    .from("invitaciones_cliente")
    .select("id, nombre_referencia, expira_at, usada_at, cancelada_at")
    .eq("token", token)
    .is("deleted_at", null)
    .maybeSingle();

  const problema = !invitacion
    ? "Este link no existe. Revisa que lo hayas copiado completo, o pídele uno nuevo a recepción."
    : invitacion.cancelada_at
      ? "Este link fue cancelado. Pídele uno nuevo a recepción."
      : invitacion.usada_at
        ? "Este link ya se usó. Si ya te diste de alta, entra con tu correo y contraseña."
        : new Date(invitacion.expira_at as string) <= new Date()
          ? "Este link ya venció. Pídele uno nuevo a recepción."
          : null;

  if (problema) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6">
        <h1 className="text-2xl font-bold text-n-900">Alta en Ludogteka</h1>
        <Alert variante="advertencia" titulo="No podemos abrir este link">
          {problema}
        </Alert>
        <a href="/login" className="text-sm font-semibold text-azul hover:underline">
          Ir a iniciar sesión →
        </a>
      </main>
    );
  }

  // El catálogo de razas viaja SIN el grupo de precio: el dueño escoge la
  // raza de su perro, no el cajón en el que el negocio lo cobra. Mandar el
  // grupo aunque no se pinte sería dejarlo servido en el HTML.
  const [razas, { data: tamanos }, { data: pelajes }] = await Promise.all([
    cargarRazas(admin),
    admin.from("tamanos_categoria").select("id, etiqueta").is("deleted_at", null).order("orden"),
    admin.from("tipos_pelaje").select("id, etiqueta").is("deleted_at", null).order("orden"),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-n-900">Bienvenido a Ludogteka</h1>
        <p className="mt-1 text-n-600">
          Regístrate y cuéntanos de tu perro. Toma unos minutos y lo puedes hacer desde el celular.
        </p>
        <p className="mt-2 text-sm text-n-500">
          Este link es tuyo y de un solo uso. Vence el{" "}
          {formatearFecha(invitacion!.expira_at as string)}.
        </p>
      </header>

      <AltaForm
        token={token}
        razas={razas}
        tamanos={(tamanos as { id: string; etiqueta: string }[]) ?? []}
        pelajes={(pelajes as { id: string; etiqueta: string }[]) ?? []}
      />
    </main>
  );
}
