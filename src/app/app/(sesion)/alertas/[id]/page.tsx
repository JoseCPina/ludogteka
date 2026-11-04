import Link from "next/link";
import { notFound } from "next/navigation";
import { detalleAlerta, queVieron } from "@/lib/movil/alertas";
import { formatearFecha, horaLocalDeInstante } from "@/lib/formato";
import { AppNativaInvitacion } from "@/components/app/app-nativa-invitacion";

const ESTADO: Record<string, string> = { sigue_ahi: "Sigue ahí", ya_no_esta: "Ya no está", rescatado: "Lo rescataron", reunido: "Ya está con su familia", caducada: "Ya no está activa" };
const ZONA = "America/Mexico_City";

/**
 * Una alerta de la calle en la web (Fase 5): lo que llega a quien no tiene la app nativa (el aviso o el link por
 * WhatsApp). Solo lectura: la foto, qué le pasa, cuándo y dónde (con «Cómo llegar») y sus actualizaciones; para
 * actualizarla o escribirle a quien la subió, la app nativa.
 */
export default async function AlertaWeb({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await detalleAlerta(id);
  if (!r) notFound();
  const a = r.alerta as unknown as { tipo: string; especie: string; descripcion: string | null; color: string | null; estado: string; created_at: string; lat: number; lng: number; fotoUrl: string | null; actualizaciones: { id: string; texto: string | null; estado: string | null; created_at: string; fotoUrl: string | null }[] };
  return (
    <>
      <Link href="/" className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← Mis mascotas</Link>
      <div className="apd-aparece" data-alerta-web={id}>
        <h1 className="apd-titulo" style={{ marginTop: "1rem" }}>Vieron {queVieron(a.tipo, a.especie)}</h1>
        <p className="apd-linea">{ESTADO[a.estado] ?? a.estado} · {formatearFecha(a.created_at, ZONA)} {horaLocalDeInstante(a.created_at, ZONA)}</p>
      </div>
      {a.fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.fotoUrl} alt={`Foto de la alerta: ${queVieron(a.tipo, a.especie)}`} style={{ width: "100%", borderRadius: 20, marginTop: "1rem", objectFit: "cover", maxHeight: 420 }} />
      ) : null}
      <section className="apd-seccion apd-aparece">
        {a.descripcion ? <p>{a.descripcion}</p> : null}
        {a.color ? <p className="apd-nota">Color: {a.color}</p> : null}
        <a className="apd-boton" style={{ marginTop: "0.75rem" }} href={`https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`} target="_blank" rel="noopener noreferrer">Cómo llegar</a>
      </section>
      {a.actualizaciones.length ? (
        <section className="apd-seccion apd-aparece">
          <h2 className="apd-seccion-titulo">Actualizaciones</h2>
          <ul className="apd-lista">
            {a.actualizaciones.map((u) => (
              <li key={u.id} className="apd-tarjeta">
                {u.estado ? <span className="apd-chip">{ESTADO[u.estado] ?? u.estado}</span> : null}
                {u.texto ? <p style={{ marginTop: "0.3rem" }}>{u.texto}</p> : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {u.fotoUrl ? <img src={u.fotoUrl} alt="" style={{ width: "100%", borderRadius: 14, marginTop: "0.5rem" }} /> : null}
                <p className="apd-nota">{formatearFecha(u.created_at, ZONA)} {horaLocalDeInstante(u.created_at, ZONA)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <AppNativaInvitacion motivo="Para actualizar esta alerta, subir una foto o escribirle a quien la subió, usa la app PeluDesk." />
    </>
  );
}
