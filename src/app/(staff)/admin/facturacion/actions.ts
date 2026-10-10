"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual } from "@/lib/negocio/actual";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { MENSAJE_SOLO_LECTURA } from "@/lib/solo-lectura";
import { Facturapi } from "@/lib/cfdi/facturapi";
import { ErrorPac } from "@/lib/cfdi/errores";
import { buscarClaves, hayLlave, traducir } from "@/lib/cfdi/servicio";

// Configuración fiscal del negocio, llave del PAC, datos fiscales de un cliente
// y clasificación de productos y servicios. Todo exige el permiso «Editar datos
// fiscales» (la base lo comprueba); la llave solo la toca el servidor.

export type Res = { error: string | null; aviso?: string };

async function demo(): Promise<Res | null> {
  return (await cargarNegocioLanding()).plan === "demo" ? { error: MENSAJE_SOLO_LECTURA } : null;
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
  if (negado) return negado;
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("cfdi_guardar_config", { p: c });
  if (error) return { error: traducir(error) };
  revalidatePath("/admin/facturacion");
  revalidatePath("/caja/facturas");
  return { error: null, aviso: "Datos fiscales del negocio guardados." };
}

export async function guardarLlavePac(llave: string, modo: "pruebas" | "produccion"): Promise<Res> {
  const negado = await demo();
  if (negado) return negado;
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
  return { error: null, aviso: "Llave guardada y probada. Nadie puede volver a leerla desde la app." };
}

export async function borrarLlavePac(): Promise<Res> {
  const negado = await demo();
  if (negado) return negado;
  if (!(await puede())) return { error: "Necesitas el permiso «Editar datos fiscales»." };
  const negocio = await negocioActual();
  const { error } = await createSupabaseAdminClient(negocio.id).rpc("cfdi_borrar_llave");
  if (error) return { error: "No se pudo quitar la llave." };
  revalidatePath("/admin/facturacion");
  return { error: null, aviso: "Llave quitada: no se podrá timbrar hasta guardar otra." };
}

export async function estadoLlave(): Promise<{ hay: boolean; modo: "pruebas" | "produccion" | null; origen: "negocio" | "entorno" | null }> {
  if (!(await puede())) return { hay: false, modo: null, origen: null };
  const negocio = await negocioActual();
  return hayLlave(createSupabaseAdminClient(negocio.id));
}

export type DatosFiscalesForm = { rfc: string; nombre_fiscal: string; cp: string; regimen_fiscal: string; uso_cfdi: string; email?: string };

export async function guardarDatosFiscalesCliente(clienteId: string, d: DatosFiscalesForm): Promise<Res> {
  const negado = await demo();
  if (negado) return negado;
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("cfdi_guardar_datos_fiscales", { p_cliente_id: clienteId, p: d });
  if (error) return { error: traducir(error) };
  revalidatePath(`/clientes/${clienteId}`);
  return { error: null, aviso: "Datos fiscales guardados." };
}

export async function guardarClaseIva(clase: string, tratamiento: "tasa" | "exento", tasa: number, claveProdServ: string, claveUnidad: string, unidad: string): Promise<Res> {
  const negado = await demo();
  if (negado) return negado;
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
  return { error: null, aviso: "IVA y claves guardados." };
}

export async function guardarInsumoFiscal(insumoId: string, dePatente: boolean, clase: "alimento_mascotas" | "otro_producto"): Promise<Res> {
  const negado = await demo();
  if (negado) return negado;
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("cfdi_guardar_insumo", { p_insumo_id: insumoId, p_de_patente: dePatente, p_clase: clase });
  if (error) return { error: traducir(error) };
  revalidatePath("/admin/facturacion");
  return { error: null, aviso: "Producto clasificado." };
}

export async function guardarServicioFiscal(servicioId: string, clase: string | null): Promise<Res> {
  const negado = await demo();
  if (negado) return negado;
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("cfdi_guardar_servicio", { p_servicio_id: servicioId, p_clase: clase });
  if (error) return { error: traducir(error) };
  revalidatePath("/admin/facturacion");
  return { error: null, aviso: "Servicio clasificado." };
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
