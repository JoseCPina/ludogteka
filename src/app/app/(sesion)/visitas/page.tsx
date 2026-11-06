import Link from "next/link";
import { visitasApp, datosDeNegociosApp, misResenasApp, solicitudesApp } from "@/lib/app/negocios";
import { MisSolicitudes } from "./mis-solicitudes";
import { formatearDiaDeInstante, horaLocalDeInstante, formatearFechaCalendario } from "@/lib/formato";
import { ListaVisitas, type VisitaVista } from "./lista-visitas";

/**
 * Mis visitas (App para dueños · Fase 3, pantalla 1; docs/app-duenos/FASE-3.md): las citas de estética y las estancias
 * de guardería y hotel de sus mascotas en cada negocio con PeluDesk. Las que vienen se confirman en un toque; las
 * terminadas se califican una vez. Referencia: bloque card-nav de shadcn/studio y Mobbin app-registro-vet-qr
 * («Acción requerida» antes de la cita, Fresha).
 */
export default async function VisitasPage() {
  const [visitas, negocios, calificadas, solicitudes] = await Promise.all([visitasApp(), datosDeNegociosApp(), misResenasApp(), solicitudesApp()]);
  const vista: VisitaVista[] = visitas.map((v) => {
    const zona = negocios.get(v.negocioId)?.zona ?? "America/Mexico_City";
    const cuando =
      v.tipo === "estetica" && v.inicio
        ? `${formatearDiaDeInstante(v.inicio, zona)} · ${horaLocalDeInstante(v.inicio, zona)}`
        : v.fechaEntrada
          ? v.fechaSalida && v.fechaSalida !== v.fechaEntrada
            ? `Del ${formatearFechaCalendario(v.fechaEntrada)} al ${formatearFechaCalendario(v.fechaSalida)}`
            : formatearFechaCalendario(v.fechaEntrada)
          : "Sin fecha";
    return {
      tipo: v.tipo,
      id: v.id,
      negocioId: v.negocioId,
      negocioNombre: v.negocioNombre,
      perroNombre: v.perroNombre,
      servicioNombre: v.servicioNombre,
      cuando,
      estado: v.estado,
      puedeConfirmar: v.puedeConfirmar,
      puedeResenar: v.puedeResenar && !calificadas.has(v.id),
      calificada: calificadas.has(v.id),
      proxima: ["reservada", "confirmada", "en_curso"].includes(v.estado),
    };
  });
  const proximas = vista.filter((v) => v.proxima).reverse();
  const pasadas = vista.filter((v) => !v.proxima && v.estado === "finalizada").slice(0, 20);
  return (
    <>
      <Link href="/" className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← Mis mascotas</Link>
      <div className="apd-aparece">
        <span className="apd-ceja" style={{ marginTop: "1rem" }}>Mis visitas</span>
        <h1 className="apd-titulo">Citas y estancias</h1>
        <p className="apd-linea">Lo que tienes agendado en cada negocio. Confírmalo con un toque y, cuando termine, cuéntanos cómo te fue.</p>
      </div>
      <MisSolicitudes solicitudes={solicitudes} />
      {vista.length === 0 ? (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 1 }}>
          <div className="apd-vacio" data-sin-visitas>
            <p style={{ fontWeight: 800, fontSize: "1.125rem" }}>Todavía no hay visitas</p>
            <p className="apd-nota" style={{ marginTop: "0.5rem" }}>Pide una cita o reserva desde la ficha de tu mascota, en el negocio donde ya la conocen.</p>
          </div>
        </section>
      ) : (
        <ListaVisitas proximas={proximas} pasadas={pasadas} />
      )}
    </>
  );
}
