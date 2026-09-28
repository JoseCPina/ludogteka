"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { negocioActual } from "@/lib/negocio/actual";
import { MENSAJE_SOLO_LECTURA } from "@/lib/solo-lectura";
import { desconectar, iniciarConexion } from "@/lib/mercadopago/oauth";
import { listarTerminales, modeloDeTerminal, ponerTerminalEnPdv } from "@/lib/mercadopago/point";
import { mpFetch } from "@/lib/mercadopago/api";
import { esProduccion } from "@/lib/mercadopago/config";
import { probarCredencialesClip } from "@/lib/clip/terminal";
import { conexionDeCobro } from "@/lib/pagos/conexion";
import { mensajeDeError, type ConexionCobro, type CredencialesClip, type ProveedorElegible } from "@/lib/pagos/tipos";

// Con qué cobra el negocio y sus conexiones. Solo el admin (no se delega):
// son las credenciales que mueven el dinero del negocio. Las credenciales
// van cifradas a Vault por el servidor; ninguna regresa al navegador.

type Resultado = { error: string | null; aviso?: string };

async function exigirAdmin(): Promise<{ error: string } | { negocioId: string; usuarioId: string }> {
  const sesion = await obtenerSesionConRol();
  if (sesion?.rol !== "admin") return { error: "Solo un admin cambia con qué cobra el negocio." };
  const supabase = await createSupabaseServerClient();
  const { data: escribible } = await supabase.rpc("negocio_escribible");
  if (escribible === false) return { error: MENSAJE_SOLO_LECTURA };
  return { negocioId: (await negocioActual()).id, usuarioId: sesion.user.id };
}

function listo() {
  revalidatePath("/admin/pagos");
  revalidatePath("/caja");
  return { error: null };
}

export async function elegirProveedor(proveedor: ProveedorElegible): Promise<Resultado> {
  const a = await exigirAdmin();
  if ("error" in a) return a;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("elegir_proveedor_cobro", { p_proveedor: proveedor });
  if (error) return { error: error.message };
  return listo();
}

/** Paso 1 de OAuth: la URL de Mercado Pago a la que se manda al admin. */
export async function conectarMercadoPago(): Promise<{ error: string | null; url?: string }> {
  const a = await exigirAdmin();
  if ("error" in a) return a;
  try {
    return { error: null, url: await iniciarConexion(a.negocioId, a.usuarioId) };
  } catch (e) {
    return { error: mensajeDeError(e) };
  }
}

export async function desconectarMercadoPago(): Promise<Resultado> {
  const a = await exigirAdmin();
  if ("error" in a) return a;
  try {
    await desconectar(a.negocioId);
  } catch (e) {
    return { error: mensajeDeError(e) };
  }
  return { ...listo(), aviso: "Se desconectó. Si quieres quitar también el permiso del lado de Mercado Pago: tu cuenta → Seguridad → Aplicaciones conectadas → PeluDesk." };
}

async function conexionMp(): Promise<ConexionCobro | { error: string }> {
  const cx = await conexionDeCobro(await negocioActual());
  if (!cx || cx.proveedor !== "mercadopago") return { error: "Primero conecta tu cuenta de Mercado Pago." };
  return cx;
}

export type TerminalMp = { id: string; nombre: string; compatible: boolean; pdv: boolean };

export async function terminalesMercadoPago(): Promise<{ error: string | null; terminales?: TerminalMp[] }> {
  const a = await exigirAdmin();
  if ("error" in a) return a;
  const cx = await conexionMp();
  if ("error" in cx) return cx;
  try {
    const lista = await listarTerminales(cx);
    return {
      error: null,
      terminales: lista.map((t) => ({ id: t.id, ...modeloDeTerminal(t.id), pdv: t.operating_mode === "PDV" })),
    };
  } catch (e) {
    return { error: mensajeDeError(e) };
  }
}

export async function escogerTerminal(terminalId: string): Promise<Resultado> {
  const a = await exigirAdmin();
  if ("error" in a) return a;
  const cx = await conexionMp();
  if ("error" in cx) return cx;
  if (cx.origen === "llave_entorno") return { error: "Con la conexión anterior la terminal está fija. Conecta tu cuenta con «Conectar Mercado Pago» para escogerla aquí." };
  let lista;
  try {
    lista = await listarTerminales(cx);
  } catch (e) {
    return { error: mensajeDeError(e) };
  }
  const t = lista.find((x) => x.id === terminalId);
  if (!t) return { error: "Esa terminal no está en tu cuenta de Mercado Pago." };
  const modelo = modeloDeTerminal(t.id);
  if (!modelo.compatible) {
    return { error: `Solo Point Smart es compatible con PeluDesk. Esta terminal (${modelo.nombre}) no recibe cobros desde la app: puedes seguir usándola y registrar el cobro a mano.` };
  }
  const { error } = await createSupabaseAdminClient(a.negocioId)
    .from("integraciones_cobro")
    .update({ terminal_id: t.id, terminal_nombre: modelo.nombre, terminal_compatible: true })
    .eq("negocio_id", a.negocioId)
    .eq("proveedor", "mercadopago")
    .is("deleted_at", null);
  if (error) return { error: "No se pudo guardar la terminal." };
  return { ...listo(), aviso: t.operating_mode === "PDV" ? undefined : "La terminal no está en modo integrado (PDV): apriétale «Poner en modo integrado» o no recibirá los cobros." };
}

export async function ponerEnModoIntegrado(terminalId: string): Promise<Resultado> {
  const a = await exigirAdmin();
  if ("error" in a) return a;
  const cx = await conexionMp();
  if ("error" in cx) return cx;
  try {
    await ponerTerminalEnPdv(cx, terminalId);
  } catch (e) {
    return { error: mensajeDeError(e) };
  }
  return { ...listo(), aviso: "Listo: reinicia la terminal para que tome el modo integrado." };
}

export async function probarMercadoPago(): Promise<Resultado> {
  const a = await exigirAdmin();
  if ("error" in a) return a;
  const cx = await conexionMp();
  if ("error" in cx) return cx;
  if (cx.simulado) return { error: null, aviso: "Conexión simulada: responde bien y no mueve dinero." };
  try {
    const yo = await mpFetch<{ nickname?: string; site_id?: string }>(cx.mp?.accessToken ?? "", "/users/me");
    return { error: null, aviso: `Mercado Pago contestó: cuenta ${yo.nickname ?? "?"} (${yo.site_id ?? "?"}).` };
  } catch (e) {
    return { error: mensajeDeError(e) };
  }
}

// ───────────── Clip

export async function guardarClip(datos: { apiKey: string; secretKey: string; serie: string; usuario: string }): Promise<Resultado> {
  const a = await exigirAdmin();
  if ("error" in a) return a;
  const creds: CredencialesClip = {
    apiKey: datos.apiKey.trim(),
    secretKey: datos.secretKey.trim(),
    serie: datos.serie.trim().toUpperCase(),
    usuario: datos.usuario.trim().toLowerCase(),
  };
  if (!creds.apiKey || !creds.secretKey) return { error: "Escribe la API key y la clave secreta de Clip." };
  if (!/^[A-Z0-9-]{6,40}$/.test(creds.serie)) return { error: "Escribe el número de serie de la terminal tal como viene en su etiqueta." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(creds.usuario)) return { error: "Escribe el correo del usuario de Clip al que se asignan los cobros." };

  // Fuera de producción, una API key que empieza con SIM es una conexión
  // simulada (Clip no tiene sandbox): sirve para probar la pantalla y el flujo.
  if (!esProduccion() && creds.apiKey.toUpperCase().startsWith("SIM")) creds.simulada = true;

  // Se prueban antes de guardarse: unas credenciales que Clip rechaza no se guardan.
  const negocio = await negocioActual();
  const prueba = creds.simulada ? { ok: true, detalle: "" } : await probarCredencialesClip({
    proveedor: "clip",
    negocio: { id: negocio.id, nombre: negocio.nombre, url: "" },
    simulado: false,
    origen: "credenciales",
    cuentaId: null,
    terminalId: creds.serie,
    mp: null,
    clip: creds,
  });
  if (!prueba.ok) return { error: `Clip no aceptó las credenciales: ${prueba.detalle}` };

  const admin = createSupabaseAdminClient(a.negocioId);
  // El token de la URL del webhook: en claro solo dentro del secreto (para
  // volver a mostrarle la URL al admin); en la tabla, solo su hash.
  const token = randomBytes(24).toString("base64url");
  const { error: errorSecreto } = await admin.rpc("integracion_guardar_secreto", {
    p_proveedor: "clip",
    p_secreto: JSON.stringify({ ...creds, webhookToken: token }),
  });
  if (errorSecreto) return { error: "No se pudieron guardar las credenciales." };
  await admin.from("integraciones_cobro").update({ elegida: false }).eq("negocio_id", a.negocioId).neq("proveedor", "clip").is("deleted_at", null);
  const { error } = await admin
    .from("integraciones_cobro")
    .update({
      elegida: true,
      estado: "conectada",
      modo: "credenciales",
      cuenta_nombre: creds.usuario,
      terminal_id: creds.serie,
      terminal_nombre: "Terminal Clip",
      terminal_compatible: true,
      webhook_token_hash: createHash("sha256").update(token).digest("hex"),
      conectada_at: new Date().toISOString(),
      conectada_por: a.usuarioId,
      desconectada_at: null,
      ultimo_error: null,
    })
    .eq("negocio_id", a.negocioId)
    .eq("proveedor", "clip")
    .is("deleted_at", null);
  if (error) return { error: "No se pudo guardar la conexión." };
  return { ...listo(), aviso: "Clip quedó conectado. Copia la URL de notificaciones de abajo al portal de Clip." };
}

export async function desconectarClip(): Promise<Resultado> {
  const a = await exigirAdmin();
  if ("error" in a) return a;
  const admin = createSupabaseAdminClient(a.negocioId);
  const { error } = await admin.rpc("integracion_borrar_secreto", { p_proveedor: "clip" });
  if (error) return { error: error.message };
  await admin
    .from("integraciones_cobro")
    .update({ estado: "desconectada", modo: null, webhook_token_hash: null, terminal_id: null, desconectada_at: new Date().toISOString() })
    .eq("negocio_id", a.negocioId)
    .eq("proveedor", "clip")
    .is("deleted_at", null);
  return listo();
}
