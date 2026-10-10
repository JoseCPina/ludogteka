import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { BotonAccion, Desplegable, FormularioAccion } from "@/components/formulario-accion";
import { formatearFechaCalendario } from "@/lib/formato";
import { asignarFolios, guardarMedico, quitarMedico } from "./actions";

type Bloque = {
  bloque_id: string;
  medico_id: string;
  prefijo: string;
  folio_desde: number;
  folio_hasta: number;
  asignado_el: string;
  nota: string | null;
  asignados: number;
  usados: number;
  disponibles: number;
};

const nombreDe = (p: unknown) => (p as { nombre_completo: string | null } | null)?.nombre_completo ?? "Sin nombre";

export default async function MedicosPage() {
  const sesion = await obtenerSesionConRol();
  if (sesion?.rol !== "admin") redirect("/veterinaria");
  const supabase = await createSupabaseServerClient();

  const [{ data: medicos, error }, { data: bloquesCrudo }, { data: personal }] = await Promise.all([
    supabase
      .from("medicos_veterinarios")
      .select("id, profile_id, cedula_profesional, cpa_sitpv, profiles(nombre_completo)")
      .is("deleted_at", null)
      .order("created_at"),
    supabase.from("medico_folios_resumen").select("*").order("folio_desde"),
    supabase.from("membresias").select("profile_id, profiles(nombre_completo)").in("rol", ["admin", "recepcion", "estetica"]).is("deleted_at", null),
  ]);
  const bloques = (bloquesCrudo ?? []) as Bloque[];
  const designados = new Set((medicos ?? []).map((m) => m.profile_id as string));
  const candidatos = (personal ?? []).filter((p) => !designados.has(p.profile_id as string));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/veterinaria" className="text-sm font-semibold text-morado hover:underline">
          ← Veterinaria
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Médicos veterinarios</h1>
        <p className="mt-1 max-w-3xl text-n-600">
          El médico veterinario es el único que firmará expediente y recetas en las siguientes fases. Aquí designas a quién del personal lo es, con su cédula y su registro en el SITPV, y le asignas sus bloques de folios de receta.
        </p>
      </div>

      {error && (
        <Alert variante="error" titulo="No pudimos cargar a los médicos">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-n-900">Médicos designados ({(medicos ?? []).length})</h2>
        {(medicos ?? []).length === 0 && <p className="rounded-lg border border-n-200 bg-white p-4 text-n-700">Todavía no hay médicos designados.</p>}
        <ul className="flex flex-col gap-4">
          {(medicos ?? []).map((m) => {
            const suyos = bloques.filter((b) => b.medico_id === m.id);
            return (
              <li key={m.id as string} className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
                <div>
                  <p className="text-lg font-bold text-n-900">{nombreDe(m.profiles)}</p>
                  <p className="text-sm text-n-600">
                    Cédula profesional {m.cedula_profesional as string}
                    {m.cpa_sitpv ? ` · CPA del SITPV ${m.cpa_sitpv as string}` : " · sin CPA del SITPV capturado"}
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-n-800">Folios de receta</h3>
                  {suyos.length === 0 ? (
                    <p className="text-sm text-n-600">Sin bloques de folios asignados.</p>
                  ) : (
                    <ul className="mt-1 flex flex-col gap-1.5">
                      {suyos.map((b) => (
                        <li key={b.bloque_id} className="rounded-md border border-n-200 px-3 py-2 text-sm">
                          <p className="font-semibold text-n-900">
                            {b.prefijo}
                            {b.folio_desde} a {b.prefijo}
                            {b.folio_hasta}
                          </p>
                          <p className="text-n-600">
                            {b.asignados} asignados · {b.usados} usados ·{" "}
                            <span className={b.disponibles <= 5 ? "font-semibold text-ambar-oscuro" : ""}>{b.disponibles} disponibles</span> · asignado el {formatearFechaCalendario(b.asignado_el)}
                            {b.nota ? ` · ${b.nota}` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex flex-wrap items-start gap-2">
                  <Desplegable texto="Asignar folios">
                    <FormularioAccion accion={asignarFolios.bind(null, m.id as string)} textoBoton="Asignar bloque" textoExito="Bloque asignado" reiniciar>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Prefijo (opcional)" name="prefijo" ayuda="Letras que van antes del número, si el bloque las trae." />
                        <div />
                        <Field label="Primer folio" name="desde" type="number" min="0" required />
                        <Field label="Último folio" name="hasta" type="number" min="0" required />
                        <Field label="Ya usados (si el bloque ya venía empezado)" name="usados_previos" type="number" min="0" defaultValue="0" />
                        <Field label="Nota (opcional)" name="nota" />
                      </div>
                    </FormularioAccion>
                  </Desplegable>
                  <Desplegable texto="Editar datos">
                    <FormularioAccion accion={guardarMedico} textoBoton="Guardar datos">
                      <input type="hidden" name="profile_id" value={m.profile_id as string} />
                      <Field label="Cédula profesional" name="cedula" defaultValue={m.cedula_profesional as string} required />
                      <Field label="CPA del SITPV (opcional)" name="cpa" defaultValue={(m.cpa_sitpv as string | null) ?? ""} />
                    </FormularioAccion>
                  </Desplegable>
                  <Desplegable texto="Quitar designación" variante="peligro">
                    <p className="text-sm text-n-700">Deja de ser médico veterinario. Sus folios y los que ya usó se conservan.</p>
                    <BotonAccion accion={quitarMedico.bind(null, m.id as string)} texto="Sí, quitar designación" variante="peligro" />
                  </Desplegable>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Designar a un médico</h2>
        <p className="text-sm text-n-600">Solo se designa a personal que ya tiene cuenta en este negocio. Si falta alguien, invítalo primero en Administración → Personal.</p>
        {candidatos.length === 0 ? (
          <p className="text-sm text-n-700">Todo el personal ya está designado.</p>
        ) : (
          <FormularioAccion accion={guardarMedico} textoBoton="Designar médico" textoExito="Médico designado" reiniciar>
            <Select label="Persona del personal" name="profile_id" defaultValue="" required>
              <option value="">Elige a una persona</option>
              {candidatos.map((p) => (
                <option key={p.profile_id as string} value={p.profile_id as string}>
                  {nombreDe(p.profiles)}
                </option>
              ))}
            </Select>
            <Field label="Cédula profesional" name="cedula" required />
            <Field label="CPA del SITPV (opcional)" name="cpa" />
          </FormularioAccion>
        )}
      </section>
    </div>
  );
}
