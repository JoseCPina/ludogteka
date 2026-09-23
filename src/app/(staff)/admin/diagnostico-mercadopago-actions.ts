"use server";

import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { probarMercadoPago, type PruebaMp } from "@/lib/mercadopago/diagnostico";
import { ponerTerminalEnPdv } from "@/lib/mercadopago/point";
import { ErrorMercadoPago } from "@/lib/mercadopago/errores";
import { modoSimulacion, urlWebhook } from "@/lib/mercadopago/config";

export type EstadoDiagnosticoMp = {
  error: string | null;
  pruebas?: PruebaMp[];
  terminales?: { id: string; operating_mode?: string }[];
  urlWebhook?: string;
  simulado?: boolean;
};

export async function probarConexionMercadoPago(): Promise<EstadoDiagnosticoMp> {
  const sesion = await obtenerSesionConRol();
  if (sesion?.rol !== "admin") return { error: "Solo un admin puede correr esta prueba." };
  try {
    const r = await probarMercadoPago();
    return { error: null, ...r, urlWebhook: urlWebhook(), simulado: modoSimulacion() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo correr la prueba." };
  }
}

export async function ponerTerminalPdv(terminalId: string): Promise<{ error: string | null }> {
  const sesion = await obtenerSesionConRol();
  if (sesion?.rol !== "admin") return { error: "Solo un admin puede cambiar el modo de la terminal." };
  try {
    await ponerTerminalEnPdv(terminalId);
    return { error: null };
  } catch (e) {
    if (e instanceof ErrorMercadoPago) return { error: e.sugerencia ? `${e.message} ${e.sugerencia}` : e.message };
    return { error: e instanceof Error ? e.message : "No se pudo cambiar el modo." };
  }
}
