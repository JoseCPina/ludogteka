"use client";
import { dinero } from "@/lib/dinero";

import Link from "next/link";
import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { incluyeEnLinea } from "@/lib/app/texto-servicio";
import { cupoApp, pedirLugarApp, reservarApp, revisarReservaApp, type RevisionReserva } from "../../../negocios/acciones";
import { RequisitosReserva } from "@/components/app/requisitos-reserva";
import { FirmarContratoApp } from "@/components/app/firmar-contrato-app";
import { nombreDeContrato } from "@/lib/app/contratos-texto";
import type { DisponibilidadEstancia } from "@/lib/app/negocios";

export type NegocioReserva = {
  id: string;
  nombre: string;
  hoy: string;
  servicios: { id: string; nombre: string; categoria: string; unidad: string; incluye: string[] | string | null }[];
};

// El total y el saldo son los de la CUENTA (cuenta_totales_reserva, la misma de Caja y del panel), nunca precio × noches.
type Hecha = { negocioId: string; negocio: string; servicio: string; fechas: string; total: number | null; saldo: number | null; conPase: boolean; contratos: { id: string; tipo_nombre: string }[] };

const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", ...o }).format(new Date(`${d}T12:00:00Z`));
const corto = (d: string) => fmt(d, { weekday: "short", day: "numeric", month: "short" });
function sumarDias(d: string, n: number): string {
  const f = new Date(`${d}T12:00:00Z`);
  f.setUTCDate(f.getUTCDate() + n);
  return f.toISOString().slice(0, 10);
}
const noches = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** Servicio → fechas → cupo real → reservar → contrato (si falta). */
export function Reservar({ mascotaId, nombre, negocios, negocioInicial }: { mascotaId: string; nombre: string; negocios: NegocioReserva[]; negocioInicial: string }) {
  const [negocioId, setNegocioId] = useState(negocioInicial);
  const negocio = negocios.find((n) => n.id === negocioId) ?? negocios[0];
  const [servicioId, setServicioId] = useState<string | null>(negocio.servicios.length === 1 ? negocio.servicios[0].id : null);
  const servicio = negocio.servicios.find((s) => s.id === servicioId) ?? null;
  const porNoche = servicio?.unidad === "noche";
  const porHora = servicio?.unidad === "hora";
  const [entrada, setEntrada] = useState("");
  const [salida, setSalida] = useState("");
  const [horas, setHoras] = useState(4);
  const [cupo, setCupo] = useState<DisponibilidadEstancia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecha, setHecha] = useState<Hecha | null>(null);
  const [revision, setRevision] = useState<RevisionReserva | null>(null);
  const [pedido, setPedido] = useState(false);
  const consulta = useEspera();
  const envio = useEspera();

  // Guardería por día u hora: un solo día (la base lo guarda como entrada y salida al día siguiente).
  const salidaReal = porNoche ? salida : entrada ? sumarDias(entrada, 1) : "";
  const fechasListas = Boolean(entrada && salidaReal && salidaReal > entrada);

  function reiniciar() {
    setRevision(null);
    setCupo(null);
    setError(null);
  }

  async function verCupo() {
    if (!servicio || !fechasListas) return;
    reiniciar();
    const r = await consulta.ejecutar(() => cupoApp(negocio.id, servicio.id, entrada, salidaReal));
    if (r.error || !r.datos) return setError(r.error ?? "No pudimos ver el cupo.");
    setCupo(r.datos);
    await revisar();
  }

  async function revisar() {
    if (!servicio || !fechasListas) return;
    const q = await consulta.ejecutar(() => revisarReservaApp(negocio.id, mascotaId, servicio.id, entrada, salidaReal, porHora ? horas : null, null));
    if (q.error) return setError(q.error);
    setRevision(q.datos ?? null);
  }

  async function pedirLugar() {
    if (!servicio || !fechasListas) return;
    setError(null);
    const r = await envio.ejecutar(() => pedirLugarApp(negocio.id, mascotaId, servicio.id, entrada, salidaReal, porHora ? horas : null, null));
    if (r.error) return setError(r.error);
    setPedido(true);
  }

  async function reservar() {
    if (!servicio || !fechasListas) return;
    setError(null);
    const r = await envio.ejecutar(() => reservarApp(negocio.id, mascotaId, servicio.id, entrada, salidaReal, porHora ? horas : null));
    if (r.error) {
      setError(r.error);
      await revisar();
      return;
    }
    const d = (r.datos ?? {}) as { precio_total?: number | null; saldo?: number | null; cubierto_con_pase?: number | null; bono?: unknown; contratos_por_firmar?: { id: string; tipo_nombre: string }[] };
    setHecha({
      negocioId: negocio.id,
      negocio: negocio.nombre,
      servicio: servicio.nombre,
      fechas: porNoche ? `Del ${corto(entrada)} al ${corto(salidaReal)} · ${noches(entrada, salidaReal)} ${noches(entrada, salidaReal) === 1 ? "noche" : "noches"}` : `${corto(entrada)}${porHora ? ` · ${horas} h` : ""}`,
      total: d.precio_total == null ? null : Number(d.precio_total),
      saldo: d.saldo == null ? null : Number(d.saldo),
      conPase: Boolean(d.bono) || Number(d.cubierto_con_pase ?? 0) > 0,
      contratos: d.contratos_por_firmar ?? [],
    });
  }

  if (pedido) {
    return (
      <div className="apd-opciones" data-lugar-pedido>
        <div className="apd-resumen" role="status">
          <span style={{ fontWeight: 800, fontSize: "1.1rem" }}>Listo, pediste su lugar</span>
          <span>{negocio.nombre} lo revisa y te avisa aquí. Todavía no se cobra ni se aparta. Si no contesta en 3 días, la solicitud caduca y te avisamos.</span>
        </div>
        <div className="apd-fila" style={{ flexWrap: "wrap" }}>
          <Link href="/visitas" className="apd-boton">Ver mis solicitudes</Link>
          <Link href={`/mascotas/${mascotaId}`} className="apd-boton-sec">Volver a {nombre}</Link>
        </div>
      </div>
    );
  }

  if (hecha) {
    return (
      <div className="apd-opciones" data-reserva-hecha>
        <div className="apd-resumen" role="status">
          <span style={{ fontWeight: 800, fontSize: "1.1rem" }}>¡Reservado! {nombre} tiene su lugar</span>
          <span>{hecha.servicio} en {hecha.negocio}</span>
          <span>{hecha.fechas}</span>
          {hecha.conPase && <span data-con-pase>Se usó su pase</span>}
          {hecha.total != null && !hecha.conPase && <span data-total>Total: {dinero(hecha.total)}</span>}
          {hecha.saldo != null && hecha.saldo > 0 && <span data-saldo>Por pagar: {dinero(hecha.saldo)}</span>}
        </div>
        {hecha.contratos.length > 0 && (
          <div className="apd-tarjeta" data-contratos-reserva>
            <p style={{ fontWeight: 800 }}>Falta un paso: {hecha.contratos.length === 1 ? "su contrato" : "sus contratos"}</p>
            <p className="apd-nota" style={{ marginTop: "0.3rem" }}>{hecha.negocio} pide firmar antes de la primera estancia. Léelo y fírmalo aquí mismo.</p>
            {hecha.contratos.map((c) => (
              <div key={c.id} style={{ marginTop: "0.9rem" }}>
                <p className="apd-ceja">{nombreDeContrato(c.tipo_nombre)}</p>
                <FirmarContratoApp negocioId={hecha.negocioId} contratoId={c.id} tipoNombre={c.tipo_nombre} />
              </div>
            ))}
          </div>
        )}
        <div className="apd-fila" style={{ flexWrap: "wrap" }}>
          <Link href="/visitas" className="apd-boton" data-ir-visitas>Ver mis visitas</Link>
          <Link href={`/mascotas/${mascotaId}`} className="apd-boton-sec">Volver a {nombre}</Link>
        </div>
      </div>
    );
  }

  const maximo = sumarDias(negocio.hoy, 60);
  return (
    <div className="apd-opciones" data-reservar>
      {negocios.length > 1 && (
        <>
          <p className="apd-etiqueta">¿Dónde?</p>
          <div className="apd-tabs">
            {negocios.map((n) => (
              <button
                key={n.id}
                type="button"
                className="apd-tab"
                aria-pressed={n.id === negocio.id}
                onClick={() => {
                  setNegocioId(n.id);
                  setServicioId(n.servicios.length === 1 ? n.servicios[0].id : null);
                  reiniciar();
                }}
                data-negocio-reserva={n.id}
              >
                {n.nombre}
              </button>
            ))}
          </div>
        </>
      )}

      <p className="apd-etiqueta" style={{ marginTop: "0.5rem" }}>1. ¿Qué servicio?</p>
      {negocio.servicios.map((s) => (
        <button
          key={s.id}
          type="button"
          className="apd-opcion"
          aria-pressed={s.id === servicioId}
          onClick={() => {
            setServicioId(s.id);
            reiniciar();
          }}
          data-servicio-reserva={s.id}
        >
          <span>
            {s.nombre}
            {incluyeEnLinea(s.incluye) && <span className="apd-nota" style={{ display: "block", fontWeight: 500 }}>{incluyeEnLinea(s.incluye)}</span>}
          </span>
          <span className="apd-chip apd-chip-neutro" style={{ flex: "none" }}>{s.categoria === "hotel" ? "Hotel" : "Guardería"}</span>
        </button>
      ))}

      {servicio && (
        <>
          <p className="apd-etiqueta" style={{ marginTop: "0.75rem" }}>2. {porNoche ? "¿Cuándo llega y cuándo se va?" : "¿Qué día?"}</p>
          <div className="apd-fila" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
            <label className="apd-etiqueta" style={{ flex: "1 1 9rem" }}>
              {porNoche ? "Llega" : "Día"}
              <input
                type="date"
                className="apd-campo"
                min={negocio.hoy}
                max={maximo}
                value={entrada}
                onChange={(e) => {
                  setEntrada(e.target.value);
                  if (salida && salida <= e.target.value) setSalida("");
                  reiniciar();
                }}
                data-entrada
              />
            </label>
            {porNoche && (
              <label className="apd-etiqueta" style={{ flex: "1 1 9rem" }}>
                Se va
                <input
                  type="date"
                  className="apd-campo"
                  min={entrada ? sumarDias(entrada, 1) : sumarDias(negocio.hoy, 1)}
                  max={maximo}
                  value={salida}
                  onChange={(e) => {
                    setSalida(e.target.value);
                    reiniciar();
                  }}
                  data-salida
                />
              </label>
            )}
            {porHora && (
              <label className="apd-etiqueta" style={{ flex: "1 1 7rem" }}>
                Horas
                <input type="number" inputMode="numeric" className="apd-campo" min={1} max={12} value={horas} onChange={(e) => setHoras(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} data-horas />
              </label>
            )}
          </div>
          {fechasListas && porNoche && <p className="apd-nota">{noches(entrada, salidaReal)} {noches(entrada, salidaReal) === 1 ? "noche" : "noches"}</p>}
          {fechasListas && !cupo && (
            <button type="button" className="apd-boton-sec" aria-busy={consulta.cargando || undefined} disabled={consulta.cargando} onClick={verCupo} data-ver-cupo>
              {consulta.cargando ? "Viendo el cupo…" : "Ver si hay lugar"}
            </button>
          )}
        </>
      )}

      {cupo && (
        <>
          <p className="apd-etiqueta" style={{ marginTop: "0.75rem" }}>3. Lugar {porNoche ? "por noche" : "ese día"}</p>
          <div className="apd-noches" data-cupo>
            {cupo.dias.map((d) => {
              const lleno = !d.abre || (d.cupo != null && d.disponible <= 0);
              return (
                <div key={d.fecha} className="apd-noche" data-lleno={lleno ? "si" : "no"} data-dia-cupo={d.fecha}>
                  <span>{corto(d.fecha)}</span>
                  <span>{!d.abre ? "Cerrado" : d.cupo == null ? "Hay lugar" : d.disponible <= 0 ? "Lleno" : `${d.disponible} ${d.disponible === 1 ? "lugar" : "lugares"}`}</span>
                </div>
              );
            })}
          </div>
          {revision && revision.faltan.length > 0 && (
            <>
              <RequisitosReserva faltan={revision.faltan} puedePedirLugar={revision.puedePedirLugar} negocioId={negocio.id} mascotaId={mascotaId} />
              {revision.puedePedirLugar && (
                <button type="button" className="apd-boton apd-boton-ancho" style={{ marginTop: "0.8rem" }} aria-busy={envio.cargando || undefined} disabled={envio.cargando} onClick={pedirLugar} data-pedir-lugar>
                  {envio.cargando ? "Pidiendo…" : "Pedir lugar"}
                </button>
              )}
            </>
          )}
          {revision && revision.faltan.length > 0 ? null : cupo.hayCupo ? (
            <div className="apd-tarjeta" style={{ marginTop: "0.5rem" }} data-resumen-reserva>
              <p style={{ fontWeight: 800 }}>{servicio?.nombre} para {nombre}</p>
              <p className="apd-nota">{porNoche ? `Del ${corto(entrada)} al ${corto(salidaReal)}` : corto(entrada)} · {negocio.nombre}</p>
              <button type="button" className="apd-boton apd-boton-ancho" style={{ marginTop: "0.8rem" }} aria-busy={envio.cargando || undefined} disabled={envio.cargando} onClick={reservar} data-reservar-ya>
                {envio.cargando ? "Reservando…" : "Reservar"}
              </button>
            </div>
          ) : (
            <p className="apd-aviso apd-aviso-ambar" data-sin-cupo>No hay lugar {porNoche ? "en todas esas noches" : "ese día"}. Prueba con otras fechas.</p>
          )}
        </>
      )}
      {error && <p className="apd-aviso apd-aviso-error" role="alert" data-error-reserva>{error}</p>}
    </div>
  );
}
