import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioActual, urlDelNegocio } from "@/lib/negocio/actual";
import { rutaPorRol } from "@/lib/auth/rutas";
import { cerrarSesion } from "@/lib/auth/actions";
import { Alert } from "@/components/ui/alert";

// Una cuenta de PeluDesk que existe (la persona es cliente o trabaja en
// otro negocio) pero no tiene membresía en el negocio de este dominio.
// Aquí no entra; se le dice a cuáles sí, cada uno por su propio dominio.
export default async function SinAccesoPage() {
  const negocio = await negocioActual();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rol } = await supabase.rpc("current_rol");
  if (rol && rol !== "anonimo") redirect(rutaPorRol(rol as string));

  const { data: suyos } = await supabase.rpc("mis_negocios");
  const negocios = ((suyos ?? []) as { id: string; slug: string; nombre: string; dominio: string | null }[]).filter(
    (n) => n.id !== negocio.id
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-5 p-6">
      <h1 className="text-2xl font-bold text-n-900">{negocio.nombre}</h1>
      <Alert variante="advertencia" titulo={`Tu cuenta no tiene acceso a ${negocio.nombre}`}>
        Si eres cliente, pídele a recepción tu link de registro. Si trabajas aquí, pídele a quien administra el
        negocio que te dé acceso.
      </Alert>
      {negocios.length > 0 && (
        <section className="rounded-lg border border-n-200 bg-white p-5">
          <p className="font-semibold text-n-900">Tu cuenta sí entra a:</p>
          <ul className="mt-3 flex flex-col gap-2">
            {negocios.map((n) => (
              <li key={n.id}>
                <a href={`${urlDelNegocio(n)}/login`} className="font-semibold text-azul hover:underline">
                  {n.nombre} →
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <form action={cerrarSesion}>
        <button type="submit" className="text-sm font-semibold text-n-600 hover:underline">
          Cerrar sesión
        </button>
      </form>
    </main>
  );
}
