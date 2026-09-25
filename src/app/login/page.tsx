import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual } from "@/lib/negocio/actual";
import { rutaPorRol } from "@/lib/auth/rutas";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: rol } = await supabase.rpc("current_rol");
    if (rol && rol !== "anonimo") redirect(rutaPorRol(rol as string));
  }

  // El teléfono de recepción se lee con la secret key: esta pantalla es
  // pública y quien la abre no tiene sesión, pero es justo quien necesita
  // el número. La función que se llama devuelve SOLO ese dato, nada más
  // de la configuración del negocio.
  const negocio = await negocioActual();
  const { data: telefonoRecepcion } = await createSupabaseAdminClient(negocio.id).rpc(
    "telefono_recepcion_publico"
  );

  const { error } = await searchParams;
  const errorInicial =
    error === "invitacion_invalida"
      ? "Tu link de invitación ya no es válido — expiró o ya se usó. Pide uno nuevo."
      : null;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-3xl font-extrabold tracking-tight text-azul">
          {negocio.nombre}
        </h1>
        <p className="mb-8 text-center text-n-600">Inicia sesión para continuar</p>
        <LoginForm
          errorInicial={errorInicial}
          telefonoRecepcion={(telefonoRecepcion as string | null) ?? null}
          nombreNegocio={negocio.nombre}
        />
      </div>
    </main>
  );
}
