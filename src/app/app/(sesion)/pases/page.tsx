import Link from "next/link";
import { pasesApp } from "@/lib/app/negocios";
import { formatearFechaCalendario } from "@/lib/formato";

/**
 * Pases y saldo (App para dueños · Fase 3, pantalla 5): los paquetes de guardería u otros servicios que compró, cuántos
 * le quedan y hasta cuándo. Sin lo que pagó (`mis_pases()` no lo devuelve). Referencia: bloque gift-card de
 * shadcn/studio y Mobbin app-pagar (Warby Parker: «aplicar beneficios»).
 */
export default async function PasesPage() {
  const pases = await pasesApp();
  // bonos_clientes_estado: activo, agotado, vencido o cancelado.
  const activos = pases.filter((p) => p.estado === "activo");
  const otros = pases.filter((p) => !activos.includes(p));
  const Tarjeta = ({ p }: { p: (typeof pases)[number] }) => {
    const usados = p.cantidadTotal - p.cantidadDisponible;
    const avance = p.ilimitado || p.cantidadTotal <= 0 ? 0 : Math.min(100, Math.round((usados / p.cantidadTotal) * 100));
    return (
      <li className="apd-tarjeta" data-pase={p.id} data-estado-pase={p.estado}>
        <div className="apd-fila" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <span className="apd-ceja">{p.negocioNombre}</span>
          {p.perroNombre && <span className="apd-chip">{p.perroNombre}</span>}
        </div>
        <p style={{ fontWeight: 800, marginTop: "0.3rem" }}>{p.servicioNombre}</p>
        {p.servicioIncluidoNombre && <p className="apd-nota">Incluye: {p.servicioIncluidoNombre}</p>}
        <p style={{ fontWeight: 800, fontSize: "1.35rem", marginTop: "0.5rem" }} data-quedan>
          {p.ilimitado ? "Ilimitado" : `${p.cantidadDisponible} de ${p.cantidadTotal}`}
          {!p.ilimitado && <span className="apd-nota" style={{ fontWeight: 600, fontSize: "0.9rem" }}> {p.cantidadDisponible === 1 ? "le queda" : "le quedan"}</span>}
        </p>
        {!p.ilimitado && (
          <div aria-hidden style={{ height: 8, borderRadius: 999, background: "var(--apd-morado-suave)", marginTop: "0.4rem", overflow: "hidden" }}>
            <div style={{ width: `${100 - avance}%`, height: "100%", background: "var(--apd-morado)" }} />
          </div>
        )}
        <p className="apd-nota" style={{ marginTop: "0.5rem" }}>
          Comprado el {formatearFechaCalendario(p.fechaCompra)}
          {p.fechaVencimiento ? ` · vence el ${formatearFechaCalendario(p.fechaVencimiento)}` : " · sin vencimiento"}
        </p>
      </li>
    );
  };
  return (
    <>
      <Link href="/" className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← Mis mascotas</Link>
      <div className="apd-aparece">
        <span className="apd-ceja" style={{ marginTop: "1rem" }}>Pases</span>
        <h1 className="apd-titulo">Tus pases</h1>
        <p className="apd-linea">{pases.length ? "Cuántos días o servicios te quedan en cada negocio. Se usan solos al reservar." : "No tienes pases. Cuando compres un paquete en un negocio, aparece aquí."}</p>
      </div>
      {activos.length > 0 && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 1 }}>
          <ul className="apd-lista" data-pases-activos>{activos.map((p) => <Tarjeta key={p.id} p={p} />)}</ul>
        </section>
      )}
      {otros.length > 0 && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 2 }}>
          <h2 className="apd-seccion-titulo">Terminados o vencidos</h2>
          <ul className="apd-lista">{otros.map((p) => <Tarjeta key={p.id} p={p} />)}</ul>
        </section>
      )}
    </>
  );
}
