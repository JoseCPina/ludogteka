import Link from "next/link";
import { notFound } from "next/navigation";
import { miMascota } from "@/lib/app/datos";
import { cartillaDe, proximas, fechaLarga } from "@/lib/app/cartilla";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { IconoFlechaArriba, IconoWhatsApp } from "@/components/app/iconos";

/**
 * «Pedir cita» desde un recordatorio: si la mascota tiene expediente en un negocio con PeluDesk, el WhatsApp de ese
 * negocio (con el mensaje listo); si no, las veterinarias cercanas. Agendar en línea con disponibilidad real llega en
 * la Fase 3.
 */
export default async function CitaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await miMascota(id);
  if (!m) notFound();
  const registros = await cartillaDe(m.id);
  const toca = proximas(registros).filter((r) => r.proximaDosis).slice(0, 3);
  const que = toca.length ? toca.map((r) => `${r.tipo === "vacuna" ? "la vacuna" : "la desparasitación"} ${r.nombre} (${fechaLarga(r.proximaDosis!)})`).join(", ") : "su próxima vacuna";
  const negocios: { nombre: string; wa: string | null; url: string; qr?: boolean }[] = [];
  // Fase 2: los negocios que registraron una atención con el QR (sin PeluDesk todavía): su WhatsApp, el más reciente primero.
  const { data: ats } = await createSupabaseAdminClient().from("app_atenciones").select("negocio_nombre, negocio_whatsapp").eq("mascota_id", m.id).is("deleted_at", null).is("oculto_at", null).order("created_at", { ascending: false }).limit(20);
  const vistos = new Set<string>();
  for (const a of (ats ?? []) as { negocio_nombre: string; negocio_whatsapp: string }[]) {
    if (vistos.has(a.negocio_whatsapp)) continue;
    vistos.add(a.negocio_whatsapp);
    negocios.push({ nombre: a.negocio_nombre, wa: a.negocio_whatsapp, url: "", qr: true });
  }
  for (const v of m.vinculos) {
    const { data: n } = await createSupabaseAdminClient().from("negocios").select("landing").eq("id", v.negocioId).maybeSingle();
    const landing = (n?.landing ?? {}) as { telefono_wa?: string | null };
    const wa = landing.telefono_wa?.replace(/\D/g, "") || null;
    negocios.push({ nombre: v.negocioNombre, wa, url: v.portalUrl.replace(/\/portal\/perros\/.*$/, "/portal") });
  }
  const mensaje = `Hola, soy ${m.sexo === "hembra" ? "la dueña" : "el dueño"} de ${m.nombre}. Quiero agendar cita para ${que}. ¿Qué día tienen lugar?`;
  return (
    <>
      <Link href={`/mascotas/${m.id}`} className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← {m.nombre}</Link>
      <div className="apd-aparece">
        <span className="apd-ceja" style={{ marginTop: "1rem" }}>Pedir cita</span>
        <h1 className="apd-titulo">Cita para {m.nombre}</h1>
        <p className="apd-linea">{toca.length ? `Le toca ${que}.` : "Pide su cita donde ya la conocen o en una veterinaria cerca."}</p>
      </div>
      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 1 }}>
        {negocios.length > 0 ? (
          <ul className="apd-lista">
            {negocios.map((n) => (
              <li key={`${n.nombre}-${n.wa}`} className="apd-tarjeta" data-cita-negocio={n.qr ? "qr" : ""}>
                <p style={{ fontWeight: 800 }}>{n.nombre}</p>
                <p className="apd-nota">{n.qr ? `Registraron la última atención de ${m.nombre}. Escríbeles con el mensaje listo.` : `Ya conocen a ${m.nombre}. Escríbeles con el mensaje listo.`}</p>
                <div className="apd-fila" style={{ marginTop: "0.75rem", flexWrap: "wrap" }}>
                  {n.wa ? (
                    <a href={`https://wa.me/${n.wa.length === 10 ? `52${n.wa}` : n.wa}?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noopener noreferrer" className="apd-boton"><IconoWhatsApp style={{ width: 20, height: 20 }} /> Pedir cita por WhatsApp</a>
                  ) : (
                    <a href={n.url} target="_blank" rel="noopener" className="apd-boton-sec">Abrir su portal <IconoFlechaArriba style={{ width: 18, height: 18 }} /></a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="apd-tarjeta">
            <p style={{ fontWeight: 800 }}>Todavía ningún negocio con PeluDesk conoce a {m.nombre}</p>
            <p className="apd-nota" style={{ marginTop: "0.3rem" }}>Busca una veterinaria cerca de ti y escríbele; cuando alguna use PeluDesk, su cita se pide desde aquí con un toque.</p>
            <Link href="/cerca" className="apd-boton" style={{ marginTop: "0.9rem" }}>Ver veterinarias cerca</Link>
          </div>
        )}
      </section>
    </>
  );
}
