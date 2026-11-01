"use server";

import { headers } from "next/headers";
import { atencionParaEditar, editarAtencion, ofertaPara, registrarAtencion, type CamposAtencion, type ReclamoQR } from "@/lib/app/atenciones";
import { estadoReclamo, iniciarReclamo, type EstadoReclamo } from "@/lib/directorio/reclamo";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { urlSitio } from "@/lib/negocio/host";

// El formulario que llena una veterinaria, estética u hotel desde el QR de la mascota (/m/<token>/registrar). Público,
// sin sesión: cada acción valida y aplica sus límites del lado del servidor (src/lib/app/atenciones.ts). Ninguna
// devuelve datos del dueño. Lo que cambia se pinta con lo que devuelve la acción (registro-final: el formulario es
// público y no hay registro del negocio en pantalla que volver a leer).

async function ipDeLaPeticion(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

// registro-final: devuelve la atención guardada (id, hasta cuándo se edita y el conteo para la oferta).
export async function guardarAtencion(token: string, escaneoId: string | null, c: CamposAtencion) {
  if (!c.firma) return { error: "Falta la firma: fírmalo con el dedo en el recuadro." };
  return registrarAtencion({ token, escaneoId: escaneoId && /^[0-9a-f-]{36}$/.test(escaneoId) ? escaneoId : null, datos: c.datos, fecha: c.fecha, pesoKg: c.pesoKg, nota: c.nota, negocioNombre: c.negocioNombre, negocioWhatsapp: c.negocioWhatsapp, firma: c.firma, lat: c.lat ?? null, lng: c.lng ?? null, ip: await ipDeLaPeticion() });
}

// registro-final: solo lee la atención para editarla (con el token del teléfono que la hizo).
export async function leerParaEditar(id: string, tokenEdicion: string) {
  return atencionParaEditar(id, tokenEdicion);
}

// registro-final: devuelve el resultado de la edición; la pantalla vuelve a pintar lo que mandó.
export async function guardarEdicion(id: string, tokenEdicion: string, c: CamposAtencion) {
  return editarAtencion(id, tokenEdicion, { datos: c.datos, fecha: c.fecha, pesoKg: c.pesoKg, nota: c.nota, negocioNombre: c.negocioNombre, negocioWhatsapp: c.negocioWhatsapp, firma: c.firma });
}

async function conRegistro(prospectoId: string, r: EstadoReclamo): Promise<ReclamoQR> {
  if (r.estado !== "verificado") return { ...r, registroUrl: null };
  const { data: p } = await createSupabaseAdminClient().from("prospectos").select("slug").eq("id", prospectoId).maybeSingle();
  const q = new URLSearchParams({ prospecto: String(p?.slug ?? ""), reclamo: r.id, utm_source: "app_duenos", utm_medium: "qr" });
  return { ...r, registroUrl: `${urlSitio()}/registro?${q.toString()}` };
}

// registro-final: devuelve el código del reclamo para mandarlo por WhatsApp (el reclamo es de la plataforma, no del negocio).
export async function pedirCuenta(prospectoId: string, whatsapp: string): Promise<{ error: string | null; reclamo?: ReclamoQR }> {
  if (!/^[0-9a-f-]{36}$/.test(prospectoId)) return { error: "No encontramos tu negocio." };
  const { ofrecer, total } = await ofertaPara(prospectoId);
  if (!ofrecer) return { error: total < 3 ? "La cuenta se abre a partir de tu tercer paciente registrado." : "Tu negocio ya tiene su cuenta en PeluDesk." };
  const { data: p } = await createSupabaseAdminClient().from("prospectos").select("telefono_norm, giro, ciudad").eq("id", prospectoId).maybeSingle();
  const r = await iniciarReclamo({ prospectoId, telefonoNegocio: (p?.telefono_norm as string | null) ?? null, telefono: whatsapp, ip: await ipDeLaPeticion(), giro: (p?.giro as string | null) ?? null, ciudad: (p?.ciudad as string | null) ?? null });
  if (r.error || !r.reclamo) return { error: r.error ?? "No pudimos generar tu código." };
  return { error: null, reclamo: await conRegistro(prospectoId, r.reclamo) };
}

// registro-final: solo lee el estado del reclamo.
export async function verReclamo(prospectoId: string, reclamoId: string): Promise<ReclamoQR | null> {
  const r = await estadoReclamo(reclamoId);
  return r ? conRegistro(prospectoId, r) : null;
}
