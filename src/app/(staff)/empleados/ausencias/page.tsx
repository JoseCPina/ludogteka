import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { Select } from "@/components/ui/select";
import { hoyNegocio } from "@/lib/formato";
import { SubnavEmpleados } from "../subnav";
import { COLUMNAS_AUSENCIA, ListaAusencias, type Ausencia } from "../ausencias-lista";
import { FormularioAccion } from "../formulario-accion";
import { solicitarAusenciaPor } from "./pedir-actions";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { TIPOS_AUSENCIA } from "@/lib/empleados/textos";

// Las que esperan aprobación primero (de la más vieja a la más nueva), y
// abajo las próximas y recientes.
export default async function AusenciasPage() {
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const esAdmin = sesion?.rol === "admin";
  const puedeNomina = tienePermiso(sesion, "nomina");
  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio();

  const [{ data: porAprobar }, { data: resto }, { data: empleados }] = await Promise.all([
    supabase.from("ausencias").select(COLUMNAS_AUSENCIA).eq("estado", "solicitada").is("deleted_at", null).order("created_at"),
    supabase.from("ausencias").select(COLUMNAS_AUSENCIA).neq("estado", "solicitada").is("deleted_at", null).order("desde", { ascending: false }).limit(40),
    supabase.from("empleados").select("id, nombre, profile_id, fecha_baja").is("deleted_at", null).order("nombre"),
  ]);
  // Recepción pide por quien no tiene cuenta; admin, por cualquiera.
  const porQuienPuedePedir = (empleados ?? []).filter(
    (e) => (!e.fecha_baja || e.fecha_baja >= hoy) && (esAdmin || (sesion?.rol === "recepcion" && !e.profile_id))
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Empleados</h1>
        <p className="mt-1 text-n-600">Las ausencias las aprueba un admin. Aprobar vacaciones descuenta del saldo de la persona.</p>
      </div>
      <SubnavEmpleados activa="ausencias" puedeNomina={puedeNomina} ausenciasPorAprobar={(porAprobar ?? []).length} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Por aprobar</h2>
        <ListaAusencias
          ausencias={(porAprobar ?? []) as unknown as Ausencia[]}
          esAdmin={esAdmin}
          puedeCancelarSolicitadas={false}
          mostrarNombre
          vacio="No hay solicitudes pendientes."
        />
      </section>

      {porQuienPuedePedir.length > 0 && (
        <section className="flex flex-col gap-3 border-t border-n-200 pt-6">
          <h2 className="text-lg font-bold text-n-900">Pedir una ausencia por alguien</h2>
          <p className="text-sm text-n-600">
            {esAdmin ? "Para cualquier empleado." : "Para quien no tiene cuenta en la app; quien sí la tiene la pide desde Mi asistencia."}
          </p>
          <FormularioAccion accion={solicitarAusenciaPor} textoBoton="Pedir ausencia" textoExito="Solicitud registrada: queda por aprobar" reiniciar>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Empleado" name="empleado_id" required defaultValue="">
                <option value="" disabled>
                  Elige
                </option>
                {porQuienPuedePedir.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </Select>
              <Select label="Tipo" name="tipo" defaultValue="vacaciones" required>
                {Object.entries(TIPOS_AUSENCIA).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
              <Field label="Desde" name="desde" type="date" defaultValue={hoy} required />
              <Field label="Hasta (incluido)" name="hasta" type="date" ayuda="Vacío si es un solo día." />
            </div>
            <Textarea label="Motivo (opcional)" name="motivo" rows={2} />
          </FormularioAccion>
        </section>
      )}

      <section className="flex flex-col gap-3 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Aprobadas y resueltas</h2>
        <ListaAusencias
          ausencias={(resto ?? []) as unknown as Ausencia[]}
          esAdmin={esAdmin}
          puedeCancelarSolicitadas={false}
          mostrarNombre
          vacio="Todavía no hay ausencias resueltas."
        />
      </section>
    </div>
  );
}
