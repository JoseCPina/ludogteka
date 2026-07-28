import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rutaPorRol } from "@/lib/auth/rutas";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: perfil } = await supabase
      .from("profiles")
      .select("rol")
      .eq("id", user.id)
      .single();
    redirect(rutaPorRol(perfil?.rol));
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-3xl font-extrabold tracking-tight text-azul">
          Ludogteka
        </h1>
        <p className="mb-8 text-center text-n-600">Inicia sesión para continuar</p>
        <LoginForm />
      </div>
    </main>
  );
}
