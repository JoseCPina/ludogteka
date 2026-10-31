"use server";

import { headers } from "next/headers";
import { sesionApp } from "@/lib/app/sesion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";
import { crearAviso } from "@/lib/app/avisos";

type Resultado = { error: string | null; registros?: RegistroFinal[] };

/** El celular se suscribió a push: se guarda la suscripción (una por endpoint) para este dueño. */
export async function guardarSuscripcion(sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<Resultado> {
  const s = await sesionApp();
  if (!s) return { error: "Tu sesión se cerró. Vuelve a entrar." };
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth || !/^https:\/\//.test(sub.endpoint)) return { error: "El navegador no dio una suscripción válida." };
  const supabase = await createSupabaseServerClient("portal");
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  const { data: previa } = await supabase.from("app_push_suscripciones").select("id").eq("endpoint", sub.endpoint).maybeSingle();
  const fila = { dueno_id: s.user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: ua, deleted_at: null, fallos: 0, updated_at: new Date().toISOString() };
  const { data, error } = previa
    ? await supabase.from("app_push_suscripciones").update(fila).eq("id", previa.id).select("id").maybeSingle()
    : await supabase.from("app_push_suscripciones").insert(fila).select("id").maybeSingle();
  if (error) return { error: "No pudimos guardar la suscripción. Intenta de nuevo." };
  return { error: null, registros: await registrosDe(supabase, [{ t: "app_push_suscripciones", i: (data?.id as string | undefined) ?? null }]) };
}

/** El dueño apagó los avisos en este celular. */
export async function quitarSuscripcion(endpoint: string): Promise<Resultado> {
  const s = await sesionApp();
  if (!s) return { error: "Tu sesión se cerró. Vuelve a entrar." };
  const supabase = await createSupabaseServerClient("portal");
  const { data } = await supabase.from("app_push_suscripciones").update({ deleted_at: new Date().toISOString() }).eq("endpoint", endpoint).is("deleted_at", null).select("id").maybeSingle();
  return { error: null, registros: await registrosDe(supabase, [{ t: "app_push_suscripciones", i: (data?.id as string | undefined) ?? null }]) };
}

/** «Mandarme un aviso de prueba»: un aviso en el centro de avisos y, si hay suscripción, la notificación. */
export async function probarAviso(): Promise<Resultado & { enviadas?: number }> {
  const s = await sesionApp();
  if (!s) return { error: "Tu sesión se cerró. Vuelve a entrar." };
  const id = await crearAviso({ duenoId: s.user.id, tipo: "prueba", titulo: "Así se ven los avisos", cuerpo: "Cuando a tu mascota le toque una vacuna o pase algo importante, te avisamos aquí y en tu celular.", url: "/avisos" });
  const supabase = await createSupabaseServerClient("portal");
  return { error: id ? null : "No pudimos crear el aviso.", registros: await registrosDe(supabase, [{ t: "app_avisos", i: id }]) };
}

export async function marcarLeido(id: string): Promise<Resultado> {
  const supabase = await createSupabaseServerClient("portal");
  const { error } = await supabase.from("app_avisos").update({ leido_at: new Date().toISOString() }).eq("id", id).is("leido_at", null);
  if (error) return { error: "No se pudo marcar." };
  return { error: null, registros: await registrosDe(supabase, [{ t: "app_avisos", i: id }]) };
}

export async function marcarTodosLeidos(): Promise<Resultado> {
  const s = await sesionApp();
  if (!s) return { error: "Tu sesión se cerró. Vuelve a entrar." };
  const supabase = await createSupabaseServerClient("portal");
  const { data } = await supabase.from("app_avisos").update({ leido_at: new Date().toISOString() }).eq("dueno_id", s.user.id).is("leido_at", null).select("id");
  return { error: null, registros: await registrosDe(supabase, ((data ?? []) as { id: string }[]).map((a) => ({ t: "app_avisos", i: a.id }))) };
}
