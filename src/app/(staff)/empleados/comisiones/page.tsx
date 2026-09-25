import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { moneda } from "@/lib/empleados/textos";
import { SubnavEmpleados } from "../subnav";
import { BotonAccion, FormularioAccion } from "@/components/formulario-accion";
import { guardarComision, quitarComision } from "../nomina-actions";

// Reglas de comisión por servicio de estética. La comisión sale sola de
// cada cita finalizada: primero la regla del servicio para ese estilista,
// si no la de todos, y si no la comisión por omisión de su esquema.
export default async function ComisionesPage() {
  const sesion = await obtenerSesionConRol();
  if (!tienePermiso(sesion, "nomina")) redirect("/empleados");
  const supabase = await createSupabaseServerClient();
  const [{ data: servicios }, { data: reglas }, { data: empleados }, { count: porAprobar }] = await Promise.all([
    supabase.from("servicios_cotizables").select("id, nombre").eq("categoria", "estetica").order("orden"),
    supabase.from("comisiones_servicio").select("id, servicio_id, empleado_id, tipo, valor").is("deleted_at", null),
    supabase.from("empleados").select("id, nombre, profile_id").is("deleted_at", null).is("fecha_baja", null).order("nombre"),
    supabase.from("ausencias").select("id", { count: "exact", head: true }).eq("estado", "solicitada").is("deleted_at", null),
  ]);
  const nombre = new Map((empleados ?? []).map((e) => [e.id, e.nombre]));
  const valor = (r: { tipo: string; valor: number }) => (r.tipo === "porcentaje" ? `${Number(r.valor)}% del precio` : `${moneda(r.valor)} fijo`);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Empleados</h1>
        <p className="mt-1 max-w-3xl text-n-600">
          La comisión sale sola de cada cita de estética finalizada, según quién la atendió. Primero cuenta la regla del servicio
          para ese estilista; si no hay, la regla del servicio para todos; y si tampoco, la comisión por omisión de su esquema de
          pago. Solo gana comisión quien tiene activada la comisión en su esquema.
        </p>
      </div>
      <SubnavEmpleados activa="comisiones" puedeNomina ausenciasPorAprobar={porAprobar ?? 0} />

      <ul className="divide-y divide-n-200 rounded-lg border border-n-200 bg-white">
        {(servicios ?? []).map((s) => {
          const suyas = (reglas ?? []).filter((r) => r.servicio_id === s.id);
          return (
            <li key={s.id} className="flex flex-col gap-2 px-4 py-3">
              <p className="font-semibold text-n-900">{s.nombre}</p>
              {suyas.length === 0 ? (
                <p className="text-sm text-n-500">Sin regla propia: usa la comisión por omisión de cada estilista.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {suyas.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-3">
                      <span className="text-n-800">
                        {r.empleado_id ? nombre.get(r.empleado_id) ?? "Estilista" : "Todos"}: {valor(r)}
                      </span>
                      <BotonAccion accion={quitarComision.bind(null, r.id)} texto="Quitar" variante="secundario" textoExito="Quitada" />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <section className="flex flex-col gap-3 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Agregar o cambiar una regla</h2>
        <p className="text-sm text-n-600">Si ya hay una regla para ese servicio y esa persona (o para todos), se reemplaza.</p>
        <FormularioAccion accion={guardarComision} textoBoton="Guardar regla" reiniciar>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Servicio" name="servicio_id" required defaultValue="">
              <option value="" disabled>
                Elige
              </option>
              {(servicios ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
            <Select label="Para quién" name="empleado_id" defaultValue="">
              <option value="">Todos los estilistas</option>
              {(empleados ?? [])
                .filter((e) => e.profile_id)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
            </Select>
            <Select label="Tipo" name="tipo" defaultValue="porcentaje">
              <option value="porcentaje">Porcentaje del precio</option>
              <option value="monto">Monto fijo por servicio</option>
            </Select>
            <Field label="Cuánto (% o $)" name="valor" type="number" step="0.01" min="0" required />
          </div>
        </FormularioAccion>
      </section>
    </div>
  );
}
