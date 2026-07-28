import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { VincularFila } from "./vincular-fila";
import { DesvincularFila } from "./desvincular-fila";
import type { CuentaPendiente, CuentaVinculada, ClienteBusqueda } from "./tipos";

export default async function VinculacionPage() {
  const supabase = await createSupabaseServerClient();

  const [pendientesRes, vinculadasRes, clientesRes] = await Promise.all([
    supabase.rpc("listar_cuentas_sin_vincular"),
    supabase.rpc("listar_cuentas_vinculadas"),
    supabase.from("clientes").select("id, nombre, telefono").is("deleted_at", null).order("nombre"),
  ]);

  const pendientes = (pendientesRes.data as CuentaPendiente[] | null) ?? [];
  const vinculadas = (vinculadasRes.data as CuentaVinculada[] | null) ?? [];
  const clientes = (clientesRes.data as ClienteBusqueda[] | null) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Vinculación de cuentas</h1>
        <p className="mt-1 text-n-600">
          Conecta cada cuenta del portal con el expediente de su dueño. Verifica bien antes de
          confirmar: da acceso al historial de otra persona.
        </p>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-bold text-n-900">Pendientes de vincular</h2>
        {pendientesRes.error ? (
          <Alert variante="error" titulo="No pudimos cargar las cuentas pendientes">
            Recarga la página. Si el problema sigue, avísale al equipo técnico.
          </Alert>
        ) : pendientes.length === 0 ? (
          <div className="rounded-lg border-[1.5px] border-dashed border-n-300 bg-white p-8 text-center">
            <p className="text-n-600">No hay cuentas pendientes de vincular.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-n-200 bg-white">
            {pendientes.map((cuenta) => (
              <VincularFila key={cuenta.id} cuenta={cuenta} clientes={clientes} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold text-n-900">Cuentas vinculadas</h2>
        {vinculadasRes.error ? (
          <Alert variante="error" titulo="No pudimos cargar las cuentas vinculadas">
            Recarga la página. Si el problema sigue, avísale al equipo técnico.
          </Alert>
        ) : vinculadas.length === 0 ? (
          <div className="rounded-lg border-[1.5px] border-dashed border-n-300 bg-white p-8 text-center">
            <p className="text-n-600">Todavía no hay cuentas vinculadas.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-n-200 bg-white">
            {vinculadas.map((cuenta) => (
              <DesvincularFila key={cuenta.profile_id} cuenta={cuenta} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
