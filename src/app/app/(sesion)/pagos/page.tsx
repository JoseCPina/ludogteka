import Link from "next/link";
import { dinero } from "@/lib/dinero";
import { pagosPendientesApp, abonosDeCuentaApp, datosDeNegociosApp, saldosAFavorApp } from "@/lib/app/negocios";
import { formatearFechaCalendario, formatearFecha } from "@/lib/formato";
import { formasDePago } from "@/lib/pagos/abonos";
import { Pagar } from "./pagar";

/**
 * Pagos pendientes (App para dueños · Fase 3, pantalla 4; cobros parciales, 3 de noviembre de 2026): las cuentas con saldo
 * en cada negocio, con lo que ya pagó (sus abonos: fecha, forma de pago y monto) y «Pagar $saldo», que abre el link de
 * Mercado Pago del negocio por lo que FALTA (nunca el total). El dueño no lee ninguna tabla con dinero: el saldo sale de
 * `mis_pagos_pendientes()` y lo pagado de `mis_abonos()`, las dos sobre la cuenta de Caja. Referencia: bloque
 * checkout-page/order-summary de shadcn/studio y Mobbin app-pagar (BlaBlaCar: el monto en el botón y la nota de seguridad).
 */
export default async function PagosPage() {
  const [pagos, negocios, aFavor] = await Promise.all([pagosPendientesApp(), datosDeNegociosApp(), saldosAFavorApp()]);
  const abonos = await Promise.all(pagos.map((p) => abonosDeCuentaApp(p.negocioId, p.reservaId)));
  return (
    <>
      <Link href="/" className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← Mis mascotas</Link>
      <div className="apd-aparece">
        <span className="apd-ceja" style={{ marginTop: "1rem" }}>Pagos</span>
        <h1 className="apd-titulo">Por pagar</h1>
        <p className="apd-linea">{pagos.length ? "Paga lo que falta desde aquí con el link seguro de cada negocio." : "No tienes nada pendiente de pago."}</p>
      </div>
      {aFavor.length > 0 && (
        <section className="apd-seccion apd-aparece" data-saldos-a-favor>
          <h2 className="apd-seccion-titulo">Saldo a favor</h2>
          <ul className="apd-lista">
            {aFavor.map((p) => (
              <li key={p.reservaId} className="apd-tarjeta" data-saldo-a-favor={p.aFavor.toFixed(2)}>
                <span className="apd-ceja">{p.negocioNombre}</span>
                <p style={{ fontWeight: 800, marginTop: "0.3rem" }}>{p.descripcion}</p>
                <p className="apd-nota">Te tienen que devolver {dinero(p.aFavor)}: se cobró de más. El negocio te lo devuelve.</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {pagos.length > 0 && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 1 }}>
          <ul className="apd-lista" data-pagos-pendientes>
            {pagos.map((p, i) => {
              const a = abonos[i];
              const zona = negocios.get(p.negocioId)?.zona ?? "America/Mexico_City";
              return (
                <li key={p.reservaId} className="apd-tarjeta" data-pago={p.reservaId}>
                  <span className="apd-ceja">{p.negocioNombre}</span>
                  <p style={{ fontWeight: 800, marginTop: "0.3rem" }}>{p.descripcion}</p>
                  <p className="apd-nota">{p.perros}{p.fechaActividad ? ` · ${formatearFechaCalendario(p.fechaActividad)}` : ""}</p>
                  {a && a.pagado > 0.005 && (
                    <dl className="apd-datos" style={{ marginTop: "0.6rem" }} data-resumen-pago>
                      <div className="apd-dato"><dt>Total</dt><dd>{dinero(Number(a.total))}</dd></div>
                      <div className="apd-dato"><dt>Ya pagaste</dt><dd data-pagado>{dinero(Number(a.pagado))}</dd></div>
                    </dl>
                  )}
                  <p style={{ fontWeight: 800, fontSize: "1.35rem", marginTop: "0.5rem" }}>
                    <span className="apd-nota" style={{ fontWeight: 600, fontSize: "0.9rem", display: "block" }}>{a && a.pagado > 0.005 ? "Te falta" : "Por pagar"}</span>
                    <span data-saldo>{dinero(p.saldo)}</span>
                  </p>
                  {a && a.abonos.length > 0 && (
                    <ul style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }} data-abonos>
                      {a.abonos.map((ab, k) => (
                        <li key={k} className="apd-nota apd-fila" style={{ justifyContent: "space-between" }} data-abono>
                          <span>{formatearFecha(ab.fecha, zona)} · {formasDePago(ab.formas, ab.por_link)}</span>
                          <span style={{ fontWeight: 700 }}>{dinero(Number(ab.monto))}</span>
                        </li>
                      ))}
                      {a.devoluciones.map((d, k) => (
                        <li key={`d${k}`} className="apd-nota apd-fila" style={{ justifyContent: "space-between" }} data-devolucion>
                          <span>{formatearFecha(d.fecha, zona)} · Te devolvieron</span>
                          <span style={{ fontWeight: 700 }}>−${Number(d.monto).toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Pagar negocioId={p.negocioId} reservaId={p.reservaId} saldo={p.saldo} linkVivo={p.link && Math.round(p.link.monto * 100) === Math.round(p.saldo * 100) ? p.link.url : null} />
                </li>
              );
            })}
          </ul>
          <p className="apd-nota" style={{ marginTop: "0.75rem" }}>El link cobra solo lo que te falta, en la página de Mercado Pago del negocio. También puedes pagar todo o una parte en el mostrador.</p>
        </section>
      )}
    </>
  );
}
