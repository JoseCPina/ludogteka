import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { InvitarStaff } from "./invitar-staff";
import { ListaCuentas, type Cuenta } from "./lista-cuentas";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("listar_cuentas");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Panel de admin</h1>
        <p className="mt-1 text-n-600">Invita personal y revisa quién tiene cuenta.</p>
      </div>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-n-900">Invitar personal</h2>
        <InvitarStaff />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold text-n-900">Cuentas</h2>
        {error ? (
          <Alert variante="error" titulo="No pudimos cargar las cuentas">
            Recarga la página. Si el problema sigue, avísale al equipo técnico.
          </Alert>
        ) : (
          <ListaCuentas cuentas={(data as Cuenta[]) ?? []} />
        )}
      </section>
    </div>
  );
}
