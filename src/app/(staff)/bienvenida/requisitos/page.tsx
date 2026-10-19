import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VolverBienvenida } from "../volver";
import { RequisitosHospedar, type TipoRequisito } from "./requisitos-hospedar";

// «Requisitos para hospedar» (QA S16): lo que se le pide a un perro antes de recibirlo en guardería u hotel. La base
// los hace cumplir al reservar (validar_estancia) y el expediente dice lo mismo (pendientes_para_estancia).
export default async function RequisitosPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: tipos }, { data: ajustes }] = await Promise.all([
    supabase.from("tipos_requisito_sanitario").select("id, etiqueta, categoria, obligatoria, vigencia_meses, orden").is("deleted_at", null).order("orden"),
    supabase.from("negocio_ajustes_operacion").select("exige_evaluacion_comportamiento, requisitos_revisados_at").is("deleted_at", null).maybeSingle(),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <VolverBienvenida />
        <h1 className="mt-1 text-2xl font-bold text-n-900">Requisitos para hospedar</h1>
        <p className="mt-1 text-n-600">
          Lo que le pides a un perro antes de recibirlo en guardería u hotel. Lo que dejes prendido bloquea la reserva hasta que se cumpla (un admin, o
          quien tenga «Excepciones al reservar», puede autorizar una excepción con motivo). Celo, gestación y las alertas de agresividad bloquean siempre.
        </p>
      </div>
      <RequisitosHospedar
        exigeEvaluacion={ajustes?.exige_evaluacion_comportamiento ?? true}
        revisados={Boolean(ajustes?.requisitos_revisados_at)}
        tipos={(tipos ?? []) as TipoRequisito[]}
      />
    </div>
  );
}
