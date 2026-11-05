"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../../reservas/traducir-error";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

export type LineaVenta = { insumoId: string | null; concepto: string; precio: number | null; cantidad: number };
export type ResultadoVenta = { error: string | null; reservaId?: string; registros?: RegistroFinal[] };

// La venta de mostrador: la base arma la cuenta (de la persona o de
// «Público en general»), descuenta el inventario y devuelve la cuenta para
// cobrarla en la pantalla de cobro de siempre.
export async function crearVentaRapida(clienteId: string | null, lineas: LineaVenta[], notas: string): Promise<ResultadoVenta> {
  if (lineas.length === 0) return { error: "Agrega al menos un producto o concepto." };
  for (const l of lineas) {
    if (!Number.isFinite(l.cantidad) || l.cantidad <= 0) return { error: "Cada renglón necesita una cantidad mayor a cero." };
    if (!l.insumoId) {
      if (!l.concepto.trim()) return { error: "Escribe qué se vende en cada renglón." };
      if (!l.precio || !Number.isFinite(l.precio) || l.precio <= 0) return { error: "Cada concepto necesita un precio mayor a cero." };
    }
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("crear_venta_mostrador", {
    p_cliente_id: clienteId,
    p_lineas: lineas.map((l) => (l.insumoId ? { insumo_id: l.insumoId, cantidad: l.cantidad } : { concepto: l.concepto.trim(), precio: l.precio, cantidad: l.cantidad })),
    p_notas: notas,
  });
  if (error) return { error: traducirError(error) };
  return { error: null, reservaId: data as string, registros: await registrosDe(supabase, [{ t: "reservas", i: data as string }]) };
}

/** Pases vigentes con saldo de un cliente (por perro), para avisar antes de vender una guardería como concepto suelto. */
export type PaseVigente = { perro: string; nombre: string; restantes: number; total: number; ilimitado: boolean; vence: string | null; incluye: string | null };

export async function pasesVigentesDeCliente(clienteId: string): Promise<PaseVigente[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("bonos_clientes_estado")
    .select("perro_nombre, servicio_nombre, servicio_incluido_nombre, cantidad_total, cantidad_disponible, ilimitado, fecha_vencimiento")
    .eq("cliente_id", clienteId)
    .eq("estado", "activo")
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false });
  return (data ?? []).map((b) => ({
    perro: (b.perro_nombre as string | null) ?? "Mascota",
    nombre: b.servicio_nombre as string,
    incluye: (b.servicio_incluido_nombre as string | null) ?? null,
    restantes: Number(b.cantidad_disponible ?? 0),
    total: Number(b.cantidad_total ?? 0),
    ilimitado: Boolean(b.ilimitado),
    vence: (b.fecha_vencimiento as string | null) ?? null,
  }));
}

export async function cancelarRenglonVenta(ventaId: string, reservaId: string, motivo: string): Promise<{ error: string | null; registros?: RegistroFinal[] }> {
  if (!motivo.trim()) return { error: "Escribe por qué se cancela." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancelar_venta_mostrador", { p_venta_id: ventaId, p_motivo: motivo.trim() });
  if (error) return { error: traducirError(error) };
  return { error: null, registros: await registrosDe(supabase, [{ t: "ventas_mostrador", i: ventaId }, { t: "reservas", i: reservaId }]) };
}
