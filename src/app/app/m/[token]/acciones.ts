"use server";

import { hiloPublico, registrarMensajeHallador } from "@/lib/app/publico";

// El perfil público (/m/<token>): quien encontró a la mascota manda un mensaje y ve las respuestas. Sin sesión.
// Nada de esto se pinta de una tabla que la pantalla tenga que actualizar: devuelve el hilo. El tope de mensajes por
// mascota y día vive en registrarMensajeHallador.

export async function mandarMensaje(token: string, texto: string, nombre: string, whatsapp: string, trampa: string): Promise<{ error: string | null; desde?: string }> {
  if (trampa) return { error: null, desde: new Date().toISOString() }; // un bot llenó el campo escondido
  const r = await registrarMensajeHallador({ token, texto, telefono: whatsapp || null, nombre, via: "pagina" });
  if (r.error) return { error: r.error };
  return { error: null, desde: new Date(Date.now() - 5_000).toISOString() };
}

export async function verHilo(token: string, desde: string | null): Promise<{ mensajes: { de: "hallador" | "dueno"; texto: string; creado: string }[] }> {
  if (!/^[A-Za-z0-9]{10}$/.test(token) || !desde) return { mensajes: [] };
  return { mensajes: await hiloPublico(token, desde) };
}
