"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual, zonaActual } from "@/lib/negocio/actual";
import { hashDeToken, tokenPlausible } from "@/lib/reporte/enlaces";
import { generarPdfContrato } from "@/lib/contratos/generar-pdf";
import { fechaLocalDeInstante, horaLocalDeInstante } from "@/lib/formato";
import { llenarConsentimiento } from "@/lib/veterinaria/carnet";
import { ErrorVideo, proveedorDeSala } from "@/lib/telemedicina/proveedor";
import type { TeleconsultaPublica } from "@/lib/telemedicina/tipos";

// La liga de la teleconsulta (/t/<token>): sin sesión. El servidor resuelve el token (solo existe su sha256)
// con la llave de servidor acotada al negocio del dominio; la base vuelve a comprobar ventana,
// consentimiento y pago antes de dar la sala.

type Resultado = { error: string | null };
const BUCKET = "perros-archivos";
const mensajeDeBase = (e: { code?: string; message: string }, general: string) => (e.code === "P0001" ? e.message : general);

/** El dueño firma el consentimiento de teleconsulta (nombre + firma): el PDF se arma aquí, con la hora y la IP del servidor. */
export async function firmarConsentimientoTeleconsulta(token: string, nombre: string, firmaPngDataUrl: string | null): Promise<Resultado> {
  if (!tokenPlausible(token)) return { error: "Esta liga ya no es válida." };
  if (nombre.trim().length < 3) return { error: "Escribe tu nombre completo para firmar." };
  if (!firmaPngDataUrl || !firmaPngDataUrl.startsWith("data:image/png;base64,") || firmaPngDataUrl.length > 300_000) {
    return { error: "Dibuja tu firma en el recuadro para firmar." };
  }
  const negocio = await negocioActual();
  const zona = await zonaActual();
  const admin = createSupabaseAdminClient(negocio.id);
  const hash = hashDeToken(token);
  const { data: pub } = await admin.rpc("teleconsulta_publica", { p_token_hash: hash });
  const d = pub as TeleconsultaPublica | null;
  if (!d) return { error: "Esta liga ya no es válida." };
  if (d.consentimiento.estado === "firmado") return { error: null };
  if (d.ventana === "cancelada" || d.ventana === "cerrada") return { error: "Esta teleconsulta ya no está disponible." };

  const { data: fila } = await admin
    .from("vet_telemedicina")
    .select("perro_id, cliente_id, consentimiento_id")
    .eq("negocio_id", negocio.id)
    .eq("token_hash", hash)
    .is("deleted_at", null)
    .maybeSingle();
  if (!fila) return { error: "Esta liga ya no es válida." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "no determinada";
  const ahora = new Date().toISOString();
  const cuerpo = llenarConsentimiento(d.consentimiento.cuerpo, d.consentimiento.campos);
  const titulo = llenarConsentimiento(d.consentimiento.titulo, d.consentimiento.campos);
  const pngBytes = Buffer.from(firmaPngDataUrl.slice("data:image/png;base64,".length), "base64");
  const pdf = await generarPdfContrato({
    titulo,
    cuerpo,
    firma: { pngBytes, firmanteNombre: nombre.trim(), fechaHoraTexto: `${fechaLocalDeInstante(ahora, zona)} ${horaLocalDeInstante(ahora, zona)}`, lugarHora: zona, ip },
  });
  const huella = crypto.createHash("sha256").update(pdf).digest("hex");
  const ruta = `${fila.cliente_id}/${fila.perro_id}/consentimientos/${fila.consentimiento_id}.pdf`;
  const { error: errorSubida } = await admin.storage.from(BUCKET).upload(ruta, pdf, { contentType: "application/pdf", upsert: false });
  if (errorSubida && !/exists|duplicate/i.test(errorSubida.message)) return { error: "No pudimos guardar tu firma. Intenta de nuevo." };

  const { error } = await admin.rpc("teleconsulta_firmar_consentimiento", { p_token_hash: hash, p_nombre: nombre.trim(), p_ip: ip, p_hash: huella, p_path: ruta });
  if (error) return { error: mensajeDeBase(error, "No pudimos registrar tu firma. Intenta de nuevo.") };
  revalidatePath(`/t/${token}`);
  return { error: null };
}

/** Entrar a la sala: solo en la ventana, con el consentimiento firmado y (si aplica) la cuenta en cero. */
export async function entrarSalaDueno(token: string): Promise<{ error: string | null; url?: string; simulada?: boolean }> {
  if (!tokenPlausible(token)) return { error: "Esta liga ya no es válida." };
  const negocio = await negocioActual();
  const admin = createSupabaseAdminClient(negocio.id);
  const { data, error } = await admin.rpc("teleconsulta_sala_dueno", { p_token_hash: hashDeToken(token) });
  if (error || !data) return { error: error ? mensajeDeBase(error, "No pudimos abrir la sala. Intenta de nuevo.") : "No pudimos abrir la sala." };
  const sala = data as { proveedor: "daily" | "simulado"; sala_nombre: string; sala_url: string; hasta: string; dueno: string };
  try {
    const url = await proveedorDeSala(sala.proveedor).urlDeEntrada({
      sala: { proveedor: sala.proveedor, nombre: sala.sala_nombre, url: sala.sala_url },
      nombre: sala.dueno,
      esMedico: false,
      desde: new Date(Date.now() - 60_000),
      hasta: new Date(sala.hasta),
    });
    return { error: null, url, simulada: sala.proveedor === "simulado" };
  } catch (e) {
    return { error: e instanceof ErrorVideo ? e.message : "No pudimos abrir la sala. Intenta de nuevo." };
  }
}
