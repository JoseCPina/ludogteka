import { puedeEditarFichaClinica } from "@/lib/veterinaria/ficha-permiso";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PerroForm } from "@/app/(staff)/perros/perro-form";
import { crearPerro, crearPerroYVolver } from "@/app/(staff)/perros/actions";
import { cargarRazas } from "@/lib/razas";
import { contextoRazaFormulario } from "@/lib/razas-form";
import { negocioIdActual } from "@/lib/negocio/actual";
import { Alert } from "@/components/ui/alert";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { usaVeterinaria } from "@/lib/plan/modulos";
import { hrefDeVuelta, rutaDeVuelta } from "@/lib/clientes/volver";

export default async function NuevoPerroPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ volver?: string; alta?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const volver = rutaDeVuelta(sp.volver);
  const recienCreado = !volver && sp.alta === "1";

  const supabase = await createSupabaseServerClient();
  const [{ data: cliente }, razas, { data: tamanos }, { data: pelajes }] = await Promise.all([
    supabase.from("clientes").select("id, nombre").eq("id", id).is("deleted_at", null).single(),
    cargarRazas(supabase, await negocioIdActual(), { conGrupo: true }),
    supabase
      .from("tamanos_categoria")
      .select("id, etiqueta")
      .is("deleted_at", null)
      .order("orden"),
    supabase.from("tipos_pelaje").select("id, etiqueta").is("deleted_at", null).order("orden"),
  ]);

  if (!cliente) notFound();
  const contextoRaza = await contextoRazaFormulario(supabase, null);
  const sesion = await obtenerSesionConRol();
  const conVet = Boolean(sesion) && usaVeterinaria(sesion!.modulos);
  const conFichaClinica = conVet && (await puedeEditarFichaClinica(sesion));

  // Viene de agendar una cita de estética: alta corta del perro.
  const corta = Boolean(volver?.startsWith("/estetica"));
  const crearConCliente = volver ? crearPerroYVolver.bind(null, id, volver) : crearPerro.bind(null, id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/clientes/${id}`} className="text-sm font-semibold text-morado hover:underline">
          ← {cliente.nombre}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Nuevo perro</h1>
        <p className="mt-1 text-n-600">Se va a registrar como perro de {cliente.nombre}.</p>
      </div>

      {volver && (
        <Alert variante="exito" titulo={`${cliente.nombre} quedó registrado`}>
          Registra a su perro y regresas a donde estabas con el cliente ya elegido.{" "}
          <Link href={hrefDeVuelta(volver, id)} className="font-semibold underline">
            Seguir sin registrar perro
          </Link>
        </Alert>
      )}

      {recienCreado && (
        <Alert variante="exito" titulo={`${cliente.nombre} quedó registrado`}>
          Registra a su {conVet ? "mascota" : "perro"} y quedas en su ficha.{" "}
          <Link href={`/clientes/${id}`} className="font-semibold underline" data-seguir-sin-perro>
            Seguir sin registrar {conVet ? "mascota" : "perro"}
          </Link>
        </Alert>
      )}

      <PerroForm
        action={crearConCliente}
        razas={razas}
        tamanos={tamanos ?? []}
        pelajes={pelajes ?? []}
        corta={corta}
        borrador={{ formulario: "mascota_nueva", clave: id }}
        clinico={conFichaClinica}
        grupos={contextoRaza.grupos}
        puedeAsignarGrupo={contextoRaza.puedeAsignarGrupo}
        textoBoton={volver ? "Guardar perro y seguir" : "Guardar perro"}
      />
    </div>
  );
}
