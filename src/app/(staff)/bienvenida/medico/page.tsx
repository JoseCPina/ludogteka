import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { VolverBienvenida } from "../volver";
import { DesignarMedico } from "./designar-medico";

// «Médico veterinario» (QA S16): antes de agendar consultas hace falta al menos un médico con cuenta y cédula. Si el
// dueño es el médico, se designa a sí mismo; si no, se designa a una persona del personal que ya tiene cuenta.
export default async function MedicoPage() {
  const sesion = await obtenerSesionConRol();
  const supabase = await createSupabaseServerClient();
  const [{ data: medicos }, { data: personal }] = await Promise.all([
    supabase.from("medicos_veterinarios").select("id, profile_id, cedula_profesional").is("deleted_at", null),
    supabase.rpc("listar_personal"),
  ]);
  const lista = (medicos ?? []) as { id: string; profile_id: string; cedula_profesional: string }[];
  const gente = ((personal ?? []) as { id: string; nombre_completo: string | null; rol: string }[]).filter((p) => p.rol !== "cliente");
  const nombreDe = (id: string) => gente.find((p) => p.id === id)?.nombre_completo || "Sin nombre";
  const soyMedico = lista.some((m) => m.profile_id === sesion?.user.id);
  const candidatos = gente.filter((p) => !lista.some((m) => m.profile_id === p.id) && p.id !== sesion?.user.id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <VolverBienvenida />
        <h1 className="mt-1 text-2xl font-bold text-n-900">Médico veterinario</h1>
        <p className="mt-1 text-n-600">
          Antes de agendar consultas hace falta al menos un médico con cuenta en PeluDesk y cédula profesional: las consultas, las recetas y los
          certificados van a su nombre. La cédula son 7 u 8 números (Registro Nacional de Profesionistas).
        </p>
      </div>
      {lista.length > 0 && (
        <section className="rounded-lg border-[1.5px] border-menta bg-menta-suave p-4" data-medicos-designados>
          <h2 className="font-semibold text-menta-oscuro">Ya puedes agendar consultas</h2>
          <ul className="mt-1 text-sm text-n-800">
            {lista.map((m) => (
              <li key={m.id}>
                {nombreDe(m.profile_id)} · Cédula {m.cedula_profesional}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-n-700">
            Folios, CPA y permisos del establecimiento se capturan en{" "}
            <Link href="/veterinaria/medicos" className="font-semibold text-morado hover:underline">
              Veterinaria → Médicos
            </Link>
            .
          </p>
        </section>
      )}
      <DesignarMedico soyMedico={soyMedico} candidatos={candidatos.map((p) => ({ id: p.id, nombre: p.nombre_completo || "Sin nombre" }))} />
    </div>
  );
}
