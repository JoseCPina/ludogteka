import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { FormularioAccion } from "@/components/formulario-accion";
import { guardarAjustesVeterinaria } from "../carnet/actions";

export default async function AjustesVeterinaria() {
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const puede = tienePermiso(sesion, "configuracion_negocio");
  const { data } = await supabase.rpc("veterinaria_ajustes_actuales");
  const a = (data ?? {}) as { recordatorios_activos?: boolean; dias_anticipacion?: number; certificado_vigencia_dias?: number; carnet_reemplaza_comprobante?: boolean; hospitalizacion_precio_dia?: number | null };

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <Link href="/veterinaria" className="text-sm font-semibold text-morado hover:underline">← Veterinaria</Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Ajustes de Veterinaria</h1>
        <p className="mt-1 text-n-600">Recordatorios, certificados, carnet y hospitalización.</p>
      </div>
      {!puede && <Alert variante="advertencia" titulo="Solo consulta">Cambiar estos ajustes es de admin o de quien tenga «Configuración del negocio».</Alert>}
      <FormularioAccion accion={guardarAjustesVeterinaria} textoBoton="Guardar ajustes" className="rounded-lg border border-n-200 bg-white p-5">
        <fieldset disabled={!puede} className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-n-900">Recordatorios de próxima dosis</h2>
          <Select label="Envío automático por WhatsApp" name="recordatorios_activos" defaultValue={a.recordatorios_activos ? "si" : "no"} ayuda="Apagado: la lista de Recordatorios es para mandarlos tú a mano. Prendido: la plantilla aprobada de WhatsApp sale sola a los dueños con teléfono, una sola vez por dosis.">
            <option value="no">Apagado</option>
            <option value="si">Prendido</option>
          </Select>
          <Field label="Días de anticipación" name="dias_anticipacion" type="number" min={0} max={60} defaultValue={a.dias_anticipacion ?? 7} ayuda="Cuántos días antes de la próxima dosis se avisa." />
          <h2 className="mt-2 text-lg font-bold text-n-900">Certificados de salud</h2>
          <Field label="Vigencia en días" name="certificado_vigencia_dias" type="number" min={1} max={365} defaultValue={a.certificado_vigencia_dias ?? 30} />
          <h2 className="mt-2 text-lg font-bold text-n-900">Carnet y check-in</h2>
          <Select label="El carnet cuenta como comprobante de vacunas" name="carnet_reemplaza_comprobante" defaultValue={a.carnet_reemplaza_comprobante ? "si" : "no"} ayuda="Si lo prendes, una vacuna del carnet ligada a un requisito (antirrábica, etc.) cubre ese requisito en el check-in de Hotel y Guardería, sin que nadie suba el documento. Solo cuenta lo que se registre a partir de ahora.">
            <option value="no">No: sigue pidiendo el comprobante</option>
            <option value="si">Sí: el carnet lo reemplaza</option>
          </Select>
          <h2 className="mt-2 text-lg font-bold text-n-900">Hospitalización</h2>
          <Field label="Precio de un día de hospitalización" name="precio_dia" type="number" min={0} step="0.01" defaultValue={a.hospitalizacion_precio_dia ?? ""} ayuda="Se cobra un día por cada fecha desde el ingreso. Vacío = no se cobra el día solo (puedes ponerlo en cada ingreso)." />
        </fieldset>
      </FormularioAccion>
    </div>
  );
}
