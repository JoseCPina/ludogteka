import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ListaClientes, type ClienteFila } from "./lista-clientes";
import { leerTodo } from "@/lib/supabase/paginar";
import { vocabularioMascota } from "@/lib/perros/vocabulario";
import { usaVeterinaria } from "@/lib/plan/modulos";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Enlace } from "@/components/ui/enlace";

export default async function ClientesPage() {
  // QA S39 (N137): con Veterinaria, «mascotas».
  const v = vocabularioMascota({ conVet: usaVeterinaria((await obtenerSesionConRol())?.modulos ?? []) });
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: perros }] = await Promise.all([
    // Todos, página por página: la API corta en 1,000 filas y un negocio con más clientes quedaba con la lista a medias.
    leerTodo<Omit<ClienteFila, "perros">>(() =>
      supabase
        .from("clientes")
        .select("id, nombre, telefono, email, created_at, alta_por_cliente, datos_revisados_at")
        .is("deleted_at", null)
        .eq("publico_general", false)
        .order("nombre")
        .order("id")
    ),
    // Para buscar por nombre del perro, como en todos los buscadores.
    leerTodo<{ id: string; cliente_id: string; nombre: string }>(() => supabase.from("perros").select("id, cliente_id, nombre").is("deleted_at", null).eq("fallecido", false).order("nombre").order("id")),
  ]);
  const perrosPorCliente = new Map<string, { id: string; nombre: string }[]>();
  for (const p of perros) {
    const lista = perrosPorCliente.get(p.cliente_id as string) ?? [];
    lista.push({ id: p.id as string, nombre: p.nombre as string });
    perrosPorCliente.set(p.cliente_id as string, lista);
  }
  const filas: ClienteFila[] = data.map((c) => ({
    ...c,
    perros: perrosPorCliente.get(c.id) ?? [],
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">Clientes</h1>
          <p className="mt-1 text-n-600">
            Dueños registrados en el negocio. Con el link de alta, el dueño captura sus datos y los
            de sus {v.plural}, y el expediente llega aquí ya ligado a su cuenta.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Enlace href="/clientes/invitaciones">Mandar link de alta</Enlace>
          <Enlace href="/clientes/nuevo">
              Capturar a mano
            </Enlace>
        </div>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar los clientes">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (
        <ListaClientes clientes={filas} />
      )}
    </div>
  );
}
