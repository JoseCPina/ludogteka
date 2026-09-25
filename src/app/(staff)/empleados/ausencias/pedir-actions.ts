"use server";

import { solicitarAusencia } from "../ausencias-actions";
import type { ResultadoAccion } from "@/lib/empleados/tipos";

// El formulario de la pestaña trae al empleado en un campo.
export async function solicitarAusenciaPor(fd: FormData): Promise<ResultadoAccion> {
  const empleado = String(fd.get("empleado_id") ?? "");
  if (!empleado) return { error: "Elige a quién." };
  return solicitarAusencia(empleado, fd);
}
