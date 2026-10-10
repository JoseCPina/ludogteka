import { createSupabaseServerClient } from "@/lib/supabase/server";
import { zonaActual } from "@/lib/negocio/actual";
import { hoyNegocio } from "@/lib/formato";
import { EstablecimientoForm, type MedicoOpcion, type PermisoEst } from "./establecimiento-form";

// Sección «Establecimiento veterinario» de Administración → Perfil. Solo se
// monta con el módulo veterinaria activo (lo decide la página).
export async function Establecimiento() {
  const supabase = await createSupabaseServerClient();
  const zona = await zonaActual();
  const [{ data: est }, { data: permisos }, { data: medicos }] = await Promise.all([
    supabase
      .from("negocio_establecimiento")
      .select("aviso_funcionamiento_senasica, aviso_funcionamiento_fecha, mvra_medico_id, mvra_nombre, mvra_cedula, notas")
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("establecimiento_permisos")
      .select("id, tipo, numero, autoridad, nivel, emision, vencimiento, aviso_dias, notas")
      .is("deleted_at", null),
    supabase.from("medicos_veterinarios").select("id, profile_id, cedula_profesional").is("deleted_at", null),
  ]);

  // Nombres de los médicos designados (si la cuenta no puede leerlos, se
  // muestra la cédula).
  const ids = (medicos ?? []).map((m) => m.profile_id as string);
  const { data: perfiles } = ids.length
    ? await supabase.from("profiles").select("id, nombre_completo").in("id", ids)
    : { data: [] as { id: string; nombre_completo: string | null }[] };
  const nombres = new Map((perfiles ?? []).map((p) => [p.id as string, (p.nombre_completo as string | null) ?? null]));
  const opciones: MedicoOpcion[] = (medicos ?? []).map((m) => ({
    id: m.id as string,
    nombre: nombres.get(m.profile_id as string) ?? "Médico designado",
    cedula: m.cedula_profesional as string,
  }));

  const lista: PermisoEst[] = (permisos ?? []).map((p) => ({
    id: p.id as string,
    tipo: p.tipo as string,
    numero: (p.numero as string | null) ?? "",
    autoridad: (p.autoridad as string | null) ?? "",
    nivel: p.nivel as string,
    emision: (p.emision as string | null) ?? "",
    vencimiento: (p.vencimiento as string | null) ?? "",
    avisoDias: p.aviso_dias as number,
    notas: (p.notas as string | null) ?? "",
  }));

  return (
    <EstablecimientoForm
      hoy={hoyNegocio(zona)}
      aviso={(est?.aviso_funcionamiento_senasica as string | null) ?? ""}
      avisoFecha={(est?.aviso_funcionamiento_fecha as string | null) ?? ""}
      medicoId={(est?.mvra_medico_id as string | null) ?? ""}
      mvraNombre={(est?.mvra_nombre as string | null) ?? ""}
      mvraCedula={(est?.mvra_cedula as string | null) ?? ""}
      notas={(est?.notas as string | null) ?? ""}
      medicos={opciones}
      permisos={lista}
    />
  );
}
