"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { corregirServicioCita, cotizarCorreccionServicio } from "../correccion-servicio-actions";
import type { CotizacionCorreccion, ResultadoCorreccion } from "../correccion-servicio-tipos";

const dinero = (n: number) => `$${Math.abs(n).toFixed(2)}`;
const conSigno = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${dinero(n)}`;

/**
 * Corregir el servicio de una cita (cuando se capturó el que no era).
 *
 * El precio sale de las reglas de la cita (la base lo calcula): aquí se escoge
 * el servicio, se ve la diferencia y qué pasará con la cuenta, y se confirma
 * con un motivo. La base decide todo; esto solo esconde lo que de todos modos
 * rechazaría.
 */
export function CorregirServicio({
  citaId,
  estado,
  servicioActual,
  servicios,
  gruposPrecio,
  puedeExcepcion,
}: {
  citaId: string;
  estado: string;
  servicioActual: string;
  servicios: { id: string; nombre: string }[];
  gruposPrecio: { id: string; nombre: string }[];
  puedeExcepcion: boolean;
}) {
  const router = useRouter();
  const calculo = useEspera();
  const envio = useEspera();
  const [abierto, setAbierto] = useState(false);
  const [servicioId, setServicioId] = useState("");
  const [grupoId, setGrupoId] = useState("");
  const [motivoGrupo, setMotivoGrupo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [cot, setCot] = useState<CotizacionCorreccion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoCorreccion | null>(null);

  const terminada = estado === "finalizada";

  async function calcular(nuevoServicio: string, grupo: string, motivoDelGrupo: string) {
    setError(null);
    setCot(null);
    if (!nuevoServicio) return;
    const res = await calculo.ejecutar(() => cotizarCorreccionServicio(citaId, nuevoServicio, grupo || null, motivoDelGrupo.trim() || null));
    if (res.error) return setError(res.error);
    setCot(res.cotizacion ?? null);
  }

  function reiniciar() {
    setAbierto(false);
    setServicioId("");
    setGrupoId("");
    setMotivoGrupo("");
    setMotivo("");
    setCot(null);
    setError(null);
  }

  const listo = Boolean(cot?.ok && cot.precio_nuevo !== null);
  const cancelaCobros = (cot?.ordenes_abiertas ?? []).length > 0;

  if (resultado) {
    return (
      <div data-correccion-servicio className="flex flex-col gap-2 rounded-md border-l-4 border-menta bg-menta-suave px-3 py-2 text-sm text-menta-oscuro" role="status">
        <p className="font-semibold">
          Servicio corregido: {resultado.servicio_anterior} → {resultado.servicio_nuevo} ({dinero(resultado.precio_anterior)} → {dinero(resultado.precio_nuevo)}).
        </p>
        {resultado.ordenes_canceladas ? <p>Se cancelaron {resultado.ordenes_canceladas} cobro(s) en curso por el monto anterior.</p> : null}
        {resultado.tipo_ajuste === "cobro_adicional" && <p>La cuenta quedó con {dinero(resultado.saldo_despues)} por cobrar al cliente (cobro adicional), en Caja.</p>}
        {resultado.tipo_ajuste === "saldo_a_favor" && <p>La cuenta quedó con {dinero(resultado.saldo_despues)} a favor del cliente. Un admin lo devuelve desde la cuenta.</p>}
        {resultado.tipo_ajuste === "ninguno" && <p>No había nada cobrado de más ni de menos: la cuenta solo cambió su saldo pendiente.</p>}
        {resultado.inventario?.regresados || resultado.inventario?.consumidos ? <p>Inventario: se regresó lo del servicio anterior y se consumió lo del nuevo.</p> : null}
        {resultado.ajuste_nomina && <p>La comisión ya estaba pagada: la diferencia se ajusta en el siguiente pago de nómina.</p>}
        <Button type="button" variante="secundario" className="self-start" onClick={() => { setResultado(null); reiniciar(); }}>
          Listo
        </Button>
      </div>
    );
  }

  if (!abierto) {
    return (
      <Button type="button" variante="secundario" className="self-start" data-corregir-servicio onClick={() => setAbierto(true)}>
        Corregir servicio
      </Button>
    );
  }

  return (
    <form
      data-corregir-servicio-form
      className="flex flex-col gap-3 rounded-md border border-n-200 bg-n-50 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!listo || !cot) return setError("Escoge el servicio correcto y revisa el precio antes de confirmar.");
        if (!motivo.trim()) return setError("Escribe el motivo de la corrección.");
        setError(null);
        const res = await envio.ejecutar(() =>
          corregirServicioCita({
            citaId,
            servicioId,
            motivo,
            precioEsperado: cot.precio_nuevo,
            grupoExcepcionId: grupoId || null,
            motivoExcepcion: motivoGrupo.trim() || null,
          })
        );
        if (res.error) return setError(res.error);
        setResultado(res.resultado ?? null);
        router.refresh();
      }}
    >
      <p className="text-sm text-n-600">
        Servicio actual: <span className="font-semibold text-n-800">{servicioActual}</span>
      </p>
      <Select
        label="Servicio correcto"
        value={servicioId}
        disabled={envio.cargando}
        onChange={async (e) => {
          setServicioId(e.target.value);
          await calcular(e.target.value, grupoId, motivoGrupo);
        }}
      >
        <option value="">Escoge el servicio</option>
        {servicios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </Select>

      {calculo.cargando && <p className="text-sm text-n-500">Calculando el precio…</p>}

      {cot?.pide_excepcion && (
        <div className="flex flex-col gap-2 rounded-md border border-ambar bg-ambar-suave p-3 text-sm text-ambar-oscuro" data-correccion-excepcion>
          <p>{cot.error}</p>
          {puedeExcepcion ? (
            <>
              <Select label="Cobrar con el grupo de precio" value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
                <option value="">Escoge un grupo</option>
                {gruposPrecio.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nombre}
                  </option>
                ))}
              </Select>
              <Textarea label="Motivo de la excepción (obligatorio)" rows={2} maxLength={300} value={motivoGrupo} onChange={(e) => setMotivoGrupo(e.target.value)} />
              <Button type="button" variante="secundario" className="self-start" disabled={!grupoId || !motivoGrupo.trim()} cargando={calculo.cargando} onClick={() => calcular(servicioId, grupoId, motivoGrupo)}>
                Calcular con esta excepción
              </Button>
            </>
          ) : (
            <p>Registrar una excepción de grupo de precio es de admin o de quien tenga el permiso «Excepciones al reservar».</p>
          )}
        </div>
      )}

      {cot && !cot.pide_excepcion && !cot.ok && (
        <p role="alert" className="rounded-md border-l-4 border-coral bg-coral-suave px-3 py-1.5 text-sm font-semibold text-coral-oscuro">
          {cot.error}
        </p>
      )}

      {listo && cot && (
        <div data-correccion-resumen className="flex flex-col gap-1.5 rounded-md border border-n-200 bg-white p-3 text-sm text-n-700">
          <p>
            <span className="font-semibold text-n-900">{cot.servicio_actual} → {cot.servicio_nuevo}</span>
          </p>
          <p>
            Precio: {dinero(cot.precio_actual)} → <span className="font-semibold text-n-900">{dinero(cot.precio_nuevo as number)}</span> ({conSigno(cot.diferencia ?? 0)})
          </p>
          {cot.tarifa_de_hoy && <p>La cita es anterior a la primera tarifa de este servicio: se usó la tarifa de hoy.</p>}
          {cot.pagado > 0 && <p>Ya se pagó {dinero(cot.pagado)} en esta cuenta.</p>}
          {cot.tipo_ajuste === "cobro_adicional" && <p className="font-semibold text-n-900">La cuenta queda con {dinero(cot.saldo_despues ?? 0)} por cobrar (cobro adicional). El cobro original no se toca.</p>}
          {cot.tipo_ajuste === "saldo_a_favor" && <p className="font-semibold text-n-900">Quedan {dinero(cot.saldo_despues ?? 0)} a favor del cliente. Un admin los devuelve desde la cuenta (con Mercado Pago, con «Devolver con Mercado Pago»). El cobro original no se toca.</p>}
          {cot.tipo_ajuste === "ninguno" && (cot.diferencia ?? 0) !== 0 && <p>No hay nada cobrado de más ni de menos: la cuenta solo cambia su saldo pendiente a {dinero((cot.saldo_despues ?? 0))}.</p>}
          {cancelaCobros && (
            <p className="font-semibold text-ambar-oscuro">
              Hay {cot.ordenes_abiertas.length === 1 ? "un cobro en curso" : `${cot.ordenes_abiertas.length} cobros en curso`} en esta cuenta ({cot.ordenes_abiertas.map((o) => `${o.tipo === "link" ? "link de pago" : "terminal"} por ${dinero(Number(o.monto))}`).join(", ")}): se cancelará{cot.ordenes_abiertas.length === 1 ? "" : "n"} antes de cambiar el servicio, para que no se cobre el monto anterior.
            </p>
          )}
          {cot.descuento_cuenta > 0 && <p>La cuenta tiene un descuento de {dinero(cot.descuento_cuenta)}: no se recalcula.</p>}
          {terminada && <p>El servicio ya terminó: se ajusta el inventario (se regresa lo del anterior y se consume lo del nuevo) y, si su comisión ya se pagó, la diferencia sale en el siguiente pago de nómina.</p>}
        </div>
      )}

      <Textarea
        label="Motivo de la corrección (obligatorio)"
        rows={2}
        maxLength={300}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        ayuda="Queda en el historial de la cita. Por ejemplo: «Se cobró baño completo y era rapado»."
      />

      <AccionesFormulario error={error}>
        <Button type="submit" cargando={envio.cargando} disabled={!listo}>
          Confirmar corrección
        </Button>
        <Button type="button" variante="secundario" onClick={reiniciar}>
          Cancelar
        </Button>
      </AccionesFormulario>
    </form>
  );
}
