import Image from "next/image";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { mascotaParaNegocio, registrarEscaneo, LIMITES, HORAS_EDICION, OFERTA_A_LA } from "@/lib/app/atenciones";
import { fechaLarga, hoyMx } from "@/lib/app/cartilla-util";
import { RegistrarAtencion } from "./registrar";

/**
 * /m/<token>/registrar (público, sin cuenta ni app): la veterinaria, estética u hotel que tiene enfrente a la mascota
 * registra lo que le hizo. Solo ve el nombre, la especie, la raza y la cartilla: nada de su familia.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const m = await mascotaParaNegocio(token);
  return { title: m ? `Registrar atención de ${m.nombre} · PeluDesk` : "PeluDesk", robots: { index: false, follow: false } };
}

export default async function RegistrarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const m = await mascotaParaNegocio(token);
  if (!m) notFound();
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const escaneoId = await registrarEscaneo(m.id, ip);
  const especie = m.especie === "gato" ? "Gato" : m.especie === "perro" ? "Perro" : m.especieDetalle || "Mascota";
  const recientes = m.cartilla.slice(0, 6);
  return (
    <main className="apd-cuerpo" style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))", paddingBottom: "3rem" }}>
      <span className="apd-marca apd-aparece"><Image src="/marca/peludesk/isotipo.svg" alt="" width={24} height={24} unoptimized /> PeluDesk</span>
      <div className="apd-aparece" style={{ marginTop: "1rem" }}>
        <span className="apd-ceja">Registrar atención</span>
        <h1 className="apd-titulo" style={{ marginTop: "0.5rem" }}>{m.nombre}</h1>
        <p className="apd-linea" data-mascota-negocio>{especie}{m.razaTexto ? ` · ${m.razaTexto}` : ""}</p>
        <p className="apd-nota" style={{ marginTop: "0.5rem" }}>Lo que registres le llega a su familia en su cartilla al momento, y el recordatorio de lo que sigue le llega con el nombre y el WhatsApp de tu negocio. No necesitas cuenta.</p>
      </div>
      {recientes.length > 0 && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 1 }}>
          <h2 className="apd-seccion-titulo">Su cartilla</h2>
          <ul className="apd-lista" data-cartilla-negocio>
            {recientes.map((r, i) => (
              <li key={i} className="apd-tarjeta" style={{ padding: "0.8rem 1rem" }}>
                <p style={{ fontWeight: 700 }}>{r.tipo === "vacuna" ? "Vacuna" : "Desparasitación"} · {r.nombre}</p>
                <p className="apd-nota">{r.fecha ? `Aplicada el ${fechaLarga(r.fecha)}` : "Sin fecha"}{r.proxima ? ` · próxima: ${fechaLarga(r.proxima)}` : ""}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 2 }}>
        <RegistrarAtencion token={m.token} escaneoId={escaneoId} mascota={{ nombre: m.nombre, especie: m.especie }} hoy={hoyMx()} reglas={{ horasEdicion: HORAS_EDICION, ofertaA: OFERTA_A_LA, porMascotaAlDia: LIMITES.porMascotaAlDia }} />
      </section>
    </main>
  );
}
