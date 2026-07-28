import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { PerroForm } from "../perro-form";
import { PerroFoto } from "../perro-foto";
import { actualizarPerro } from "../actions";

export default async function PerroPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creado?: string }>;
}) {
  const { id } = await params;
  const { creado } = await searchParams;

  const sesion = await obtenerSesionConRol();
  if (!sesion) return null;

  const supabase = await createSupabaseServerClient();
  const [{ data: perro }, { data: tamanos }, { data: pelajes }] = await Promise.all([
    supabase
      .from("perros")
      .select(
        "id, nombre, raza, sexo, esterilizado, fecha_nacimiento, tamano_id, pelaje_id, alimentacion_notas, temperamento_notas, fallecido, foto_path, cliente_id, clientes(nombre)"
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("tamanos_categoria")
      .select("id, etiqueta")
      .is("deleted_at", null)
      .order("orden"),
    supabase.from("tipos_pelaje").select("id, etiqueta").is("deleted_at", null).order("orden"),
  ]);

  if (!perro) notFound();

  let urlFoto: string | null = null;
  if (perro.foto_path) {
    const { data } = await supabase.storage
      .from("perros-archivos")
      .createSignedUrl(perro.foto_path, 60 * 60);
    urlFoto = data?.signedUrl ?? null;
  }

  const cliente = perro.clientes as unknown as { nombre: string } | null;
  const actualizarConId = actualizarPerro.bind(null, id);
  const soloLectura = sesion.rol === "estetica";

  return (
    <div className="flex flex-col gap-6">
      <div>
        {perro.cliente_id && cliente && (
          <Link
            href={`/clientes/${perro.cliente_id}`}
            className="text-sm font-semibold text-azul hover:underline"
          >
            ← {cliente.nombre}
          </Link>
        )}
        <h1 className="mt-1 text-2xl font-bold text-n-900">{perro.nombre}</h1>
        <p className="mt-1 text-n-600">Expediente del perro.</p>
      </div>

      {perro.fallecido && (
        <Alert variante="advertencia" titulo="Este perro falleció">
          El expediente se conserva como parte del historial del cliente.
        </Alert>
      )}

      {creado === "1" && <Alert variante="exito" titulo="Perro creado correctamente" />}

      <PerroFoto
        perroId={id}
        urlInicial={urlFoto}
        tieneFotoInicial={Boolean(perro.foto_path)}
        soloLectura={soloLectura}
        tamano="grande"
      />

      <PerroForm
        action={actualizarConId}
        tamanos={tamanos ?? []}
        pelajes={pelajes ?? []}
        valoresIniciales={{
          nombre: perro.nombre,
          raza: perro.raza,
          sexo: perro.sexo,
          esterilizado: perro.esterilizado,
          fecha_nacimiento: perro.fecha_nacimiento,
          tamano_id: perro.tamano_id,
          pelaje_id: perro.pelaje_id,
          alimentacion_notas: perro.alimentacion_notas,
          temperamento_notas: perro.temperamento_notas,
        }}
        textoBoton="Guardar cambios"
        soloLectura={soloLectura}
      />
    </div>
  );
}
