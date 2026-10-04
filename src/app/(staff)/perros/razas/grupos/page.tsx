import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { Alert } from "@/components/ui/alert";
import { diasDesde } from "@/lib/antiguedad";
import { hoyNegocio } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { GruposDeRaza, type RazaSinGrupo } from "./grupos-de-raza";

/**
 * Las razas del catálogo que este negocio todavía no mete en un grupo de
 * precio. Mientras no lo hagan, la app no adivina ningún precio para los
 * perros de esa raza: la cita de estética pide asignarlo o registrar una
 * excepción. El grupo lo decide el negocio (admin o quien tenga «Precios y
 * tarifas»).
 */
export default async function GruposDeRazaPage() {
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const zona = await zonaActual();
  const hoy = hoyNegocio(zona);
  const [{ data: sinGrupo }, { data: propuestasCrudo }, { data: grupos }] = await Promise.all([
    supabase.rpc("razas_sin_grupo"),
    supabase.rpc("razas_propuestas_sin_grupo"),
    supabase.from("grupos_raza").select("id, nombre, depende_tamano").is("deleted_at", null).order("orden"),
  ]);
  const razas: RazaSinGrupo[] = ((sinGrupo ?? []) as { raza_id: string; nombre: string; perros: number; desde: string; tamano: string | null; pelaje: string | null }[]).map((r) => ({
    id: r.raza_id, nombre: r.nombre, perros: r.perros, tamano: r.tamano, pelaje: r.pelaje, dias: diasDesde(r.desde, hoy, zona),
  }));

  const propuestas: RazaSinGrupo[] = ((propuestasCrudo ?? []) as { propuesta_id: string; nombre: string; perros: number; desde: string; tamano: string | null; pelaje: string | null; notas: string | null }[]).map((r) => ({
    id: r.propuesta_id, nombre: r.nombre, perros: r.perros, tamano: r.tamano, pelaje: r.pelaje, notas: r.notas, dias: diasDesde(r.desde, hoy, zona),
  }));
  const listaGrupos = (grupos ?? []) as { id: string; nombre: string; depende_tamano: boolean }[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/perros/razas" className="text-sm font-semibold text-morado hover:underline">
          ← Razas
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Razas sin grupo de precio</h1>
        <p className="mt-1 text-n-600">
          Son razas del catálogo con perros de este negocio. Hasta que les asignes un grupo, la app no les adivina precio.
        </p>
      </div>
      {!tienePermiso(sesion, "tarifas") && (
        <Alert variante="advertencia" titulo="Solo lectura">
          Asignar el grupo de precio es de admin o de quien tenga el permiso «Precios y tarifas».
        </Alert>
      )}
      {razas.length === 0 && propuestas.length === 0 ? (
        <Alert variante="exito" titulo="No queda ninguna">
          Todas las razas con perros de este negocio tienen su grupo de precio.
        </Alert>
      ) : (
        <>
          {razas.length > 0 && <GruposDeRaza razas={razas} grupos={listaGrupos} puedeAsignar={tienePermiso(sesion, "tarifas")} />}
          {propuestas.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-bold text-n-900">Razas propuestas, en revisión</h2>
              <p className="text-n-600">
                Son razas que se propusieron al capturar un perro y que PeluDesk todavía no aprueba. Si les das grupo ahora, sus perros ya se pueden agendar; al aprobarse, queda como el grupo de la raza en este negocio.
              </p>
              <GruposDeRaza propuestas razas={propuestas} grupos={listaGrupos} puedeAsignar={tienePermiso(sesion, "tarifas")} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
