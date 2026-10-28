"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual } from "@/lib/negocio/actual";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { MENSAJE_DEMO } from "@/lib/solo-lectura";
import { Facturapi } from "@/lib/cfdi/facturapi";
import { ErrorPac } from "@/lib/cfdi/errores";
import { buscarClaves, hayLlave, traducir } from "@/lib/cfdi/servicio";
import { registrosDe, type RegistroPedido } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

// Configuración fiscal del negocio, llave del PAC, datos fiscales de un cliente
// y clasificación de productos y servicios. Todo exige el permiso «Editar datos
// fiscales» (la base lo comprueba); la llave solo la toca el servidor.

export type Res = { error: string | null; aviso?: string; registros?: RegistroFinal[] };

async function demo(): Promise<Res | null> {
  return (await cargarNegocioLanding()).plan === "demo" ? { error: MENSAJE_DEMO } : null;
}

// La fila fiscal vigente (una por negocio, cliente, clase, insumo o servicio), para devolverla como quedó.
async function filaFiscal(
  sb: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tabla: string,
  filtro?: [string, string]
): Promise<RegistroPedido> {
  let q = sb.from(tabla).select("id").is("deleted_at", null);
  if (filtro) q = q.eq(filtro[0], filtro[1]);
  const { data } = await q.limit(1).maybeSingle();
  return { t: tabla, i: (data as { id: string } | null)?.id };
}

async function puede(): Promise<boolean> {
  const sb = await createSupabaseServerClient();
  const { data } = await sb.rpc("tiene_permiso", { p_permiso: "editar_datos_fiscales" });
  return !!data;
}

export type ConfigFiscal = {
  activa: boolean;
  modo: "pruebas" | "produccion";
  rfc: string;
  razon_social: string;
  regimen_fiscal: string;
  cp_expedicion: string;
  tipo_persona: "fisica" | "moral" | "sociedad_civil";
  serie: string;
  global_periodicidad: "dia" | "semana" | "mes";
  global_automatica: boolean;
};

export async function guardarConfigFiscal(c: ConfigFiscal): Promise<Res> {
  const negado = await demo();
  if (negado) return { error: negado.error };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("cfdi_guardar_config", { p: c });
  if (error) return { error: traducir(error) };
  revalidatePath("/admin/facturacion");
  revalidatePath("/caja/facturas");
  return { error: null, aviso: "Datos fiscales del negocio guardados.", registros: await registrosDe(sb, [await filaFiscal(sb, "cfdi_config_negocio")]) };
}

export async function guardarLlavePac(llave: string, modo: "pruebas" | "produccion"): Promise<Res> {
  const negado = await demo();
  if (negado) return { error: negado.error };
  if (!(await puede())) return { error: "Necesitas el permiso «Editar datos fiscales»." };
  const l = llave.trim();
  if (modo === "pruebas" && !l.startsWith("sk_test")) return { error: "En pruebas la llave empieza con sk_test (la del sandbox de Facturapi)." };
  if (modo === "produccion" && !l.startsWith("sk_live")) return { error: "En producción la llave empieza con sk_live." };
  // Se prueba antes de guardarla: una búsqueda de catálogo no cuesta timbres.
  try {
    await new Facturapi(l).buscarUnidades("servicio");
  } catch (e) {
    return { error: e instanceof ErrorPac ? e.message : "No se pudo probar la llave." };
  }
  const negocio = await negocioActual();
  const { error } = await createSupabaseAdminClient(negocio.id).rpc("cfdi_guardar_llave", { p_llave: l, p_modo: modo });
  if (error) return { error: "No se pudo guardar la llave." };
  revalidatePath("/admin/facturacion");
  const sb = await createSupabaseServerClient();
  return { error: null, aviso: "Llave guardada y probada. Nadie puede volver a leerla desde la app.", registros: await registrosDe(sb, [await filaFiscal(sb, "cfdi_config_negocio")]) };
}

export async function borrarLlavePac(): Promise<Res> {
  const negado = await demo();
  if (negado) return { error: negado.error };
  if (!(await puede())) return { error: "Necesitas el permiso «Editar datos fiscales»." };
  const negocio = await negocioActual();
  const { error } = await createSupabaseAdminClient(negocio.id).rpc("cfdi_borrar_llave");
  if (error) return { error: "No se pudo quitar la llave." };
  revalidatePath("/admin/facturacion");
  const sb = await createSupabaseServerClient();
  return { error: null, aviso: "Llave quitada: no se podrá timbrar hasta guardar otra.", registros: await registrosDe(sb, [await filaFiscal(sb, "cfdi_config_negocio")]) };
}

export async function estadoLlave(): Promise<{ hay: boolean; modo: "pruebas" | "produccion" | null; origen: "negocio" | "entorno" | null }> {
  if (!(await puede())) return { hay: false, modo: null, origen: null };
  const negocio = await negocioActual();
  return hayLlave(createSupabaseAdminClient(negocio.id));
}

export type DatosFiscalesForm = { rfc: string; nombre_fiscal: string; cp: string; regimen_fiscal: string; uso_cfdi: string; email?: string };

export async function guardarDatosFiscalesCliente(clienteId: string, d: DatosFiscalesForm): Promise<Res> {
  const negado = await demo();
  if (negado) return { error: negado.error };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("cfdi_guardar_datos_fiscales", { p_cliente_id: clienteId, p: d });
  if (error) return { error: traducir(error) };
  revalidatePath(`/clientes/${clienteId}`);
  return {
    error: null,
    aviso: "Datos fiscales guardados.",
    registros: await registrosDe(sb, [{ t: "clientes", i: clienteId }, await filaFiscal(sb, "cfdi_datos_fiscales", ["cliente_id", clienteId])]),
  };
}

export async function guardarClaseIva(clase: string, tratamiento: "tasa" | "exento", tasa: number, claveProdServ: string, claveUnidad: string, unidad: string): Promise<Res> {
  const negado = await demo();
  if (negado) return { error: negado.error };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("cfdi_guardar_clase", {
    p_clase: clase,
    p_tratamiento: tratamiento,
    p_tasa: tasa,
    p_clave_prod_serv: claveProdServ,
    p_clave_unidad: claveUnidad,
    p_unidad: unidad,
  });
  if (error) return { error: traducir(error) };
  revalidatePath("/admin/facturacion");
  return { error: null, aviso: "IVA y claves guardados.", registros: await registrosDe(sb, [await filaFiscal(sb, "cfdi_clases", ["clase", clase])]) };
}

export async function guardarInsumoFiscal(insumoId: string, dePatente: boolean, clase: "alimento_mascotas" | "otro_producto"): Promise<Res> {
  const negado = await demo();
  if (negado) return { error: negado.error };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("cfdi_guardar_insumo", { p_insumo_id: insumoId, p_de_patente: dePatente, p_clase: clase });
  if (error) return { error: traducir(error) };
  revalidatePath("/admin/facturacion");
  return {
    error: null,
    aviso: "Producto clasificado.",
    registros: await registrosDe(sb, [{ t: "insumos", i: insumoId }, await filaFiscal(sb, "cfdi_insumo_fiscal", ["insumo_id", insumoId])]),
  };
}

export async function guardarServicioFiscal(servicioId: string, clase: string | null): Promise<Res> {
  const negado = await demo();
  if (negado) return { error: negado.error };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("cfdi_guardar_servicio", { p_servicio_id: servicioId, p_clase: clase });
  if (error) return { error: traducir(error) };
  revalidatePath("/admin/facturacion");
  return {
    error: null,
    aviso: "Servicio clasificado.",
    registros: await registrosDe(sb, [{ t: "servicios", i: servicioId }, await filaFiscal(sb, "cfdi_servicio_fiscal", ["servicio_id", servicioId])]),
  };
}

/** Busca claves del SAT en el catálogo del PAC (productos/servicios o unidades). */
export async function buscarClavesSat(que: "productos" | "unidades", consulta: string): Promise<{ error: string | null; items: { clave: string; descripcion: string }[] }> {
  if (!(await puede())) return { error: "No tienes permiso.", items: [] };
  if (consulta.trim().length < 3) return { error: null, items: [] };
  const negocio = await negocioActual();
  try {
    return { error: null, items: await buscarClaves(createSupabaseAdminClient(negocio.id), que, consulta.trim()) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo buscar.", items: [] };
  }
}
