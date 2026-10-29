import Link from "next/link";
import { EnlaceOTexto } from "@/components/acceso-contexto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { FormularioAccion } from "@/components/formulario-accion";
import { Textarea } from "@/components/ui/textarea";
import { TIPOS_CITA, type TipoCitaConfig } from "@/lib/veterinaria/expediente";
import { guardarAjustesVeterinaria, guardarDictadoAjustes, guardarTeleconsultaAjustes } from "../carnet/actions";
import { guardarEspejoAntimicrobianos } from "../recetas/actions";
import { guardarPlantillaConsulta, guardarPortalExpediente, guardarTipoCita } from "../expediente/actions";

export default async function AjustesVeterinaria() {
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const puede = tienePermiso(sesion, "configuracion_negocio");
  const [{ data }, { data: filaAjustes }] = await Promise.all([
    supabase.rpc("veterinaria_ajustes_actuales"),
    supabase.from("veterinaria_ajustes").select("negocio_id, updated_at").maybeSingle(),
  ]);
  // QA N43: la versión que esta pantalla leyó de los ajustes (una fila por negocio).
  const versionAjustes = filaAjustes ? [{ t: "veterinaria_ajustes", i: filaAjustes.negocio_id as string, v: filaAjustes.updated_at as string }] : [];
  const [{ data: tiposCrudo }, { data: plantillasCrudo }] = await Promise.all([supabase.rpc("vet_tipos_cita_lista"), supabase.rpc("vet_plantillas_consulta")]);
  const tipos = (tiposCrudo ?? []) as TipoCitaConfig[];
  const plantillas = (plantillasCrudo ?? {}) as Record<string, { version: number; texto: Record<string, string> }>;
  const a = (data ?? {}) as { portal_expediente?: boolean; recordatorios_activos?: boolean; dias_anticipacion?: number; certificado_vigencia_dias?: number; carnet_reemplaza_comprobante?: boolean; hospitalizacion_precio_dia?: number | null; espejo_antimicrobianos?: boolean; dictado_conservar_audio?: boolean; teleconsulta_cobro_anticipado?: boolean; teleconsulta_precio?: number | null };

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Link href="/veterinaria" className="text-sm font-semibold text-morado hover:underline">← Veterinaria</Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Ajustes de Veterinaria</h1>
        <p className="mt-1 text-n-600">Recordatorios, certificados, carnet, hospitalización, agenda y expediente.</p>
      </div>
      {!puede && <Alert variante="advertencia" titulo="Solo consulta">Cambiar estos ajustes es de admin o de quien tenga «Configuración del negocio».</Alert>}
      <FormularioAccion accion={guardarAjustesVeterinaria} textoBoton="Guardar ajustes" versiones={versionAjustes} registro="los ajustes de Veterinaria" className="rounded-lg border border-n-200 bg-white p-5">
        <fieldset disabled={!puede} className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-n-900">Recordatorios de próxima dosis</h2>
          {/* El envío automático vive en Recordatorios por WhatsApp (recordatorios_ajustes.vacuna); este valor ya no decide nada. */}
          <input type="hidden" name="recordatorios_activos" value={a.recordatorios_activos ? "si" : "no"} />
          <p className="text-sm text-n-700" data-recordatorio-vacuna-config>
            El recordatorio por WhatsApp de la próxima vacuna o desparasitación sale solo, 7 días antes, si lo prendes en{" "}
            <EnlaceOTexto href="/admin/recordatorios" className="font-semibold text-morado underline">Recordatorios por WhatsApp</EnlaceOTexto>. El dueño contesta «Agendar» o «Después».
          </p>
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
        <h2 className="text-lg font-bold text-n-900">Dictado por voz</h2>
        <p className="text-n-700">El audio se transcribe y se borra al terminar. Si prefieres conservarlo para poder volver a escucharlo, queda ligado a la consulta 30 días y se avisa en pantalla antes de grabar.</p>
        <FormularioAccion accion={guardarDictadoAjustes} textoBoton="Guardar" className="max-w-xl">
          <fieldset disabled={!puede}>
            <Select label="Conservar el audio" name="conservar" defaultValue={a.dictado_conservar_audio ? "si" : "no"} ayuda="Apagado por omisión: el audio se borra en cuanto se transcribe.">
              <option value="no">No: se borra al transcribir</option>
              <option value="si">Sí: conservarlo 30 días</option>
            </Select>
          </fieldset>
        </FormularioAccion>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Teleconsulta</h2>
        <p className="text-n-700">Si cobras por adelantado, la sala solo abre cuando la teleconsulta está pagada (con la liga de pago de la terminal que ya usas).</p>
        <FormularioAccion accion={guardarTeleconsultaAjustes} textoBoton="Guardar" className="max-w-xl">
          <fieldset disabled={!puede} className="flex flex-col gap-3">
            <Select label="Cobro anticipado" name="cobro" defaultValue={a.teleconsulta_cobro_anticipado ? "si" : "no"}>
              <option value="no">No: se cobra después, como siempre</option>
              <option value="si">Sí: pagar antes de entrar a la sala</option>
            </Select>
            <Field label="Precio de la teleconsulta" name="precio" type="number" min={0} step="0.01" defaultValue={a.teleconsulta_precio ?? ""} />
          </fieldset>
        </FormularioAccion>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Recetas y controlados</h2>
        <p className="text-n-700">Los antimicrobianos son Grupo II y piden receta simple. El SITPV permite llevar además un registro cuantificado; si prefieres llevarlo, actívalo: entonces piden folio del SITPV, candado de salida y libro de control igual que el Grupo I.</p>
        <FormularioAccion accion={guardarEspejoAntimicrobianos} textoBoton="Guardar" className="max-w-xl">
          <fieldset disabled={!puede}>
            <Select label="Espejo cuantificado de antimicrobianos" name="espejo" defaultValue={a.espejo_antimicrobianos ? "si" : "no"} ayuda="Apagado por omisión. Al prenderlo, los antimicrobianos del inventario clínico solo salen contra un folio registrado.">
              <option value="no">No: receta simple</option>
              <option value="si">Sí: llevar espejo cuantificado</option>
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
