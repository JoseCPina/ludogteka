import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { FormularioAccion } from "@/components/formulario-accion";
import { Textarea } from "@/components/ui/textarea";
import { TIPOS_CITA, type TipoCitaConfig } from "@/lib/veterinaria/expediente";
import { guardarAjustesVeterinaria } from "../carnet/actions";
import { guardarPlantillaConsulta, guardarPortalExpediente, guardarTipoCita } from "../expediente/actions";

export default async function AjustesVeterinaria() {
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const puede = tienePermiso(sesion, "configuracion_negocio");
  const { data } = await supabase.rpc("veterinaria_ajustes_actuales");
  const [{ data: tiposCrudo }, { data: plantillasCrudo }] = await Promise.all([supabase.rpc("vet_tipos_cita_lista"), supabase.rpc("vet_plantillas_consulta")]);
  const tipos = (tiposCrudo ?? []) as TipoCitaConfig[];
  const plantillas = (plantillasCrudo ?? {}) as Record<string, { version: number; texto: Record<string, string> }>;
  const a = (data ?? {}) as { portal_expediente?: boolean; recordatorios_activos?: boolean; dias_anticipacion?: number; certificado_vigencia_dias?: number; carnet_reemplaza_comprobante?: boolean; hospitalizacion_precio_dia?: number | null };

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Link href="/veterinaria" className="text-sm font-semibold text-morado hover:underline">← Veterinaria</Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Ajustes de Veterinaria</h1>
        <p className="mt-1 text-n-600">Recordatorios, certificados, carnet, hospitalización, agenda y expediente.</p>
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

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Portal del dueño</h2>
        <p className="text-n-700">Si lo prendes, el dueño ve en su portal las fechas de las consultas firmadas de su mascota, el diagnóstico definitivo y el plan. Nunca ve las notas internas, el tratamiento ni los datos de la firma.</p>
        <FormularioAccion accion={guardarPortalExpediente} textoBoton="Guardar" className="max-w-xl">
          <fieldset disabled={!puede}>
            <Select label="Mostrar las consultas en el portal" name="portal_expediente" defaultValue={a.portal_expediente ? "si" : "no"} ayuda="Apagado por omisión: cada negocio decide si lo comparte.">
              <option value="no">No: el dueño no ve el expediente</option>
              <option value="si">Sí: fecha, diagnóstico definitivo y plan</option>
            </Select>
          </fieldset>
        </FormularioAccion>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Tipos de cita y su duración</h2>
        <p className="text-n-700">La agenda clínica usa estas duraciones para que un médico no tenga dos citas encimadas.</p>
        {tipos.map((t) => (
          <FormularioAccion key={t.clave} accion={guardarTipoCita} textoBoton="Guardar" className="rounded-md border border-n-200 bg-n-50 p-3">
            <input type="hidden" name="clave" value={t.clave} />
            <fieldset disabled={!puede} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
              <Field label={`Nombre (${TIPOS_CITA[t.clave] ?? t.clave})`} name="nombre" defaultValue={t.nombre} required />
              <Field label="Duración (min)" name="duracion_min" type="number" min={5} max={480} defaultValue={t.duracion_min} required />
              <Select label="Se puede agendar" name="activo" defaultValue={t.activo ? "si" : "no"}>
                <option value="si">Sí</option>
                <option value="no">No</option>
              </Select>
            </fieldset>
          </FormularioAccion>
        ))}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Plantillas de consulta</h2>
        <p className="text-n-700">Cada tipo de consulta arranca con estos textos para guiar qué anotar. Al guardar se crea una versión nueva: las consultas ya abiertas conservan la suya.</p>
        {["consulta", "vacuna", "cirugia", "seguimiento", "urgencia"].map((clave) => {
          const pl = plantillas[clave];
          if (!pl) return null;
          return (
            <details key={clave} className="rounded-md border border-n-200 bg-n-50 p-3">
              <summary className="cursor-pointer font-semibold text-n-900">{TIPOS_CITA[clave]} <span className="font-normal text-n-500">· versión {pl.version}</span></summary>
              <FormularioAccion accion={guardarPlantillaConsulta} textoBoton="Guardar plantilla" className="mt-3">
                <input type="hidden" name="tipo" value={clave} />
                <fieldset disabled={!puede} className="flex flex-col gap-3">
                  <Textarea label="Anamnesis" name="anamnesis" rows={4} defaultValue={pl.texto.anamnesis ?? ""} />
                  <Textarea label="Examen físico" name="examen_fisico" rows={5} defaultValue={pl.texto.examen_fisico ?? ""} />
                  <Textarea label="Hallazgos" name="hallazgos" rows={2} defaultValue={pl.texto.hallazgos ?? ""} />
                  <Textarea label="Plan" name="plan" rows={3} defaultValue={pl.texto.plan ?? ""} />
                  <Textarea label="Tratamiento" name="tratamiento" rows={2} defaultValue={pl.texto.tratamiento ?? ""} />
                </fieldset>
              </FormularioAccion>
            </details>
          );
        })}
      </section>
    </div>
  );
}
