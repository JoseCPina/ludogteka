import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { hoyNegocio } from "@/lib/formato";
import { FormularioAccion } from "@/components/formulario-accion";
import { CamposEmpleado, type CuentaLigable } from "../campos-empleado";
import { crearEmpleado } from "../empleados-actions";
import { zonaActual } from "@/lib/negocio/actual";

export default async function NuevoEmpleadoPage() {
  const zona = await zonaActual();
  const sesion = await obtenerSesionConRol();
  if (!tienePermiso(sesion, "nomina")) redirect("/empleados");
  const supabase = await createSupabaseServerClient();
  const { data: cuentas } = await supabase.rpc("cuentas_para_empleado");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/empleados" className="text-sm font-semibold text-morado hover:underline">
          ← Empleados
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Nuevo empleado</h1>
        <p className="mt-1 text-n-600">
          Después de darlo de alta capturas su horario y cómo se le paga, en su ficha.
        </p>
      </div>
      <FormularioAccion accion={crearEmpleado} textoBoton="Dar de alta">
        <CamposEmpleado cuentas={(cuentas ?? []) as CuentaLigable[]} valores={{ fecha_ingreso: hoyNegocio(zona) }} />
      </FormularioAccion>
    </div>
  );
}
