import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ListaClientes, type ClienteFila } from "./lista-clientes";

export default async function ClientesPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, email, created_at")
    .is("deleted_at", null)
    .order("nombre");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">Clientes</h1>
          <p className="mt-1 text-n-600">Dueños registrados en el negocio.</p>
        </div>
        <Link href="/clientes/nuevo">
          <Button type="button">Nuevo cliente</Button>
        </Link>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar los clientes">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (
        <ListaClientes clientes={(data as ClienteFila[]) ?? []} />
      )}
    </div>
  );
}
