import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual } from "@/lib/negocio/actual";
import { rutaPorRol } from "@/lib/auth/rutas";
import { LoginForm } from "./login-form";
import { EncabezadoNegocio } from "@/components/marca/encabezado-negocio";
import { LimpiarCopiasSinConexion } from "@/components/pwa/pwa-negocio";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Hay dos sesiones posibles en este navegador (personal y portal): con cualquiera activa no se muestra el login.
  for (const area of ["personal", "portal"] as const) {
    const supabase = await createSupabaseServerClient(area);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: rol } = await supabase.rpc("current_rol");
      if (rol && rol !== "anonimo") redirect(rutaPorRol(rol as string));
    }
  }

  // El teléfono de recepción se lee con la secret key: esta pantalla es
  // pública y quien la abre no tiene sesión, pero es justo quien necesita
  // el número. La función que se llama devuelve SOLO ese dato, nada más
  // de la configuración del negocio.
  const negocio = await negocioActual();
  const admin = createSupabaseAdminClient(negocio.id);
  const [{ data: telefonoRecepcion }, { count: admins }] = await Promise.all([
    admin.rpc("telefono_recepcion_publico"),
    // QA S22: con un solo admin, «pídele a un admin» no sirve (es el mismo dueño).
    admin.from("membresias").select("id", { count: "exact", head: true }).eq("negocio_id", negocio.id).eq("rol", "admin").is("deleted_at", null),
  ]);

  const { error } = await searchParams;
  const errorInicial =
    error === "invitacion_invalida"
      ? "Tu link de invitación ya no es válido — expiró o ya se usó. Pide uno nuevo."
      : error === "link_vencido"
        ? "Ese link para entrar ya se usó o venció. Entra con tu teléfono y la contraseña que escogiste al registrarte."
        : null;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      {/* Quien llega al login ya no tiene sesión: las copias para ver sin conexión se borran. */}
      <LimpiarCopiasSinConexion />
      <div className="w-full max-w-sm">
        <div className="mb-3 flex justify-center">
          <EncabezadoNegocio />
        </div>
        <h1 className="sr-only">{negocio.nombre}</h1>
        <p className="mb-8 text-center text-n-600">Inicia sesión para continuar</p>
        <LoginForm
          errorInicial={errorInicial}
          telefonoRecepcion={(telefonoRecepcion as string | null) ?? null}
          nombreNegocio={negocio.nombre}
          unSoloAdmin={(admins ?? 0) <= 1}
        />
      </div>
    </main>
  );
}
