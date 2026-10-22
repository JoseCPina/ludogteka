import { redirect } from "next/navigation";
import { getUserConReintento } from "@/lib/supabase/get-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { debeCambiarPassword } from "@/lib/auth/cambio-obligatorio";
import { CambiarContrasenaForm } from "./cambiar-contrasena-form";

export default async function CambiarContrasenaPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await getUserConReintento(supabase);
  if (!user) redirect("/login");
  const obligatorio = debeCambiarPassword(user);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Cambia tu contraseña</h1>
        <p className="text-n-600">
          {obligatorio
            ? "Entraste con una contraseña temporal. Escoge una nueva para seguir; la temporal deja de servir."
            : "Escoge una contraseña nueva para entrar a tu portal."}
        </p>
      </div>
      <CambiarContrasenaForm obligatorio={obligatorio} />
    </div>
  );
}
