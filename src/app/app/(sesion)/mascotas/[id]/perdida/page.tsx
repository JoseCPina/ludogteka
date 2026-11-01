import Link from "next/link";
import { notFound } from "next/navigation";
import { miMascota } from "@/lib/app/datos";
import { sesionApp } from "@/lib/app/sesion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { urlApp } from "@/lib/negocio/host";
import { formatearFecha, horaLocalDeInstante } from "@/lib/formato";
import { Perdida, type Mensaje } from "./perdida";

export default async function PerdidaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [m, s] = await Promise.all([miMascota(id), sesionApp()]);
  if (!m) notFound();
  const supabase = await createSupabaseServerClient("portal");
  const { data } = await supabase.rpc("app_mensajes_de", { p_mascota: m.id });
  const zona = "America/Mexico_City";
  const mensajes: Mensaje[] = ((data ?? []) as Record<string, unknown>[]).map((x) => ({
    id: x.id as string, de: x.de as "hallador" | "dueno", texto: x.texto as string, halladorNombre: (x.hallador_nombre as string | null) ?? null, entregadoAt: (x.entregado_at as string | null) ?? null,
    cuando: `${formatearFecha(x.created_at as string, zona)} ${horaLocalDeInstante(x.created_at as string, zona)}`,
  }));
  const perdida = Boolean(m.perdidaAt && !m.encontradaAt);
  return (
    <>
      <Link href={`/mascotas/${m.id}`} className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← {m.nombre}</Link>
      <div className="apd-aparece">
        <span className="apd-ceja" style={{ marginTop: "1rem", ...(perdida ? { background: "var(--apd-coral-suave)", color: "var(--apd-coral-oscuro)" } : {}) }}>{perdida ? "Perdida" : "Si se pierde"}</span>
        <h1 className="apd-titulo">{perdida ? `Buscando a ${m.nombre}` : `¿Se perdió ${m.nombre}?`}</h1>
        <p className="apd-linea">{perdida ? "Comparte el cartel, revisa los mensajes y, en cuanto aparezca, márcalo con un toque." : "Un toque avisa a la gente de la app cerca y a los negocios PeluDesk de la zona. Y su QR ya trabaja por ti."}</p>
      </div>
      <section className="apd-seccion">
        <Perdida mascotaId={m.id} nombre={m.nombre} perdida={perdida} perdidaNota={m.perdidaNota} urlPublica={`${urlApp()}/m/${m.tokenPublico}`} urlCartel={`/m/${m.tokenPublico}/cartel`} mensajes={mensajes} zonaGuardada={s?.dueno.lat != null} />
      </section>
    </>
  );
}
