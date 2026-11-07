// 101 · Solicitudes de lugar (admin: «Aceptar con excepción» es de admin o de quien tenga el permiso).
// `preparar` deja una solicitud real: la dueña del demo (cuenta del visitante, abierta solo mientras pide) pide lugar
// desde su cuenta para Pimienta, que no tiene evaluación de comportamiento (portal_pedir_lugar, el mismo camino que
// la app). `despues` borra las solicitudes del demo; la reserva que deja «Aceptar con excepción» se queda como
// cualquier otra reserva del demo.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DUENA = "t4420000201@telefono.ludogteka.mx"; // Fernanda Luna Arriaga (CUENTAS.cliente)

export default {
  rol: "admin",
  inicio: "/admin",
  async preparar({ sb, negocioId, fechaDia }) {
    const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
    const { data: lista } = await sb.auth.admin.listUsers({ perPage: 1000 });
    const u = lista?.users?.find((x) => x.email === DUENA);
    if (!u) throw new Error("No encuentro a la dueña del demo (CUENTAS.cliente).");
    const { data: m } = await sb.from("membresias").select("id, cliente_id").eq("negocio_id", negocioId).eq("profile_id", u.id).eq("rol", "cliente").is("deleted_at", null).maybeSingle();
    if (!m?.cliente_id) throw new Error("La dueña del demo no tiene membresía de cliente.");
    const { data: perro } = await sb.from("perros").select("id").eq("cliente_id", m.cliente_id).eq("nombre", "Pimienta").is("deleted_at", null).maybeSingle();
    if (!perro) throw new Error("No encuentro a Pimienta (la mascota sin evaluación de la dueña del demo).");
    const { data: serv } = await sb.from("servicios").select("id").eq("negocio_id", negocioId).eq("clave", "guarderia_dia").is("deleted_at", null).maybeSingle();
    if (!serv) throw new Error("El demo no tiene guardería de día completo.");
    // Sin solicitudes viejas: el video enseña una sola.
    await sb.from("solicitudes_reserva").delete().eq("negocio_id", negocioId);
    // La dueña, con su propia sesión (enlace mágico), pide lugar como lo haría desde su app.
    const { data: link, error: e1 } = await sb.auth.admin.generateLink({ type: "magiclink", email: DUENA });
    if (e1) throw new Error(`generateLink de la dueña: ${e1.message}`);
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: s, error: e2 } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    if (e2) throw new Error(`verifyOtp de la dueña: ${e2.message}`);
    const duena = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": negocioId, Authorization: `Bearer ${s.session.access_token}` } } });
    await sb.from("membresias").update({ solo_lectura: false }).eq("id", m.id);
    try {
      const args = { p_perro: perro.id, p_servicio: serv.id, p_entrada: fechaDia, p_salida: fechaDia, p_horas: null, p_inicio: null, p_recoleccion: null };
      let r = await duena.rpc("portal_pedir_lugar", args);
      if (r.error) {
        const d = new Date(`${fechaDia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1);
        r = await duena.rpc("portal_pedir_lugar", { ...args, p_salida: d.toISOString().slice(0, 10) });
      }
      if (r.error) throw new Error(`pedir lugar: ${r.error.message}`);
      if (r.data?.estado !== "pendiente") throw new Error(`pedir lugar no dejó una solicitud pendiente: ${JSON.stringify(r.data).slice(0, 200)}`);
    } finally {
      await sb.from("membresias").update({ solo_lectura: true }).eq("id", m.id);
    }
  },
  async despues({ sb, negocioId }) {
    await sb.from("solicitudes_reserva").delete().eq("negocio_id", negocioId);
  },
  gancho: "Un dueño quiere reservar desde su app, pero a su mascota le falta la evaluación o una vacuna. No se queda sin respuesta: deja una solicitud y tú decides.",
  escenas: [
    {
      titulo: "El aviso",
      dice: "Cuando a la mascota le falta un requisito, la app no crea la reserva: deja una solicitud de lugar, que no cobra ni ocupa cupo. Te llega a «Necesita atención» con lo que falta, a la agenda de ese servicio y, si eres admin, por WhatsApp. Aprieta «Revisar».",
      pasos: [["desplazar", "Necesita atención"], ["resaltar", "pidió lugar para", 3200], ["clic", "css:a[href='/solicitudes']", { nav: true }]],
    },
    {
      titulo: "La solicitud",
      dice: "En «Solicitudes de lugar» ves cada petición: la mascota, el servicio, la fecha y qué «Falta». Si nadie contesta en tres días, caduca sola y el dueño recibe el aviso.",
      pasos: [["resaltar", "Solicitudes de lugar", 2400], ["zoom", "Falta", 1.4, 3200]],
    },
    {
      titulo: "Qué puedes hacer",
      dice: "«Aceptar» funciona si ya se resolvió lo que faltaba. «Agendar evaluación» le manda al dueño el día y la hora. «Contactar» abre WhatsApp. «Rechazar» pide un motivo que el dueño lee. Y «Aceptar con excepción» la convierte en reserva con un motivo, igual que la excepción al reservar.",
      pasos: [["resaltar", "Agendar evaluación", 2000], ["resaltar", "Contactar", 1600], ["resaltar", "Rechazar", 1600], ["clic", "Aceptar con excepción"], ["esperar", 800]],
    },
    {
      titulo: "Aceptar con excepción",
      dice: "Escribes el «Motivo de la excepción» y confirmas. La solicitud se vuelve una reserva normal, el dueño recibe el aviso en su app y aquí queda en «Últimos 30 días» con su motivo.",
      pasos: [["escribir", "Motivo de la excepción", "Viene con su hermana Canela, que ya está evaluada"], ["js", ({ page }) => page.locator("li[data-solicitud] form").filter({ has: page.locator("textarea[name='motivo']") }).getByRole("button", { name: "Aceptar con excepción" }).click(), 1800], ["esperar", 3500], ["desplazar", "Últimos 30 días"], ["resaltar", "Últimos 30 días", 2800]],
    },
  ],
  resumen: ["Si falta un requisito, el dueño deja una solicitud: no cobra ni ocupa cupo.", "La ves en «Necesita atención» y en «Solicitudes de lugar», con lo que falta.", "Aceptas, agendas la evaluación, contactas, rechazas con motivo o aceptas con excepción."],
};
