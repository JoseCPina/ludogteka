import Link from "next/link";
import { notFound } from "next/navigation";
import { miMascota } from "@/lib/app/datos";
import { cartillaDe, proximas, fechaLarga } from "@/lib/app/cartilla";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { serviciosApp, datosDeNegociosApp } from "@/lib/app/negocios";
import { hoyNegocio, sumarDiasFecha } from "@/lib/formato";
import { IconoFlechaArriba, IconoWhatsApp } from "@/components/app/iconos";
import { PedirCita, type NegocioCita } from "./pedir-cita";

const DIAS_A_LA_VISTA = 14;

/**
 * Pedir cita (App para dueños · Fase 3, pantalla 6; docs/app-duenos/FASE-3.md). En los negocios con PeluDesk donde la
 * mascota tiene expediente y hay servicios de estética: servicio → día → hora libre → «Pedir la cita», con el precio y
 * quién la atiende al confirmar (la base pone los dos). Abajo, como siempre, el WhatsApp de cada negocio con el mensaje
 * listo (y el de los negocios que registraron una atención con el QR). Referencia: Mobbin app-reservar-fecha-cupo
 * (Fresha) y el bloque multi-step-form de shadcn/studio.
 */
export default async function CitaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ negocio?: string }> }) {
  const { id } = await params;
  const { negocio: negocioPedido } = await searchParams;
  const m = await miMascota(id);
  if (!m) notFound();
  const [registros, datosNegocios] = await Promise.all([cartillaDe(m.id), datosDeNegociosApp()]);
  const toca = proximas(registros).filter((r) => r.proximaDosis).slice(0, 3);
  const que = toca.length ? toca.map((r) => `${r.tipo === "vacuna" ? "la vacuna" : "la desparasitación"} ${r.nombre} (${fechaLarga(r.proximaDosis!)})`).join(", ") : "su próxima visita";

  // Los negocios con PeluDesk donde se puede pedir en línea: los que tienen servicios de estética.
  const enLinea: NegocioCita[] = (
    await Promise.all(
      m.vinculos.map(async (v) => {
        const servicios = (await serviciosApp(v.negocioId)).filter((s) => s.categoria === "estetica");
        if (servicios.length === 0) return null;
        const zona = datosNegocios.get(v.negocioId)?.zona ?? "America/Mexico_City";
        const hoy = hoyNegocio(zona);
        return {
          id: v.negocioId,
          nombre: v.negocioNombre,
          zona,
          dias: Array.from({ length: DIAS_A_LA_VISTA }, (_, i) => sumarDiasFecha(hoy, i)),
          servicios: servicios.map((s) => ({ id: s.id, nombre: s.nombre, duracionMinutos: s.duracionMinutos, incluye: s.incluye })),
        };
      })
    )
  ).filter((n): n is NegocioCita => n !== null);

  // Por WhatsApp: los negocios con PeluDesk (su número de la página) y los que registraron una atención con el QR (Fase 2).
  const porWhatsApp: { nombre: string; wa: string | null; url: string; qr?: boolean }[] = [];
  const { data: ats } = await createSupabaseAdminClient().from("app_atenciones").select("negocio_nombre, negocio_whatsapp").eq("mascota_id", m.id).is("deleted_at", null).is("oculto_at", null).order("created_at", { ascending: false }).limit(20);
  const vistos = new Set<string>();
  for (const a of (ats ?? []) as { negocio_nombre: string; negocio_whatsapp: string }[]) {
    if (vistos.has(a.negocio_whatsapp)) continue;
    vistos.add(a.negocio_whatsapp);
    porWhatsApp.push({ nombre: a.negocio_nombre, wa: a.negocio_whatsapp.length === 10 ? `52${a.negocio_whatsapp}` : a.negocio_whatsapp, url: "", qr: true });
  }
  for (const v of m.vinculos) porWhatsApp.push({ nombre: v.negocioNombre, wa: datosNegocios.get(v.negocioId)?.whatsapp ?? null, url: v.portalUrl.replace(/\/portal\/perros\/.*$/, "/portal") });
  const mensaje = `Hola, soy ${m.sexo === "hembra" ? "la dueña" : "el dueño"} de ${m.nombre}. Quiero agendar cita para ${que}. ¿Qué día tienen lugar?`;

  return (
    <>
      <Link href={`/mascotas/${m.id}`} className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← {m.nombre}</Link>
      <div className="apd-aparece">
        <span className="apd-ceja" style={{ marginTop: "1rem" }}>Pedir cita</span>
        <h1 className="apd-titulo">Cita para {m.nombre}</h1>
        <p className="apd-linea">
          {enLinea.length > 0
            ? "Escoge el servicio, el día y la hora: solo salen las horas que de verdad están libres."
            : toca.length
              ? `Le toca ${que}.`
              : "Pide su cita donde ya la conocen o en una veterinaria cerca."}
        </p>
      </div>

      {enLinea.length > 0 && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 1 }} data-pedir-en-linea>
          <PedirCita mascotaId={m.id} nombre={m.nombre} negocios={enLinea} negocioInicial={enLinea.some((n) => n.id === negocioPedido) ? negocioPedido! : enLinea[0].id} />
        </section>
      )}

      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 2 }}>
        {enLinea.length > 0 && <h2 className="apd-seccion-titulo">¿Prefieres escribirles?</h2>}
        {porWhatsApp.length > 0 ? (
          <ul className="apd-lista">
            {porWhatsApp.map((n) => (
              <li key={`${n.nombre}-${n.wa}`} className="apd-tarjeta" data-cita-negocio={n.qr ? "qr" : ""}>
                <p style={{ fontWeight: 800 }}>{n.nombre}</p>
                <p className="apd-nota">{n.qr ? `Registraron la última atención de ${m.nombre}. Escríbeles con el mensaje listo.` : `Ya conocen a ${m.nombre}. Escríbeles con el mensaje listo.`}</p>
                <div className="apd-fila" style={{ marginTop: "0.75rem", flexWrap: "wrap" }}>
                  {n.wa ? (
                    <a href={`https://wa.me/${n.wa}?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noopener noreferrer" className={enLinea.length > 0 ? "apd-boton-sec" : "apd-boton"}><IconoWhatsApp style={{ width: 20, height: 20 }} /> Pedir cita por WhatsApp</a>
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
