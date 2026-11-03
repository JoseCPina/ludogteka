import Link from "next/link";
import { pagosPendientesApp } from "@/lib/app/negocios";
import { formatearFechaCalendario } from "@/lib/formato";
import { Pagar } from "./pagar";

/**
 * Pagos pendientes (App para dueños · Fase 3, pantalla 4): las cuentas con saldo en cada negocio (el mismo saldo que
 * ve su Caja) y «Pagar», que abre el link de Mercado Pago del negocio (el que ya hay vivo o uno nuevo). El dueño no lee
 * ninguna tabla con dinero: el saldo sale de `mis_pagos_pendientes()`. Referencia: bloque checkout-page/order-summary
 * de shadcn/studio y Mobbin app-pagar (BlaBlaCar: el monto en el botón y la nota de seguridad).
 */
export default async function PagosPage() {
  const pagos = await pagosPendientesApp();
  return (
    <>
      <Link href="/" className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← Mis mascotas</Link>
      <div className="apd-aparece">
        <span className="apd-ceja" style={{ marginTop: "1rem" }}>Pagos</span>
        <h1 className="apd-titulo">Por pagar</h1>
        <p className="apd-linea">{pagos.length ? "Paga desde aquí con el link seguro de cada negocio." : "No tienes nada pendiente de pago."}</p>
      </div>
      {pagos.length > 0 && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 1 }}>
          <ul className="apd-lista" data-pagos-pendientes>
            {pagos.map((p) => (
              <li key={p.reservaId} className="apd-tarjeta" data-pago={p.reservaId}>
                <span className="apd-ceja">{p.negocioNombre}</span>
                <p style={{ fontWeight: 800, marginTop: "0.3rem" }}>{p.descripcion}</p>
                <p className="apd-nota">{p.perros}{p.fechaActividad ? ` · ${formatearFechaCalendario(p.fechaActividad)}` : ""}</p>
                <p style={{ fontWeight: 800, fontSize: "1.35rem", marginTop: "0.5rem" }} data-saldo>${p.saldo.toFixed(2)}</p>
                <Pagar negocioId={p.negocioId} reservaId={p.reservaId} saldo={p.saldo} linkVivo={p.link?.url ?? null} />
              </li>
            ))}
          </ul>
          <p className="apd-nota" style={{ marginTop: "0.75rem" }}>El pago se hace en la página de Mercado Pago del negocio. Si prefieres, también puedes pagar en el mostrador.</p>
        </section>
      )}
    </>
  );
}
