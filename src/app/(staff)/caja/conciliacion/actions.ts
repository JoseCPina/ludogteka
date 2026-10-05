"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function darPorRevisada(id: string, nota: string): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("conciliacion_dar_por_revisada", { p_id: id, p_nota: nota });
  if (error) return { error: error.message.replace(/^.*?ERROR:\s*/, "") };
  revalidatePath("/caja/conciliacion");
  revalidatePath("/recepcion");
  return { error: null };
}
