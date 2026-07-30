import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { InvitarStaff } from "./invitar-staff";
import { ListaCuentas, type Cuenta } from "./lista-cuentas";
import { DescuentoConfig } from "./descuento-config";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: topeData }] = await Promise.all([
    supabase.rpc("listar_cuentas"),
    supabase.rpc("resolver_tope_descuento_recepcion"),
  ]);
  const topeFila = Array.isArray(topeData) ? topeData[0] : topeData;

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

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-n-900">Tope de descuentos de recepción</h2>
        <DescuentoConfig
          topeActual={topeFila?.estado === "configurado" ? Number(topeFila.tope_recepcion) : null}
          vigenteDesde={topeFila?.vigencia_desde ?? null}
        />
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
