"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mensajeDeError } from "@/lib/empleados/errores";
import type { ResultadoAccion } from "@/lib/empleados/tipos";
import { rangoMes } from "@/lib/gastos/textos";

const BUCKET = "gastos-comprobantes";
const PESO_MAXIMO = 4 * 1024 * 1024;

const texto = (fd: FormData, c: string) => String(fd.get(c) ?? "").trim();
const monto = (fd: FormData, c: string) => {
  const v = texto(fd, c).replace(/[$,\s]/g, "");
  return v ? Number(v) : null;
};

// "Cubre de (mes) a (mes)": vacío = el mes del pago (lo decide la base).
function periodo(fd: FormData): { desde: string | null; hasta: string | null; error?: string } {
  const de = texto(fd, "cubre_desde");
  const a = texto(fd, "cubre_hasta") || de;
  if (!de) return { desde: null, hasta: null };
  if (a < de) return { desde: null, hasta: null, error: "El periodo que cubre está al revés: el último mes no puede ser antes del primero." };
  return { desde: rangoMes(de).desde, hasta: rangoMes(a).hasta };
}

// La foto del ticket la sube el servidor con la secret key, DESPUÉS de
// comprobar el permiso con la sesión de quien la manda: el bucket no tiene
// políticas para nadie más.
async function subirComprobante(fd: FormData): Promise<{ path: string | null; error?: string }> {
  const archivo = fd.get("foto");
  if (!(archivo instanceof File) || archivo.size === 0) return { path: null };
  if (!archivo.type.startsWith("image/")) return { path: null, error: "El comprobante tiene que ser una foto." };
  if (archivo.size > PESO_MAXIMO) return { path: null, error: "La foto pesa demasiado. Tómala de nuevo o recórtala." };
  const supabase = await createSupabaseServerClient();
  const { data: puede } = await supabase.rpc("tiene_permiso", { p_permiso: "gastos" });
  if (!puede) return { path: null, error: "No tienes permiso para registrar gastos." };
  const { data: hoy } = await supabase.rpc("fecha_negocio");
  const path = `gastos/${String(hoy).slice(0, 7)}/${crypto.randomUUID()}.jpg`;
  const { error } = await createSupabaseAdminClient().storage.from(BUCKET).upload(path, archivo, { upsert: false, contentType: archivo.type });
  if (error) return { path: null, error: "No pudimos guardar la foto. Intenta de nuevo." };
  return { path };
}

async function quitarFoto(path: string | null) {
  if (path) await createSupabaseAdminClient().storage.from(BUCKET).remove([path]);
}

function refrescar() {
  revalidatePath("/gastos", "layout");
  revalidatePath("/caja/turno");
  revalidatePath("/recepcion");
  revalidatePath("/admin");
}

export async function registrarGasto(fd: FormData): Promise<ResultadoAccion> {
  const p = periodo(fd);
  if (p.error) return { error: p.error };
  if (!texto(fd, "concepto")) return { error: "Escribe el concepto." };
  if (!texto(fd, "categoria_id")) return { error: "Elige la categoría." };
  const foto = await subirComprobante(fd);
  if (foto.error) return { error: foto.error };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("registrar_gasto", {
    p_concepto: texto(fd, "concepto"),
    p_categoria_id: texto(fd, "categoria_id"),
    p_monto: monto(fd, "monto"),
    p_fecha_pago: texto(fd, "fecha_pago") || null,
    p_metodo: texto(fd, "metodo") || null,
    p_proveedor_id: texto(fd, "proveedor_id") || null,
    p_periodo_desde: p.desde,
    p_periodo_hasta: p.hasta,
    p_comprobante_path: foto.path,
    p_notas: texto(fd, "notas"),
  });
  if (error) {
    await quitarFoto(foto.path);
    return { error: mensajeDeError(error) };
  }
  refrescar();
  return {
    error: null,
    exito: texto(fd, "metodo") === "efectivo_caja" ? "Gasto registrado, con su retiro en el turno de caja" : "Gasto registrado",
  };
}

export async function pagarGastoEsperado(id: string, fd: FormData): Promise<ResultadoAccion> {
  const p = periodo(fd);
  if (p.error) return { error: p.error };
  const foto = await subirComprobante(fd);
  if (foto.error) return { error: foto.error };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("pagar_gasto_esperado", {
    p_gasto_id: id,
    p_monto: monto(fd, "monto"),
    p_fecha_pago: texto(fd, "fecha_pago") || null,
    p_metodo: texto(fd, "metodo") || null,
    p_proveedor_id: texto(fd, "proveedor_id") || null,
    p_periodo_desde: p.desde,
    p_periodo_hasta: p.hasta,
    p_comprobante_path: foto.path,
    p_notas: texto(fd, "notas"),
  });
  if (error) {
    await quitarFoto(foto.path);
    return { error: mensajeDeError(error) };
  }
  refrescar();
  return { error: null, exito: "Marcado como pagado" };
}

export async function cancelarGasto(id: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cancelar_gasto", { p_gasto_id: id, p_motivo: texto(fd, "motivo") });
  if (error) return { error: mensajeDeError(error) };
  refrescar();
  // La fila cancelada ya no tiene botones (y con ellos se iría el aviso):
  // lo que pasó con el dinero del cajón se muestra arriba de la página.
  const mes = /^\d{4}-\d{2}$/.test(texto(fd, "mes")) ? `mes=${texto(fd, "mes")}&` : "";
  return { error: null, ir: `/gastos?${mes}cancelado=${encodeURIComponent(String(data ?? ""))}` };
}

export async function corregirGasto(id: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("corregir_gasto", { p_gasto_id: id, p_monto_correcto: monto(fd, "monto"), p_motivo: texto(fd, "motivo") });
  if (error) return { error: mensajeDeError(error) };
  refrescar();
  return { error: null, exito: "Corregido con un ajuste" };
}

export async function adjuntarComprobante(id: string, fd: FormData): Promise<ResultadoAccion> {
  const foto = await subirComprobante(fd);
  if (foto.error) return { error: foto.error };
  if (!foto.path) return { error: "Elige la foto del comprobante." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("adjuntar_comprobante_gasto", { p_gasto_id: id, p_path: foto.path });
  if (error) {
    await quitarFoto(foto.path);
    return { error: mensajeDeError(error) };
  }
  refrescar();
  return { error: null, exito: "Comprobante guardado" };
}

// ── Recurrentes ──

export async function crearRecurrente(fd: FormData): Promise<ResultadoAccion> {
  const primer = texto(fd, "primer_vencimiento");
  if (!texto(fd, "concepto")) return { error: "Escribe el concepto." };
  if (!texto(fd, "categoria_id")) return { error: "Elige la categoría." };
  if (!primer) return { error: "Pon cuándo vence el siguiente pago." };
  const estimado = monto(fd, "monto_estimado");
  if (estimado !== null && !(estimado > 0)) return { error: "El monto estimado tiene que ser mayor a cero." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("gastos_recurrentes").insert({
    concepto: texto(fd, "concepto"),
    categoria_id: texto(fd, "categoria_id"),
    proveedor_id: texto(fd, "proveedor_id") || null,
    monto_estimado: estimado,
    cada_meses: Number(texto(fd, "cada_meses") || 1),
    dia: Number(primer.slice(8, 10)),
    cubre: texto(fd, "cubre") || "mes_del_pago",
    proxima_fecha: primer,
    notas: texto(fd, "notas") || null,
  });
  if (error) return { error: mensajeDeError(error) };
  refrescar();
  return { error: null, exito: "Gasto recurrente guardado: aparecerá por pagar 15 días antes de cada vencimiento" };
}

export async function cambiarRecurrente(id: string, fd: FormData): Promise<ResultadoAccion> {
  const estimado = monto(fd, "monto_estimado");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("gastos_recurrentes")
    .update({ monto_estimado: estimado, activo: fd.get("activo") === "on" })
    .eq("id", id)
    .select("id");
  if (error) return { error: mensajeDeError(error) };
  if (!data?.length) return { error: "No tienes permiso para esto." };
  refrescar();
  return { error: null, exito: "Guardado" };
}

// ── Categorías (solo admin; la base lo aplica) ──

export async function crearCategoria(fd: FormData): Promise<ResultadoAccion> {
  const nombre = texto(fd, "nombre");
  if (!nombre) return { error: "Escribe el nombre." };
  const supabase = await createSupabaseServerClient();
  const { data: max } = await supabase.from("categorias_gasto").select("orden").order("orden", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("categorias_gasto").insert({ nombre, descripcion: texto(fd, "descripcion") || null, orden: (max?.orden ?? 0) + 1 });
  if (error) return { error: mensajeDeError(error) };
  refrescar();
  return { error: null, exito: "Categoría agregada" };
}

export async function editarCategoria(id: string, fd: FormData): Promise<ResultadoAccion> {
  const nombre = texto(fd, "nombre");
  if (!nombre) return { error: "Escribe el nombre." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("categorias_gasto")
    .update({ nombre, descripcion: texto(fd, "descripcion") || null })
    .eq("id", id)
    .select("id");
  if (error) return { error: mensajeDeError(error) };
  if (!data?.length) return { error: "Solo un admin edita las categorías." };
  refrescar();
  return { error: null, exito: "Guardada" };
}

// Quitarla no toca los gastos que ya la usan (siguen saliendo en el reporte).
export async function quitarCategoria(id: string): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { data: cat } = await supabase.from("categorias_gasto").select("clave").eq("id", id).single();
  if (cat?.clave === "comisiones") return { error: "Esta la usa la app para las comisiones de Mercado Pago: puedes renombrarla, no quitarla." };
  const { data, error } = await supabase.from("categorias_gasto").update({ deleted_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error) return { error: mensajeDeError(error) };
  if (!data?.length) return { error: "Solo un admin edita las categorías." };
  refrescar();
  return { error: null, exito: "Quitada" };
}
