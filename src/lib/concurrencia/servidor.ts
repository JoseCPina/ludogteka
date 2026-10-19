// Lado servidor del control de concurrencia: pone en la petición a la base la versión que la pantalla leyó.
// Uso: `await conControl(supabase.from("x").update({...}).eq("id", id), control)` o con `.rpc(...)`.
import { ENCABEZADO_FORZAR, ENCABEZADO_VERSION, valorEncabezado, type ControlVersion } from "./tipos";

type ConEncabezado = { setHeader(nombre: string, valor: string): unknown };

export function conControl<B extends ConEncabezado>(b: B, control?: ControlVersion | null): B {
  const v = valorEncabezado(control);
  if (v) b.setHeader(ENCABEZADO_VERSION, v);
  if (control?.forzar) b.setHeader(ENCABEZADO_FORZAR, "1");
  return b;
}

/** Para formularios con FormData: campos ocultos `__version` (JSON de VersionLeida[]) y `__forzar`. */
export function controlDeFormulario(fd: FormData): ControlVersion {
  let versiones: ControlVersion["versiones"] = [];
  try {
    const t = fd.get("__version");
    versiones = typeof t === "string" && t ? JSON.parse(t) : [];
  } catch {
    versiones = [];
  }
  return { versiones, forzar: fd.get("__forzar") === "1" };
}
