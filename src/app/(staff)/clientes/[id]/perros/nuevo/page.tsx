import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PerroForm } from "@/app/(staff)/perros/perro-form";
import { crearPerro } from "@/app/(staff)/perros/actions";

export default async function NuevoPerroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const [{ data: cliente }, { data: tamanos }, { data: pelajes }] = await Promise.all([
    supabase.from("clientes").select("id, nombre").eq("id", id).is("deleted_at", null).single(),
    supabase
      .from("tamanos_categoria")
      .select("id, etiqueta")
      .is("deleted_at", null)
      .order("orden"),
    supabase.from("tipos_pelaje").select("id, etiqueta").is("deleted_at", null).order("orden"),
  ]);

  if (!cliente) notFound();

  const crearConCliente = crearPerro.bind(null, id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/clientes/${id}`} className="text-sm font-semibold text-azul hover:underline">
          ← {cliente.nombre}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Nuevo perro</h1>
        <p className="mt-1 text-n-600">Se va a registrar como perro de {cliente.nombre}.</p>
      </div>

      <PerroForm
        action={crearConCliente}
        tamanos={tamanos ?? []}
        pelajes={pelajes ?? []}
        textoBoton="Guardar perro"
      />
    </div>
  );
}
