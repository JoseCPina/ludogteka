import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizarTelefono } from "@/lib/telefono";
import { hoyNegocio } from "@/lib/formato";
import { ClienteWA, DatosSupabase, configWhatsApp } from "@/lib/whatsapp/infra";
import { enviarSms, haySms } from "@/lib/sms/enviar";
import { canjearEntrada, type TokensSesion } from "./entrada";
import plantilla from "./plantilla-entrada.json";

/**
 * Entrar con un código de 6 dígitos (docs/app-duenos/APP-NATIVA.md): la persona escribe su número y PeluDesk se lo manda.
 * Por WhatsApp con la plantilla de autenticación de Meta (en Android se autocompleta con un toque); si Meta todavía no la
 * aprueba, por mensaje de sesión si la persona escribió en las últimas 24 horas; y si no, por SMS. Un solo uso, 10
 * minutos, 5 intentos y bloqueo de 15 minutos por número. El código nunca se guarda ni se devuelve: solo su hash.
 */
const VIGENCIA_MS = plantilla.vence_minutos * 60_000;
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 15 * 60_000;
const ESPERA_REENVIO_MS = 30_000;
const TOPE_POR_HORA = 5;
const TOPE_POR_DIA = 10;
const TOPE_POR_IP_HORA = 20;

export type CanalEntrada = "plantilla" | "sesion" | "sms";
export type EnvioCodigo = { canal: CanalEntrada; telefonoUlt4: string; reenviarEnSegundos: number; venceEnMinutos: number; smsDisponible: boolean };

const secreto = () => process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const hashDe = (telefono: string, codigo: string) => createHmac("sha256", secreto()).update(`${telefono}:${codigo}`).digest("hex");
const iguales = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const minutosDe = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));

/** El SMS termina con la huella de la app: así el SMS Retriever de Android lo lee solo, sin pedir permisos. */
const textoSms = (codigo: string) => `<#> Tu código de PeluDesk es ${codigo}. Vence en ${plantilla.vence_minutos} minutos. No lo compartas con nadie.\n${plantilla.huella_android}`;
const textoSesion = (codigo: string) => `Tu código para entrar a PeluDesk es *${codigo}*. Vence en ${plantilla.vence_minutos} minutos. No lo compartas con nadie.`;

async function bloqueoDe(telefono: string): Promise<number | null> {
  const { data } = await createSupabaseAdminClient()
    .from("app_codigos_entrada")
    .select("bloqueado_hasta")
    .eq("telefono", telefono)
    .gt("bloqueado_hasta", new Date().toISOString())
    .order("bloqueado_hasta", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.bloqueado_hasta ? new Date(data.bloqueado_hasta as string).getTime() - Date.now() : null;
}

/** Manda por el primer camino que sirva. Una plantilla sin aprobar falla al instante y se pasa al siguiente. */
async function mandar(telefono: string, codigo: string, pedido: "whatsapp" | "sms"): Promise<CanalEntrada | null> {
  const a = `52${telefono}`;
  if (pedido === "whatsapp") {
    const cfg = configWhatsApp();
    if (cfg.token && cfg.phoneNumberId) {
      const wa = new ClienteWA(cfg.token, cfg.phoneNumberId);
      const r = await wa.plantillaDeCodigo(a, plantilla.nombre, codigo);
      if (r.ok) return "plantilla";
      if (await new DatosSupabase().ventanaAbierta(a)) {
        const s = await wa.texto(a, textoSesion(codigo), { sinVista: true });
        if (s.ok) return "sesion";
      }
    }
  }
  const sms = await enviarSms(`+${a}`, textoSms(codigo));
  return sms.ok ? "sms" : null;
}

export async function pedirCodigoEntrada(o: { telefono: string; canal?: "whatsapp" | "sms"; ip: string | null }): Promise<{ error: string | null; envio?: EnvioCodigo }> {
  const tel = normalizarTelefono(o.telefono);
  if (!tel) return { error: "Escribe tu número de WhatsApp a diez dígitos." };
  const db = createSupabaseAdminClient();
  const bloqueo = await bloqueoDe(tel);
  if (bloqueo) return { error: `Por seguridad, este número queda en pausa ${minutosDe(bloqueo)} min. Intenta después.` };
  const ahora = Date.now();
  const { data: recientes } = await db
    .from("app_codigos_entrada")
    .select("created_at")
    .eq("telefono", tel)
    .gte("created_at", new Date(ahora - 24 * 3600_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(TOPE_POR_DIA + 1);
  const filas = recientes ?? [];
  const ultima = filas[0] ? new Date(filas[0].created_at as string).getTime() : 0;
  if (ahora - ultima < ESPERA_REENVIO_MS) return { error: `Espera ${Math.ceil((ESPERA_REENVIO_MS - (ahora - ultima)) / 1000)} segundos para pedir otro.` };
  const enLaHora = filas.filter((f) => ahora - new Date(f.created_at as string).getTime() < 3600_000).length;
  if (filas.length >= TOPE_POR_DIA || enLaHora >= TOPE_POR_HORA) return { error: "Ya pediste varios códigos. Intenta más tarde o entra con tu contraseña." };
  const ipHash = o.ip ? createHash("sha256").update(`${o.ip}|${hoyNegocio("America/Mexico_City")}`).digest("hex").slice(0, 32) : null;
  if (ipHash) {
    const { count } = await db.from("app_codigos_entrada").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", new Date(ahora - 3600_000).toISOString());
    if ((count ?? 0) >= TOPE_POR_IP_HORA) return { error: "Hay demasiadas solicitudes desde esta conexión. Intenta más tarde." };
  }
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const canal = await mandar(tel, codigo, o.canal ?? "whatsapp");
  if (!canal) {
    return { error: o.canal === "sms" ? "No pudimos mandarte el SMS. Intenta por WhatsApp o en unos minutos." : "No pudimos mandarte el código. Intenta en unos minutos; si tienes contraseña, también puedes entrar con ella." };
  }
  // El código anterior deja de servir: solo vale el último.
  await db.from("app_codigos_entrada").update({ usado_at: new Date().toISOString() }).eq("telefono", tel).is("usado_at", null);
  const { error } = await db.from("app_codigos_entrada").insert({ telefono: tel, codigo_hash: hashDe(tel, codigo), canal, expira_at: new Date(ahora + VIGENCIA_MS).toISOString(), ip_hash: ipHash });
  if (error) {
    console.error("[app] código de entrada", error.message);
    return { error: "No pudimos preparar tu código. Intenta de nuevo." };
  }
  return { error: null, envio: { canal, telefonoUlt4: tel.slice(-4), reenviarEnSegundos: 60, venceEnMinutos: plantilla.vence_minutos, smsDisponible: haySms() } };
}

/** Comprueba el código y abre la sesión (cookie en la web, tokens en la app). El intento se cuenta ANTES de comparar. */
export async function verificarCodigoEntrada(o: { telefono: string; codigo: string; destino: "cookie" | "tokens" }): Promise<{ error: string | null; nueva?: boolean; tokens?: TokensSesion; pedirOtro?: boolean }> {
  const tel = normalizarTelefono(o.telefono);
  if (!tel) return { error: "Escribe tu número de WhatsApp a diez dígitos." };
  const codigo = o.codigo.replace(/\D/g, "");
  if (codigo.length !== 6) return { error: "El código tiene 6 dígitos." };
  const db = createSupabaseAdminClient();
  const bloqueo = await bloqueoDe(tel);
  if (bloqueo) return { error: `Por seguridad, este número queda en pausa ${minutosDe(bloqueo)} min. Intenta después.`, pedirOtro: true };
  const { data: fila } = await db
    .from("app_codigos_entrada")
    .select("id, codigo_hash, intentos, expira_at")
    .eq("telefono", tel)
    .is("usado_at", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!fila) return { error: "Ese código ya no sirve. Pide uno nuevo.", pedirOtro: true };
  if (new Date(fila.expira_at as string).getTime() < Date.now()) return { error: "Ese código ya venció. Pide uno nuevo.", pedirOtro: true };
  const intentos = Number(fila.intentos) + 1;
  const { data: contado } = await db.from("app_codigos_entrada").update({ intentos }).eq("id", fila.id).eq("intentos", fila.intentos).select("id").maybeSingle();
  if (!contado) return { error: "Intenta de nuevo." };
  if (!iguales(fila.codigo_hash as string, hashDe(tel, codigo))) {
    if (intentos >= MAX_INTENTOS) {
      await db.from("app_codigos_entrada").update({ usado_at: new Date().toISOString(), bloqueado_hasta: new Date(Date.now() + BLOQUEO_MS).toISOString() }).eq("id", fila.id);
      return { error: "Demasiados intentos. Por seguridad, este número queda en pausa 15 min.", pedirOtro: true };
    }
    const quedan = MAX_INTENTOS - intentos;
    return { error: `Ese código no es. ${quedan === 1 ? "Te queda 1 intento" : `Te quedan ${quedan} intentos`}.` };
  }
  const { data: usado } = await db.from("app_codigos_entrada").update({ usado_at: new Date().toISOString() }).eq("id", fila.id).is("usado_at", null).select("id").maybeSingle();
  if (!usado) return { error: "Ese código ya se usó. Pide uno nuevo.", pedirOtro: true };
  // La sesión se abre por el mismo camino de siempre: una entrada verificada que se canjea una vez.
  const { data: entrada, error } = await db
    .from("app_entradas")
    .insert({ telefono: tel, codigo: randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase(), estado: "verificada", verificada_at: new Date().toISOString(), expira_at: new Date(Date.now() + 15 * 60_000).toISOString(), user_agent: "codigo de entrada" })
    .select("id")
    .single();
  if (error || !entrada) {
    console.error("[app] entrada verificada", error?.message);
    return { error: "No pudimos abrir tu sesión. Intenta de nuevo." };
  }
  return canjearEntrada(entrada.id as string, o.destino);
}
