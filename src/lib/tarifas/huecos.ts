import type { SupabaseClient } from "@supabase/supabase-js";
import { contarSinTarifa, type CeldaVigente } from "@/lib/tarifas/matriz";
import { leerTodo } from "@/lib/supabase/paginar";
import type { ClaveModulo } from "@/lib/plan/modulos";

export type ServicioConHuecos = { id: string; nombre: string; faltan: number };

/**
 * De qué módulo es un servicio. `null` = de ninguno en particular (siempre cuenta).
 * Un servicio de un módulo apagado no se cobra ni se ofrece, así que sus precios
 * vacíos no son «precios sin capturar».
 */
export function moduloDeServicio(s: { categoria: string; unidad?: string | null }): ClaveModulo | null {
  switch (s.categoria) {
    case "guarderia":
      return "guarderia";
    case "hotel":
      return "hotel";
    case "estetica":
      return "estetica";
    case "veterinaria":
      return "veterinaria";
    case "bono":
      return "bonos";
    case "cargo":
      return s.unidad === "km" ? "recoleccion" : null;
    default:
      return null;
  }
}

/** ¿El servicio es de un módulo que el negocio tiene prendido? */
export function servicioActivo(s: { categoria: string; unidad?: string | null }, modulos: readonly string[]): boolean {
  const m = moduloDeServicio(s);
  return m === null || modulos.includes(m);
}

type FilaServicio = {
  id: string;
  nombre: string;
  categoria: string;
  unidad: string | null;
  depende_grupo_raza: boolean;
  depende_tamano: boolean;
  depende_pelaje: boolean;
  depende_cantidad: boolean;
  monto_libre: boolean;
};

/**
 * Los servicios vivos, de módulos prendidos, con celdas de precio sin capturar. La misma cuenta
 * para el panel de admin, la lista de Servicios y el checklist de bienvenida: si cada pantalla
 * contara por su lado, una diría «todo listo» mientras otra avisa de huecos.
 */
export async function cargarServiciosConHuecos(supabase: SupabaseClient, modulos: readonly string[]): Promise<ServicioConHuecos[]> {
  // Con Veterinaria prendida sus cuatro servicios tienen que existir para que «Precios sin capturar» y la bienvenida los cuenten.
  if (modulos.includes("veterinaria")) await supabase.rpc("vet_asegurar_servicios");
  const [{ data: servicios }, { data: grupos }, { data: tamanos }, { data: pelajes }, { data: vigentes }] = await Promise.all([
    supabase
      .from("servicios")
      .select("id, nombre, categoria, unidad, depende_grupo_raza, depende_tamano, depende_pelaje, depende_cantidad, monto_libre")
      .is("deleted_at", null)
      // Un cargo de monto libre no tiene celda que capturar: el importe se pone al aplicarlo.
      .eq("monto_libre", false)
      .order("orden"),
    supabase.from("grupos_raza").select("id, nombre, depende_tamano, depende_pelaje").is("deleted_at", null).order("orden"),
    supabase.from("tamanos_categoria").select("id, etiqueta").is("deleted_at", null).order("orden"),
    supabase.from("tipos_pelaje").select("id, etiqueta, clave").is("deleted_at", null).order("orden"),
    leerTodo<CeldaVigente & { servicio_id: string }>(() =>
      supabase
        .from("tarifas_vigentes")
        .select("servicio_id, grupo_raza_id, tamano_id, pelaje_id, cantidad_desde, cantidad_hasta, precio, no_aplica")
        .order("servicio_id").order("grupo_raza_id").order("tamano_id").order("pelaje_id").order("cantidad_desde")
    ),
  ]);
  const catalogos = { grupos: grupos ?? [], tamanos: tamanos ?? [], pelajes: pelajes ?? [] };
  const porServicio = new Map<string, CeldaVigente[]>();
  for (const v of vigentes ?? []) {
    const lista = porServicio.get(v.servicio_id) ?? [];
    lista.push(v);
    porServicio.set(v.servicio_id, lista);
  }
  return ((servicios ?? []) as FilaServicio[])
    .filter((s) => servicioActivo(s, modulos))
    .map((s) => ({ id: s.id, nombre: s.nombre, faltan: contarSinTarifa(s, catalogos, porServicio.get(s.id) ?? []) }))
    .filter((s) => s.faltan > 0);
}
