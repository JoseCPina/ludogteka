import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatearTelefono } from "@/lib/telefono";
import { ClienteForm } from "../cliente-form";
import { BajaClienteBoton } from "../baja-cliente-boton";
import { actualizarCliente, darDeBajaCliente } from "../actions";
import { PerroFoto } from "../../perros/perro-foto";

export default async function EditarClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creado?: string }>;
}) {
  const { id } = await params;
  const { creado } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, email")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!cliente) notFound();

  const { data: perros } = await supabase
    .from("perros")
    .select("id, nombre, fallecido, foto_path, tamanos_categoria(etiqueta)")
    .eq("cliente_id", id)
    .is("deleted_at", null)
    .order("nombre");

  const urlsFotos = new Map<string, string>();
  await Promise.all(
    (perros ?? [])
      .filter((p) => p.foto_path)
      .map(async (p) => {
        const { data } = await supabase.storage
          .from("perros-archivos")
          .createSignedUrl(p.foto_path as string, 60 * 60);
        if (data?.signedUrl) urlsFotos.set(p.id, data.signedUrl);
      })
  );

  const actualizarConId = actualizarCliente.bind(null, id);
  const bajaConId = darDeBajaCliente.bind(null, id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">{cliente.nombre}</h1>
        <p className="mt-1 text-n-600">Editar datos del dueño.</p>
      </div>

      {creado === "1" && <Alert variante="exito" titulo="Cliente creado correctamente" />}

      <ClienteForm
        action={actualizarConId}
        valoresIniciales={{
          nombre: cliente.nombre,
          telefono: formatearTelefono(cliente.telefono),
          email: cliente.email,
        }}
        textoBoton="Guardar cambios"
      />

      <div className="flex flex-col gap-3 border-t border-n-200 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-n-900">Perros</h2>
          <Link href={`/clientes/${id}/perros/nuevo`}>
            <Button type="button" variante="secundario">
              Agregar perro
            </Button>
          </Link>
        </div>

        {!perros || perros.length === 0 ? (
          <p className="text-n-600">Este dueño todavía no tiene perros registrados.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {perros.map((perro) => {
              const tamano = perro.tamanos_categoria as unknown as { etiqueta: string } | null;
              return (
                <li key={perro.id}>
                  <Link
                    href={`/perros/${perro.id}`}
                    className="flex items-center justify-between rounded-md border-[1.5px] border-n-200 bg-white px-4 py-3 hover:border-azul"
                  >
                    <span className="flex items-center gap-3">
                      <PerroFoto
                        perroId={perro.id}
                        urlInicial={urlsFotos.get(perro.id) ?? null}
                        tieneFotoInicial={Boolean(perro.foto_path)}
                        soloLectura
                        tamano="miniatura"
                      />
                      <span className="font-semibold text-n-900">{perro.nombre}</span>
                    </span>
                    <span className="flex items-center gap-2 text-sm text-n-600">
                      {tamano?.etiqueta ?? "Sin tamaño"}
                      {perro.fallecido && (
                        <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">
                          Falleció
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Dar de baja</h2>
        <p className="text-n-600">
          El cliente deja de aparecer en el listado, pero su historial no se borra.
        </p>
        <BajaClienteBoton accion={bajaConId} nombre={cliente.nombre} />
      </div>
    </div>
  );
}
