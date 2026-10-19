import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { VolverBienvenida } from "../volver";
import { FormularioEquipo } from "./formulario-equipo";
import { YoAtiendo } from "./yo-atiendo";

// «Tu equipo» (QA S16): quién atiende. En Estética y Veterinaria, para asignarle una cita a alguien, esa persona
// necesita cuenta; un empleado solo en nómina no aparece en la agenda.
export default async function EquipoPage() {
  const sesion = await obtenerSesionConRol();
  const mods = sesion?.modulos ?? [];
  const supabase = await createSupabaseServerClient();
  const [{ data: personal }, { data: ajustes }] = await Promise.all([
    supabase.rpc("listar_personal"),
    supabase.from("negocio_ajustes_operacion").select("dueno_atiende_estetica").is("deleted_at", null).maybeSingle(),
  ]);
  const equipo = ((personal ?? []) as { id: string; nombre_completo: string | null; rol: string }[]).filter((p) => p.rol !== "cliente");
  const conEstetica = mods.includes("estetica");
  const conVet = mods.includes("veterinaria");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <VolverBienvenida />
        <h1 className="mt-1 text-2xl font-bold text-n-900">{conEstetica ? "Quién atiende" : "Tu equipo"}</h1>
        <p className="mt-1 text-n-600">
          {conEstetica || conVet
            ? "Para asignarle una cita o una consulta a alguien, esa persona necesita cuenta en PeluDesk. Invítala con su correo: le llega un link para crear su contraseña y ya aparece en la agenda."
            : "Con tu cuenta basta para operar. Agrega a quien vaya a usar la app (con cuenta) o a quien solo le pagas (en nómina)."}
        </p>
      </div>

      {equipo.length > 0 && (
        <section className="rounded-lg border border-n-200 bg-white p-4">
          <h2 className="font-semibold text-n-900">Con cuenta en {conEstetica ? "tu negocio" : "PeluDesk"}</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-n-800" data-equipo-con-cuenta>
            {equipo.map((p) => (
              <li key={p.id}>
                {p.nombre_completo || "Sin nombre"} · {p.rol === "admin" ? "Admin" : p.rol === "estetica" ? "Estética" : "Recepción"}
              </li>
            ))}
          </ul>
        </section>
      )}

      {conEstetica && <YoAtiendo atiende={Boolean(ajustes?.dueno_atiende_estetica)} />}

      <FormularioEquipo conEmpleados={mods.includes("empleados")} conEstetica={conEstetica} conVet={conVet} />
    </div>
  );
}
