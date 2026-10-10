import type { SupabaseClient } from "@supabase/supabase-js";

export type ProductoConLotes = {
  id: string;
  nombre: string;
  lotes: { id: string; codigo: string; caducidad: string | null; dosis: number }[];
};

export type MedicoOpcion = { id: string; nombre: string };

/** Productos clínicos (con lotes) que tienen existencia sin caducar, con sus lotes y cuántas dosis quedan en cada uno (unidad de consumo). */
export async function cargarProductosConLotes(supabase: SupabaseClient): Promise<ProductoConLotes[]> {
  const [{ data: productos }, { data: saldos }] = await Promise.all([
    supabase
      .from("insumos")
      .select("id, nombre, unidad_consumo:unidades_medida!unidad_consumo_id(equivalencia_en_base)")
      .eq("controla_lotes", true)
      .is("deleted_at", null)
      .order("nombre"),
    supabase.from("insumo_lotes_saldo").select("lote_id, insumo_id, codigo, fecha_caducidad, saldo, estado_caducidad").gt("saldo", 0),
  ]);
  return (productos ?? [])
    .map((p) => {
      const u = (Array.isArray(p.unidad_consumo) ? p.unidad_consumo[0] : p.unidad_consumo) as { equivalencia_en_base: number } | null;
      const eq = u ? Number(u.equivalencia_en_base) || 1 : 1;
      return {
        id: p.id as string,
        nombre: p.nombre as string,
        lotes: (saldos ?? [])
          .filter((s) => s.insumo_id === p.id && s.estado_caducidad !== "caducado")
          .map((s) => ({
            id: s.lote_id as string,
            codigo: s.codigo as string,
            caducidad: (s.fecha_caducidad as string | null) ?? null,
            dosis: Number(s.saldo) / eq,
          }))
          .sort((a, b) => (a.caducidad ?? "9999").localeCompare(b.caducidad ?? "9999")),
      };
    })
    .filter((p) => p.lotes.length > 0);
}

export async function cargarMedicos(supabase: SupabaseClient): Promise<MedicoOpcion[]> {
  const { data } = await supabase.from("medicos_veterinarios").select("id, profiles(nombre_completo)").is("deleted_at", null).order("created_at");
  return (data ?? []).map((m) => {
    const pr = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return { id: m.id as string, nombre: (pr as { nombre_completo: string | null } | null)?.nombre_completo ?? "Sin nombre" };
  });
}

/** El médico veterinario que es quien llama (o null). */
export async function miMedico(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.rpc("vet_mi_medico");
  return typeof data === "string" ? data : null;
}
