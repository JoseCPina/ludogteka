import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { mascotaPublica, textoHallazgo } from "@/lib/app/publico";
import { totalEncontradas } from "@/lib/app/perdida";
import { numeroBot } from "@/lib/directorio/reclamo";
import { Hallador } from "./hallador";

/** /m/<token>: el perfil público de la mascota (el QR de la placa). Público, sin sesión; nunca enseña el teléfono del dueño. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const m = await mascotaPublica(token);
  return { title: m ? `${m.nombre} · PeluDesk` : "PeluDesk", robots: { index: false, follow: false }, openGraph: m ? { title: m.perdida ? `Se perdió ${m.nombre}` : m.nombre, description: m.perdida ? `Si la ves, escríbele a su familia desde aquí.` : `La placa de ${m.nombre} con PeluDesk.`, images: m.fotoUrl ? [{ url: m.fotoUrl }] : undefined } : undefined };
}

export default async function PerfilPublicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const m = await mascotaPublica(token);
  if (!m) notFound();
  const encontradas = await totalEncontradas();
  const bot = numeroBot();
  const waUrl = bot ? `https://wa.me/${bot}?text=${encodeURIComponent(textoHallazgo(m.token))}` : null;
  const especie = m.especie === "gato" ? (m.sexo === "hembra" ? "Gata" : "Gato") : m.especie === "perro" ? (m.sexo === "hembra" ? "Perra" : "Perro") : m.especieDetalle || "Mascota";
  return (
    <main className="apd-cuerpo" style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))", paddingBottom: "3rem" }}>
      <span className="apd-marca apd-aparece"><Image src="/marca/peludesk/isotipo.svg" alt="" width={24} height={24} unoptimized /> PeluDesk</span>
      {m.perdida && (
        <div className="apd-aviso apd-aviso-error apd-aparece" role="alert" style={{ marginTop: "1rem", fontWeight: 700 }} data-perdida>
          Su familia la está buscando{m.perdidaNota ? `: se perdió cerca de ${m.perdidaNota}` : ""}. Si la tienes o la viste, escríbeles abajo.
        </div>
      )}
      <div className="apd-bandeja apd-aparece" style={{ marginTop: "1rem", ["--i" as string]: 1 }}>
        <div className="apd-tarjeta" style={{ padding: "0.5rem" }}>
          {m.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.fotoUrl} alt={m.nombre} className="apd-foto-grande" />
          ) : (
            <div className="apd-foto-grande apd-inicial" aria-hidden>{m.nombre[0]?.toUpperCase()}</div>
          )}
          <div style={{ padding: "1rem 0.75rem 0.75rem" }}>
            <span className="apd-ceja">{m.perdida ? "Se perdió" : "Mi placa"}</span>
            <h1 className="apd-titulo" style={{ marginTop: "0.5rem" }}>{m.perdida ? `Soy ${m.nombre}` : `Hola, soy ${m.nombre}`}</h1>
            <p className="apd-linea" style={{ marginTop: "0.25rem" }}>{especie}{m.razaTexto ? ` · ${m.razaTexto}` : ""}{m.duenoNombre ? ` · mi familia es ${m.duenoNombre}` : ""}</p>
          </div>
        </div>
      </div>
      {!m.perdida && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 2 }}>
          <div className="apd-tarjeta" data-entrada-negocio>
            <p style={{ fontWeight: 800 }}>¿Atiendes a {m.nombre}?</p>
            <p className="apd-nota" style={{ marginTop: "0.3rem" }}>Si eres veterinaria, estética u hotel, registra su vacuna, su baño o su estancia: le llega a su familia en su cartilla, con tu WhatsApp para agendar. Sin cuenta ni app.</p>
            <a href={`/m/${m.token}/registrar`} className="apd-boton" style={{ marginTop: "0.9rem" }} data-registrar-atencion>Registrar atención</a>
          </div>
        </section>
      )}
      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 3 }}>
        <Hallador token={m.token} nombre={m.nombre} waUrl={waUrl} />
      </section>
      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 4 }}>
        <div className="apd-tarjeta" style={{ background: "var(--apd-menta-suave)", boxShadow: "none" }}>
          <p style={{ fontWeight: 800 }}>Si la tienes contigo</p>
          <p className="apd-nota" style={{ marginTop: "0.35rem", color: "var(--apd-tinta-2)" }}>Dale agua, mantenla en un lugar tranquilo y, si puedes, llévala a una veterinaria cercana: ahí pueden leer su chip. {encontradas > 0 ? `Con PeluDesk ya han vuelto a casa ${encontradas} ${encontradas === 1 ? "mascota" : "mascotas"}.` : ""}</p>
        </div>
        <p className="apd-nota" style={{ marginTop: "1rem" }}>¿Tienes mascotas? <a href="/entrar" className="apd-enlace">Ten su cartilla y su QR gratis en PeluDesk</a>.</p>
      </section>
    </main>
  );
}
