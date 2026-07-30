"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../reservas/traducir-error";

const BUCKET = "perros-archivos";

export type EstadoBitacora = { error: string | null };

// Igual que prepararRutaContratoPapel: la ruta se calcula ANTES de subir
// nada, con un id ya fijo — bitacora_entradas no tiene política de
// UPDATE para authenticated, así que foto_path tiene que llegar ya
// resuelto en el mismo INSERT, nunca en un paso posterior.
export async function prepararEntradaBitacora(
  perroId: string
): Promise<{ entradaId: string; path: string; clienteId: string } | null> {
  const supabase = await createSupabaseServerClient();
  const { data: perro } = await supabase.from("perros").select("cliente_id").eq("id", perroId).single();
  if (!perro?.cliente_id) return null;

  const entradaId = randomUUID();
  return {
    entradaId,
    clienteId: perro.cliente_id,
    path: `${perro.cliente_id}/${perroId}/bitacora/${entradaId}.jpg`,
  };
}

export async function crearEntradaBitacora(datos: {
  entradaId: string;
  perroId: string;
  tipo: "actualizacion" | "incidencia";
  nota: string;
  fotoPath: string | null;
}): Promise<EstadoBitacora> {
  if (!datos.nota.trim() && !datos.fotoPath) {
    return { error: "Escribe una nota o sube una foto." };
  }
  if (datos.tipo === "incidencia" && !datos.nota.trim()) {
    return { error: "Una incidencia necesita una descripción." };
  }

  const supabase = await createSupabaseServerClient();

  // Si el perro está actualmente en una estancia en curso, la entrada
  // se liga sola — no hace falta que el staff la busque a mano cada vez.
  const { data: estanciaActual } = await supabase
    .from("estancias")
    .select("id")
    .eq("perro_id", datos.perroId)
    .eq("estado", "en_curso")
    .is("deleted_at", null)
    .maybeSingle();

  const { error } = await supabase.from("bitacora_entradas").insert({
    id: datos.entradaId,
    perro_id: datos.perroId,
    estancia_id: estanciaActual?.id ?? null,
    tipo: datos.tipo,
    nota: nullSiVacio(datos.nota),
    foto_path: datos.fotoPath,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath(`/perros/${datos.perroId}`);
  return { error: null };
}

function nullSiVacio(texto: string): string | null {
  const limpio = texto.trim();
  return limpio ? limpio : null;
}

export async function marcarBitacoraNotificada(entradaId: string, perroId: string): Promise<EstadoBitacora> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("marcar_bitacora_notificada", { p_entrada_id: entradaId });
  if (error) return { error: traducirError(error) };

  revalidatePath(`/perros/${perroId}`);
  return { error: null };
}

// Galón asumido... no, aquí: 52 + 10 dígitos es el formato que wa.me
// espera para México en la práctica actual — no confirmado con un envío
// real, anotado a propósito (mismo criterio que el galón en Fase 7).
export async function construirEnlaceWhatsApp(
  entradaId: string
): Promise<{ url: string | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();

  const { data: entrada } = await supabase
    .from("bitacora_entradas")
    .select("nota, tipo, perro_id, perros(nombre, cliente_id, clientes(nombre, telefono))")
    .eq("id", entradaId)
    .single();

  if (!entrada) return { url: null, error: "No encontramos esta entrada de bitácora." };

  const perro = entrada.perros as unknown as {
    nombre: string;
    cliente_id: string;
    clientes: { nombre: string; telefono: string } | null;
  } | null;
  const cliente = perro?.clientes;

  if (!cliente?.telefono) {
    return { url: null, error: "Este cliente no tiene teléfono registrado." };
  }

  const hdrs = await headers();
  const host = hdrs.get("host");
  const protocolo = hdrs.get("x-forwarded-proto") || "https";
  const urlPortal = host ? `${protocolo}://${host}/portal/perros/${entrada.perro_id}` : "";

  const saludo = entrada.tipo === "incidencia" ? "Te avisamos sobre" : "Te compartimos una actualización de";
  const mensaje =
    `Hola ${cliente.nombre}, ${saludo} ${perro?.nombre ?? "tu perro"} en Ludogteka` +
    (entrada.nota ? `: ${entrada.nota}.` : ".") +
    (urlPortal ? ` Puedes ver las fotos en tu portal: ${urlPortal}` : "");

  const telefono = `52${cliente.telefono.replace(/\D/g, "")}`;
  return { url: `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`, error: null };
}
