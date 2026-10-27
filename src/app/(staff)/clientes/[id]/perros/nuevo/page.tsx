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
import { vocabularioMascota } from "@/lib/perros/vocabulario";

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
    // Con Veterinaria el alta escoge la especie: llegan las razas de todas y el selector filtra.
    cargarRazas(supabase, await negocioIdActual(), { conGrupo: true, especie: "todas" }),
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
  // QA S39 (N137): sin especie escogida todavía, «mascota» (con Veterinaria) o «perro».
  const v = vocabularioMascota({ conVet });

  // Viene de agendar una cita de estética: alta corta del perro.
  const corta = Boolean(volver?.startsWith("/estetica"));
  const crearConCliente = volver ? crearPerroYVolver.bind(null, id, volver) : crearPerro.bind(null, id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/clientes/${id}`} className="text-sm font-semibold text-morado hover:underline">
          ← {cliente.nombre}
        </Link>
      </div>

      {volver && (
        <Alert variante="exito" titulo={`${cliente.nombre} quedó registrado`}>
          Registra a {v.su} y regresas a donde estabas con el cliente ya elegido.{" "}
          <Link href={hrefDeVuelta(volver, id)} className="font-semibold underline">
            Seguir sin registrar {v.nombre}
          </Link>
        </Alert>
      )}

      {recienCreado && (
        <Alert variante="exito" titulo={`${cliente.nombre} quedó registrado`}>
          Registra a {v.su} y quedas en su ficha.{" "}
          <Link href={`/clientes/${id}`} className="font-semibold underline" data-seguir-sin-perro>
            Seguir sin registrar {v.nombre}
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
        alta={{ clienteNombre: cliente.nombre }}
        textoBoton={volver ? "Guardar {mascota} y seguir" : "Guardar {mascota}"}
      />
    </div>
  );
}
