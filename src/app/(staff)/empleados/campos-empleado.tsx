import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type CuentaLigable = { id: string; nombre_completo: string | null; rol: string; email: string; empleado_id: string | null };

const ROL: Record<string, string> = { admin: "Admin", recepcion: "Recepción", estetica: "Estética" };

// Los campos de un empleado. La cuenta de la app es opcional: limpieza o
// el chofer trabajan ahí sin usarla.
export function CamposEmpleado({
  valores,
  cuentas,
  empleadoId,
}: {
  valores?: Partial<Record<string, string | null>>;
  cuentas: CuentaLigable[];
  empleadoId?: string;
}) {
  const v = (k: string) => valores?.[k] ?? "";
  const libres = cuentas.filter((c) => !c.empleado_id || c.empleado_id === empleadoId);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" name="nombre" defaultValue={v("nombre")} required />
        <Field label="Puesto" name="puesto" defaultValue={v("puesto")} placeholder="Estilista, limpieza, chofer…" required />
        <Field label="Fecha de ingreso" name="fecha_ingreso" type="date" defaultValue={v("fecha_ingreso")} required />
        <Field label="Teléfono (opcional)" name="telefono" type="tel" defaultValue={v("telefono")} />
      </div>
      <fieldset className="grid gap-4 rounded-md border border-n-200 p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold text-n-800">Contacto de emergencia (opcional)</legend>
        <Field label="Nombre" name="emergencia_nombre" defaultValue={v("emergencia_nombre")} />
        <Field label="Teléfono" name="emergencia_telefono" type="tel" defaultValue={v("emergencia_telefono")} />
        <Field label="Parentesco" name="emergencia_parentesco" defaultValue={v("emergencia_parentesco")} />
      </fieldset>
      <Select
        label="Cuenta en la app (opcional)"
        name="profile_id"
        defaultValue={v("profile_id")}
        ayuda="Si la tiene, registra su entrada y salida desde su cuenta y ve su asistencia, sus ausencias y sus pagos. Si no, recepción le registra la asistencia."
      >
        <option value="">No usa la app</option>
        {libres.map((c) => (
          <option key={c.id} value={c.id}>
            {(c.nombre_completo ?? c.email) + ` · ${ROL[c.rol] ?? c.rol}`}
          </option>
        ))}
      </Select>
      <Textarea label="Notas (opcional)" name="notas" defaultValue={v("notas")} rows={2} />
    </div>
  );
}
