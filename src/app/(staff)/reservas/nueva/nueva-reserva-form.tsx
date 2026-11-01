"use client";

import { avisoGeneralPendiente, textoDelBloqueo, tipoDeBloqueo } from "@/lib/reservas/bloqueos";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { useModulos } from "@/components/modulos-contexto";
import { vocabularioMascota } from "@/lib/perros/vocabulario";
import { conTope, mensajeDeFallo } from "@/lib/ui/espera";
import { EnlaceConEspera } from "@/components/ui/enlace-con-espera";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { TextoConEnlaces } from "@/components/ui/texto-con-enlaces";
import { sumarDiasFecha } from "@/lib/formato";
import { AvisoFueraDeHorario } from "@/components/aviso-fuera-de-horario";
import type { HorarioSemana } from "@/lib/estetica/aviso-horario";
import { describirBonoAplicado } from "@/lib/bonos/descripcion";
import { paseParaFecha, type PaqueteDePerro } from "@/lib/bonos/pase-para-fecha";
import { ElegirPase } from "@/components/bonos/elegir-pase";
import { BuscadorClientes } from "@/components/buscador-clientes";
import type { ClienteBuscable } from "@/lib/clientes/buscables";
import { primerCotizable, type ServicioOfrecible } from "@/lib/servicios/ofrecibles";
import { OpcionesServicio, AvisoServiciosSinPrecio } from "@/components/servicios/opciones-servicio";
import { PrecioDeLinea } from "@/components/servicios/falta-dato-precio";
import { lineaConPrecio, useCotizacionLineas, type PedidoCotizacion } from "@/hooks/use-cotizacion-lineas";
import { textoFaltaDato } from "@/lib/servicios/cotizacion-linea";
import { formatearDiasSemana } from "../series/dias-semana";
import {
  crearReserva,
  agregarEstanciaAReserva,
  consultarSanitariosPendientes,
  consultarChoqueReserva,
  type LineaReserva,
  type ResultadoLinea,
} from "../reserva-actions";
import { Enlace } from "@/components/ui/enlace";

type Perro = { id: string; cliente_id: string; nombre: string; evaluado: boolean };
type Servicio = ServicioOfrecible;
type SerieActiva = { perroId: string; diasSemana: number[]; servicioNombre: string };

type Linea = {
  perroId: string;
  perroNombre: string;
  servicioId: string;
  fechaEntrada: string;
  fechaSalida: string;
  horas: string;
  bloqueoSanitarioSuperado: boolean;
  motivoExcepcionSanitaria: string;
  bloqueoComportamientoSuperado: boolean;
  motivoExcepcionComportamiento: string;
  // Guardería de día completo con pases: usar uno (lo normal) o pagar el
  // día suelto. En lo demás no tiene efecto.
  usarPase: boolean;
  // QA N125: el negocio no abre el día de entrada (o de salida, en hotel) y se registra de todos modos.
  diaCerradoConfirmado: boolean;
};

function lineaAPayload(linea: Linea, servicios: Servicio[]): LineaReserva {
  const servicio = servicios.find((s) => s.id === linea.servicioId);
  const esGuarderia = servicio?.categoria === "guarderia";
  const porHora = servicio?.unidad === "hora";
  return {
    perroId: linea.perroId,
    servicioId: linea.servicioId,
    fechaEntrada: linea.fechaEntrada,
    fechaSalida: esGuarderia ? sumarDiasFecha(linea.fechaEntrada, 1) : linea.fechaSalida,
    horas: porHora ? Math.max(1, Math.round(Number(linea.horas) || 1)) : null,
    bloqueoSanitarioSuperado: linea.bloqueoSanitarioSuperado,
    motivoExcepcionSanitaria: linea.motivoExcepcionSanitaria,
    bloqueoComportamientoSuperado: linea.bloqueoComportamientoSuperado,
    motivoExcepcionComportamiento: linea.motivoExcepcionComportamiento,
    usarPase: linea.usarPase,
    diaCerradoConfirmado: linea.diaCerradoConfirmado,
  };
}

const NOMBRES_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// «los domingos», «los lunes»: el plural de un día de la semana.
const enPlural = (dia: string) => (dia.endsWith("s") ? dia : `${dia}s`);

// Día de la semana (0 = domingo) de una fecha AAAA-MM-DD, sin zona horaria.
function diaDeFecha(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(a, m - 1, d).getDay();
}

export function NuevaReservaForm({
  clientes,
  perros,
  servicios,
  seriesActivas,
  paquetes,
  esAdmin,
  hoy,
  fechaInicial,
  diasSinAtencion = [],
  horario = null,
  avisarDia = false,
  base,
}: {
  clientes: ClienteBuscable[];
  perros: Perro[];
  servicios: Servicio[];
  seriesActivas: SerieActiva[];
  // Day pass y mensualidades de los perros, para decir al marcar uno si
  // tiene pases y dejar escoger usarlo o pagar suelto.
  paquetes: PaqueteDePerro[];
  esAdmin: boolean;
  hoy: string;
  // N121: el día desde el que se abrió (calendario de reservas); uno pasado o sin fecha arranca en hoy.
  fechaInicial?: string | null;
  // Días de la semana (1 = lunes … 7 = domingo) en que el negocio no atiende,
  // según horario_semana: el hotel no recibe ni entrega ese día.
  diasSinAtencion?: number[];
  // N128: horario por día de la semana, para avisar al abrir que el día elegido está cerrado (o ya cerró) y proponer
  // el siguiente abierto. Sin aviso en el walk-in: el perro ya está en la puerta.
  horario?: HorarioSemana | null;
  avisarDia?: boolean;
  // Modulo desde el que se abrio el formulario ("/guarderia" u "/hotel"):
  // los enlaces de despues de guardar tienen que regresar al mismo lado,
  // no a un modulo que el usuario no eligio.
  base: string;
}) {
  // QA S41 (N143): con Veterinaria, «mascota» (o su especie), nunca «perro» fijo.
  const vm = vocabularioMascota({ conVet: useModulos().tiene("veterinaria") });
  const [entradaInicial, setEntradaInicial] = useState(fechaInicial && /^\d{4}-\d{2}-\d{2}$/.test(fechaInicial) && fechaInicial > hoy ? fechaInicial : hoy);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [resultados, setResultados] = useState<ResultadoLinea[] | null>(null);
  const router = useRouter();
  const [reservaId, setReservaId] = useState<string | null>(null);
  const enviando = useEspera();
  const [reintentando, setReintentando] = useState<Record<string, boolean>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  // Vacunas que le faltan a cada mascota marcada (se consultan al elegirla): se avisa antes de «Crear reserva».
  const [sanitarios, setSanitarios] = useState<Record<string, string[]>>({});
  // Datos del expediente que se recomiendan para hotel y guardería (no bloquean).
  const [recomendados, setRecomendados] = useState<Record<string, string[]>>({});
  function revisarSanitarios(perroId: string) {
    if (sanitarios[perroId] !== undefined) return;
    setSanitarios((prev) => ({ ...prev, [perroId]: [] }));
    void conTope(consultarSanitariosPendientes(perroId))
      .then((r) => {
        setSanitarios((prev) => ({ ...prev, [perroId]: r.faltan }));
        setRecomendados((prev) => ({ ...prev, [perroId]: r.recomendados }));
      })
      .catch(() => setSanitarios((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== perroId))));
  }

  // N10: con qué reserva (hotel o guardería) choca cada mascota marcada. La clave lleva las fechas, así que al
  // cambiarlas o cambiar el servicio se vuelve a preguntar; «null» = no choca (o todavía no se sabe).
  const [choques, setChoques] = useState<Record<string, string | null>>({});
  const claveChoque = (l: Linea) => {
    const p = lineaAPayload(l, servicios);
    return `${l.perroId}|${p.fechaEntrada}|${p.fechaSalida}`;
  };
  function revisarChoque(l: Linea) {
    const p = lineaAPayload(l, servicios);
    if (!p.fechaEntrada || !p.fechaSalida || p.fechaSalida <= p.fechaEntrada) return;
    const k = claveChoque(l);
    if (choques[k] !== undefined) return;
    setChoques((prev) => ({ ...prev, [k]: null }));
    void conTope(consultarChoqueReserva(l.perroId, p.fechaEntrada, p.fechaSalida))
      .then((r) => setChoques((prev) => ({ ...prev, [k]: r.mensaje })))
      .catch(() => setChoques((prev) => Object.fromEntries(Object.entries(prev).filter(([x]) => x !== k))));
  }

  // QA R50 (N133): el precio de cada mascota marcada, o lo único que falta para saberlo (talla, pelaje), con la regla con
  // la que la base cobra. Sin precio no se puede crear la reserva: se dice al marcarla, con la salida ahí mismo.
  const pedidoDe = (l: Linea): PedidoCotizacion => {
    const p = lineaAPayload(l, servicios);
    return { perroId: l.perroId, servicioId: l.servicioId, entrada: p.fechaEntrada, salida: p.fechaSalida, horas: p.horas ?? null };
  };
  const cotizaciones = useCotizacionLineas(lineas.map(pedidoDe));

  const clienteElegido = clientes.find((c) => c.id === clienteId) ?? null;
  const perrosDelCliente = useMemo(
    () => perros.filter((p) => p.cliente_id === clienteId),
    [perros, clienteId]
  );

  function elegirCliente(id: string) {
    setClienteId(id);
    setLineas([]);
    setResultados(null);
    setReservaId(null);
    setErrorGeneral(null);
    // QA S16 (N68): un cliente con un solo perro lo trae ya escogido.
    const suyos = perros.filter((p) => p.cliente_id === id);
    if (suyos.length === 1) alternarPerro(suyos[0]);
  }

  function cambiarCliente() {
    setClienteId(null);
    setLineas([]);
    setResultados(null);
    setReservaId(null);
    setErrorGeneral(null);
  }

  function alternarPerro(perro: Perro) {
    if (!lineas.some((l) => l.perroId === perro.id)) {
      revisarSanitarios(perro.id);
      const primero = primerCotizable(servicios);
      revisarChoque({
        perroId: perro.id, perroNombre: perro.nombre, servicioId: primero?.id ?? "", fechaEntrada: entradaInicial, fechaSalida: sumarDiasFecha(entradaInicial, 1), horas: "1",
        bloqueoSanitarioSuperado: false, motivoExcepcionSanitaria: "", bloqueoComportamientoSuperado: false, motivoExcepcionComportamiento: "", usarPase: true, diaCerradoConfirmado: false,
      });
    }
    setLineas((prev) => {
      const existe = prev.some((l) => l.perroId === perro.id);
      if (existe) return prev.filter((l) => l.perroId !== perro.id);
      // El primero que se pueda cobrar, no el primero de la lista: uno
      // sin precio se ve pero no se puede elegir.
      const primerServicio = primerCotizable(servicios);
      return [
        ...prev,
        {
          perroId: perro.id,
          perroNombre: perro.nombre,
          servicioId: primerServicio?.id ?? "",
          fechaEntrada: entradaInicial,
          fechaSalida: sumarDiasFecha(entradaInicial, 1),
          horas: "1",
          bloqueoSanitarioSuperado: false,
          motivoExcepcionSanitaria: "",
          bloqueoComportamientoSuperado: false,
          motivoExcepcionComportamiento: "",
          usarPase: true,
          diaCerradoConfirmado: false,
        },
      ];
    });
  }

  // Una mascota sin evaluación solo se reserva con la excepción (y su motivo) puesta aquí mismo.
  const sinEvaluacionPendiente = lineas.some((l) => {
    const p = perros.find((x) => x.id === l.perroId);
    return p && !p.evaluado && !(l.bloqueoComportamientoSuperado && l.motivoExcepcionComportamiento.trim());
  });
  // Lo mismo con las vacunas: sin excepción (con motivo) no se puede crear la reserva.
  const sinVacunasPendiente = lineas.some(
    (l) => (sanitarios[l.perroId]?.length ?? 0) > 0 && !(l.bloqueoSanitarioSuperado && l.motivoExcepcionSanitaria.trim())
  );

  // Mascotas sin precio todavía (falta un dato, no hay tarifa o se está calculando).
  const sinPrecio = lineas.filter((l) => !lineaConPrecio(cotizaciones.de(pedidoDe(l))));
  const motivoSinPrecio = sinPrecio
    .map((l) => {
      const r = cotizaciones.de(pedidoDe(l));
      if (!r) return "Calculando el precio…";
      if ("error" in r) return `No pudimos calcular el precio de ${l.perroNombre}.`;
      return r.cotizacion.estado === "faltan_datos" ? `${textoFaltaDato(l.perroNombre, r.cotizacion.faltan)}.` : `${l.perroNombre} no tiene precio para ese servicio: ve el aviso de arriba.`;
    })
    .filter((x, i, xs) => xs.indexOf(x) === i);

  // Mascotas cuyas fechas chocan con otra reserva suya: no se puede crear hasta cambiar fechas o quitarla.
  const conChoque = lineas.some((l) => Boolean(choques[claveChoque(l)]));

  // Días sin atención (horario_semana): el hotel no recibe ni entrega perros y guardería no abre.
  const isoDe = (fecha: string) => (diaDeFecha(fecha) === 0 ? 7 : diaDeFecha(fecha));
  const sinAtencion = (fecha: string) => Boolean(fecha) && diasSinAtencion.includes(isoDe(fecha));
  const reglaDias =
    diasSinAtencion.length > 0
      ? `El negocio no atiende los ${diasSinAtencion.map((d) => enPlural(NOMBRES_DIA[d % 7])).join(" ni los ")}: ese día no hay entradas ni entregas.`
      : undefined;
  const lineaEnDiaCerrado = (l: Linea) => {
    const sv = servicios.find((x) => x.id === l.servicioId);
    return sinAtencion(l.fechaEntrada) || (sv?.categoria === "hotel" && sinAtencion(l.fechaSalida));
  };
  // QA N125: un día cerrado no se reserva sin la confirmación explícita (queda anotada en la estancia).
  const conDiaCerrado = lineas.some((l) => lineaEnDiaCerrado(l) && !l.diaCerradoConfirmado);

  function actualizarLinea(perroId: string, cambios: Partial<Linea>) {
    const actual = lineas.find((l) => l.perroId === perroId);
    if (actual && ("fechaEntrada" in cambios || "fechaSalida" in cambios || "servicioId" in cambios)) revisarChoque({ ...actual, ...cambios });
    // Otra fecha u otro servicio: el día cerrado se vuelve a confirmar.
    const reconfirmar = "fechaEntrada" in cambios || "fechaSalida" in cambios || "servicioId" in cambios ? { diaCerradoConfirmado: false } : {};
    setLineas((prev) => prev.map((l) => (l.perroId === perroId ? { ...l, ...reconfirmar, ...cambios } : l)));
  }

  async function enviar() {
    if (!clienteId) return;
    setErrorGeneral(null);
    const payload = lineas.map((l) => lineaAPayload(l, servicios));
    const res = await enviando.ejecutar(() => crearReserva(clienteId, notas, payload));
    if (res.error) {
      setErrorGeneral(res.error);
      return;
    }
    // QA S53: con todo guardado, la pantalla va al detalle de la reserva creada (el destino que manda la acción), no se
    // queda en un formulario. Si alguna línea no se pudo, se queda en la lista para reintentarla o autorizar la excepción.
    if (res.ir) {
      router.push(res.ir);
      return;
    }
    setResultados(res.resultados ?? []);
    setReservaId(res.reservaId ?? null);
  }

  async function reintentar(perroId: string) {
    const linea = lineas.find((l) => l.perroId === perroId);
    if (!linea) return;
    setReintentando((prev) => ({ ...prev, [perroId]: true }));
    let resultado: ResultadoLinea;
    try {
      if (reservaId) {
        resultado = await conTope(agregarEstanciaAReserva(reservaId, lineaAPayload(linea, servicios)));
      } else {
        // Si ninguna línea se guardó, la reserva vacía se descartó (no hay reservaId): se crea ahora con esta línea.
        // Antes el botón «Reintentar con excepción» no hacía nada en ese caso.
        if (!clienteId) throw new Error("Elige un cliente.");
        const nueva = await conTope(crearReserva(clienteId, notas, [lineaAPayload(linea, servicios)]));
        if (nueva.error) throw new Error(nueva.error);
        if (nueva.reservaId) setReservaId(nueva.reservaId);
        resultado = nueva.resultados?.[0] ?? { perroId, exito: false, motivo: "No pudimos guardar esto. Intenta de nuevo.", estanciaId: null };
      }
    } catch (e) {
      resultado = { perroId, exito: false, motivo: mensajeDeFallo(e), estanciaId: null };
    }
    setReintentando((prev) => ({ ...prev, [perroId]: false }));
    setResultados((prev) => (prev ? prev.map((r) => (r.perroId === perroId ? resultado : r)) : [resultado]));
  }

  // N128: el formulario se queda en el día elegido aunque esté cerrado; el aviso lo dice y propone el siguiente abierto.
  // «Usar ese día» mueve la entrada de lo que ya está marcado (y de lo que se marque después).
  function usarDia(fecha: string) {
    setEntradaInicial(fecha);
    setLineas((prev) => prev.map((l) => ({ ...l, fechaEntrada: fecha, fechaSalida: l.fechaSalida > fecha ? l.fechaSalida : sumarDiasFecha(fecha, 1), diaCerradoConfirmado: false })));
  }
  const avisoDia = avisarDia ? <AvisoFueraDeHorario fecha={entradaInicial} horario={horario} onUsarPropuesta={(p) => usarDia(p.fecha)} /> : null;

  // Paso 1: elegir cliente.
  if (!clienteElegido) {
    return (
      <div className="flex flex-col gap-4">
        {avisoDia}
        <BuscadorClientes clientes={clientes} onElegir={(c) => elegirCliente(c.id)} nuevoCliente="guarderia_hotel" autoFocus />
      </div>
    );
  }

  // Paso 3: resultados de un envío ya hecho.
  if (resultados) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-n-700">
          Reserva para <strong>{clienteElegido.nombre}</strong>:
        </p>
        <ul className="flex flex-col gap-3">
          {resultados.map((r) => {
            const linea = lineas.find((l) => l.perroId === r.perroId);
            const bloqueo = r.exito ? null : tipoDeBloqueo(r.motivo);
            const esBloqueoSanitario = bloqueo === "sanitario";
            const esBloqueoComportamiento = bloqueo === "comportamiento";
            return (
              <li
                key={r.perroId}
                className={`rounded-lg border-[1.5px] p-4 ${
                  r.exito ? "border-menta bg-menta-suave" : "border-coral bg-coral-suave"
                }`}
              >
                <p className={`font-bold ${r.exito ? "text-menta-oscuro" : "text-coral-oscuro"}`}>
                  {linea?.perroNombre ?? vm.Nombre} — {r.exito ? "Reservado" : "No se pudo reservar"}
                </p>
                {r.exito && describirBonoAplicado(r.bono) && (
                  <p className="mt-1 text-sm text-menta-oscuro">{describirBonoAplicado(r.bono)}</p>
                )}
                {r.exito && r.estanciaId && (
                  <EnlaceConEspera
                    href={`/reservas/estancias/${r.estanciaId}/checkin`}
                    className="mt-1 text-sm"
                    textoCargando="Abriendo el check-in…"
                  >
                    Hacer check-in ahora →
                  </EnlaceConEspera>
                )}
                {!r.exito && r.motivo && <p className="mt-1 text-sm text-coral-oscuro"><TextoConEnlaces texto={textoDelBloqueo(r.motivo, esAdmin)} /></p>}
                {esBloqueoSanitario && esAdmin && linea && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-coral pt-3">
                    <label className="flex items-center gap-2 text-sm font-semibold text-coral-oscuro">
                      <input
                        type="checkbox"
                        checked={linea.bloqueoSanitarioSuperado}
                        onChange={(e) =>
                          actualizarLinea(r.perroId, { bloqueoSanitarioSuperado: e.target.checked })
                        }
                      />
                      Autorizar excepción (admin o con permiso)
                    </label>
                    {linea.bloqueoSanitarioSuperado && (
                      <>
                        <Field
                          label="Motivo de la excepción"
                          value={linea.motivoExcepcionSanitaria}
                          onChange={(e) =>
                            actualizarLinea(r.perroId, { motivoExcepcionSanitaria: e.target.value })
                          }
                          placeholder="ej. Dueño ya en el mostrador, autoriza admin"
                        />
                        <Button
                          type="button"
                          variante="secundario"
                          disabled={!linea.motivoExcepcionSanitaria.trim()}
                          cargando={reintentando[r.perroId]}
                          onClick={() => reintentar(r.perroId)}
                          className="self-start"
                        >
                          {reintentando[r.perroId] ? "Reintentando…" : "Reintentar con excepción"}
                        </Button>
                      </>
                    )}
                  </div>
                )}
                {esBloqueoComportamiento && esAdmin && linea && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-coral pt-3">
                    <label className="flex items-center gap-2 text-sm font-semibold text-coral-oscuro">
                      <input
                        type="checkbox"
                        checked={linea.bloqueoComportamientoSuperado}
                        onChange={(e) =>
                          actualizarLinea(r.perroId, { bloqueoComportamientoSuperado: e.target.checked })
                        }
                      />
                      Reservar sin evaluación de comportamiento (admin o con permiso)
                    </label>
                    {linea.bloqueoComportamientoSuperado && (
                      <>
                        <Field
                          label="Motivo de la excepción"
                          value={linea.motivoExcepcionComportamiento}
                          onChange={(e) =>
                            actualizarLinea(r.perroId, { motivoExcepcionComportamiento: e.target.value })
                          }
                          placeholder="ej. Se evalúa hoy al llegar, autoriza admin"
                        />
                        <Button
                          type="button"
                          variante="secundario"
                          disabled={!linea.motivoExcepcionComportamiento.trim()}
                          cargando={reintentando[r.perroId]}
                          onClick={() => reintentar(r.perroId)}
                          className="self-start"
                        >
                          {reintentando[r.perroId] ? "Reintentando…" : "Reintentar con excepción"}
                        </Button>
                      </>
                    )}
                  </div>
                )}
                {!r.exito && !esBloqueoSanitario && !esBloqueoComportamiento && (
                  <Button
                    type="button"
                    variante="secundario"
                    cargando={reintentando[r.perroId]}
                    onClick={() => reintentar(r.perroId)}
                    className="mt-3"
                  >
                    {reintentando[r.perroId] ? "Reintentando…" : "Reintentar"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-3">
          {reservaId && (
            <Enlace href={`/reservas/${reservaId}`}>Ver reserva</Enlace>
          )}
          <Enlace href={`${base}/nueva`}>
              Nueva reserva
            </Enlace>
        </div>
      </div>
    );
  }

  // Paso 2: elegir perros y capturar cada línea.
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
        <div>
          <p className="text-sm text-n-600">Cliente</p>
          <p className="font-bold text-n-900">{clienteElegido.nombre}</p>
        </div>
        <Button type="button" variante="secundario" onClick={cambiarCliente}>
          Cambiar cliente
        </Button>
      </div>

      {avisoDia}
      <AvisoServiciosSinPrecio servicios={servicios} />

      {perrosDelCliente.length === 0 ? (
        <Alert variante="advertencia" titulo={`Este cliente no tiene ${vm.plural} registrad${vm.o}s`}>
          Da de alta al perro antes de poder reservarle algo.
        </Alert>
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">{vm.Plural}</h2>
          {perrosDelCliente.map((perro) => {
            const linea = lineas.find((l) => l.perroId === perro.id);
            const marcado = Boolean(linea);
            const servicioActual = servicios.find((s) => s.id === linea?.servicioId);
            const esGuarderia = servicioActual?.categoria === "guarderia";
            const seriesDelPerro = seriesActivas.filter((s) => s.perroId === perro.id);
            return (
              <div key={perro.id} className="rounded-lg border border-n-200 bg-white p-4">
                <label className="flex items-center gap-2 font-semibold text-n-900">
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() => alternarPerro(perro)}
                    className="h-4 w-4"
                  />
                  {perro.nombre}
                </label>

                {linea && (
                  <PrecioDeLinea parte="aviso" perroId={perro.id} perroNombre={perro.nombre} resultado={cotizaciones.de(pedidoDe(linea))} onGuardado={() => cotizaciones.recalcular(perro.id)} />
                )}

                {linea && !perro.evaluado && (
                  <div className="mt-3 rounded-md border border-ambar bg-ambar-suave p-3 text-sm text-ambar-oscuro" role="alert">
                    <p className="font-semibold">{perro.nombre} no tiene evaluación de comportamiento.</p>
                    <p className="mt-1">
                      Sin ella no se puede reservar guardería ni hotel.{" "}
                      <Enlace href={`/perros/${perro.id}`} enTexto>
                        Completar la evaluación en su expediente →
                      </Enlace>
                    </p>
                    {esAdmin && (
                      <div className="mt-3 flex flex-col gap-2 border-t border-ambar pt-3">
                        <label className="flex items-center gap-2 font-semibold">
                          <input
                            type="checkbox"
                            checked={linea.bloqueoComportamientoSuperado}
                            onChange={(e) => actualizarLinea(perro.id, { bloqueoComportamientoSuperado: e.target.checked })}
                          />
                          Reservar sin evaluación (excepción de admin o con permiso)
                        </label>
                        {linea.bloqueoComportamientoSuperado && (
                          <Field
                            label="Motivo de la excepción"
                            value={linea.motivoExcepcionComportamiento}
                            onChange={(e) => actualizarLinea(perro.id, { motivoExcepcionComportamiento: e.target.value })}
                            placeholder="ej. Se evalúa hoy al llegar, autoriza admin"
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {linea && (recomendados[perro.id]?.length ?? 0) > 0 && (
                  <p className="mt-3 rounded-md bg-n-50 px-3 py-2 text-sm text-n-700" data-datos-recomendados>
                    Recomendado para hotel y guardería: a {perro.nombre} le faltan {recomendados[perro.id].join(", ")}. No impide reservar.{" "}
                    <Enlace href={`/perros/${perro.id}`} enTexto>
                      Completarlos en su expediente →
                    </Enlace>
                  </p>
                )}

                {linea && choques[claveChoque(linea)] && (
                  <div className="mt-3 rounded-md border border-coral bg-coral-suave p-3 text-sm text-coral-oscuro" role="alert" data-choque-reserva>
                    <p className="font-semibold">
                      <TextoConEnlaces texto={choques[claveChoque(linea)] as string} />
                    </p>
                    <p className="mt-1">Cambia las fechas o quita esta mascota para poder crear la reserva.</p>
                  </div>
                )}

                {linea && (sanitarios[perro.id]?.length ?? 0) > 0 && (
                  <div className="mt-3 rounded-md border border-ambar bg-ambar-suave p-3 text-sm text-ambar-oscuro" role="alert" data-sanitarios-pendientes>
                    <p className="font-semibold">A {perro.nombre} le falta: {sanitarios[perro.id].join(", ")}.</p>
                    <p className="mt-1">
                      Sin eso no se puede reservar guardería ni hotel.{" "}
                      <Enlace href={`/perros/${perro.id}#sanitarios`} enTexto>
                        Registrar las vacunas en su expediente →
                      </Enlace>
                    </p>
                    {esAdmin && (
                      <div className="mt-3 flex flex-col gap-2 border-t border-ambar pt-3">
                        <label className="flex items-center gap-2 font-semibold">
                          <input
                            type="checkbox"
                            checked={linea.bloqueoSanitarioSuperado}
                            onChange={(e) => actualizarLinea(perro.id, { bloqueoSanitarioSuperado: e.target.checked })}
                          />
                          Reservar sin las vacunas (excepción de admin o con permiso)
                        </label>
                        {linea.bloqueoSanitarioSuperado && (
                          <Field
                            label="Motivo de la excepción"
                            value={linea.motivoExcepcionSanitaria}
                            onChange={(e) => actualizarLinea(perro.id, { motivoExcepcionSanitaria: e.target.value })}
                            placeholder="ej. Dueño ya en el mostrador, autoriza admin"
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {seriesDelPerro.length > 0 && (
                  <p className="mt-2 rounded-md bg-morado-suave px-3 py-2 text-sm text-morado">
                    Ya tiene serie recurrente:{" "}
                    {seriesDelPerro
                      .map((s) => `${s.servicioNombre} — ${formatearDiasSemana(s.diasSemana)}`)
                      .join("; ")}
                    . Revisa que esta reserva no choque con esos días.
                  </p>
                )}

                {linea && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Select
                      label="Servicio"
                      value={linea.servicioId}
                      onChange={(e) => actualizarLinea(perro.id, { servicioId: e.target.value })}
                    >
                      <OpcionesServicio servicios={servicios} />
                    </Select>
                    <Field
                      label={esGuarderia ? "Fecha" : "Entrada"}
                      type="date"
                      value={linea.fechaEntrada}
                      error={sinAtencion(linea.fechaEntrada) && !linea.diaCerradoConfirmado ? (esGuarderia ? "Guardería" : "El hotel") + ` no ${esGuarderia ? "abre" : "recibe perros"} los ${enPlural(NOMBRES_DIA[diaDeFecha(linea.fechaEntrada)])}. Elige otro día o confírmalo abajo.` : undefined}
                      ayuda={sinAtencion(linea.fechaEntrada) ? reglaDias : undefined}
                      onChange={(e) => {
                        // El hotel se cobra por noche: si la entrada alcanza a la
                        // salida, la salida se recorre a la mañana siguiente. Con
                        // entrada = salida eran 0 noches y la base lo rechazaba
                        // como "sin tarifa" (Galleta, 23 de septiembre de 2026).
                        const entrada = e.target.value;
                        actualizarLinea(perro.id, {
                          fechaEntrada: entrada,
                          ...(!esGuarderia && entrada && linea.fechaSalida <= entrada
                            ? { fechaSalida: sumarDiasFecha(entrada, 1) }
                            : {}),
                        });
                      }}
                    />
                    {servicioActual?.unidad === "hora" && (
                      <Field
                        label="Horas (estimado)"
                        type="number"
                        min="1"
                        step="1"
                        value={linea.horas}
                        onChange={(e) => actualizarLinea(perro.id, { horas: e.target.value })}
                        ayuda="Al check-out se cobran las reales si fueron más."
                      />
                    )}
                    {!esGuarderia && (
                      <Field
                        label="Salida"
                        type="date"
                        value={linea.fechaSalida}
                        min={linea.fechaEntrada ? sumarDiasFecha(linea.fechaEntrada, 1) : undefined}
                        error={sinAtencion(linea.fechaSalida) && !linea.diaCerradoConfirmado ? `El hotel no entrega perros los ${enPlural(NOMBRES_DIA[diaDeFecha(linea.fechaSalida)])}. Elige otro día de salida o confírmalo abajo.` : undefined}
                        ayuda={sinAtencion(linea.fechaSalida) ? reglaDias : undefined}
                        onChange={(e) => actualizarLinea(perro.id, { fechaSalida: e.target.value })}
                      />
                    )}
                  </div>
                )}
                {linea && (
                  <PrecioDeLinea parte="precio" perroId={perro.id} perroNombre={perro.nombre} resultado={cotizaciones.de(pedidoDe(linea))} onGuardado={() => cotizaciones.recalcular(perro.id)} />
                )}
                {linea && lineaEnDiaCerrado(linea) && (
                  <label className="mt-3 flex items-start gap-2 rounded-md border-[1.5px] border-ambar bg-ambar-suave px-3 py-2 text-sm text-ambar-oscuro" data-confirmar-dia-cerrado>
                    <input
                      type="checkbox"
                      className="mt-0.5 h-5 w-5"
                      checked={linea.diaCerradoConfirmado}
                      onChange={(e) => actualizarLinea(perro.id, { diaCerradoConfirmado: e.target.checked })}
                    />
                    <span>El negocio está cerrado ese día; registrar de todos modos. Queda anotado en la bitácora de la estancia.</span>
                  </label>
                )}
                {linea && (
                  <div className="mt-3">
                    <ElegirPase
                      pase={paseParaFecha(paquetes, perro.id, servicioActual, linea.fechaEntrada, hoy)}
                      fecha={linea.fechaEntrada}
                      usarPase={linea.usarPase}
                      onCambio={(usar) => actualizarLinea(perro.id, { usarPase: usar })}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Textarea
        label="Notas (opcional)"
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        placeholder="Cualquier detalle de esta visita"
      />

      {errorGeneral && (
        <Alert variante="error" titulo="No pudimos crear la reserva">
          {errorGeneral}
        </Alert>
      )}

      <Button
        type="button"
        disabled={lineas.length === 0 || enviando.cargando || sinPrecio.length > 0 || sinEvaluacionPendiente || sinVacunasPendiente || conChoque || conDiaCerrado}
        onClick={enviar}
        className="self-start"
      >
        {enviando.cargando ? "Guardando…" : "Crear reserva"}
      </Button>
      {lineas.length === 0 && <p className="text-sm text-n-600" data-motivo-reserva>Escoge al menos {vm.un}.</p>}
      {motivoSinPrecio.map((m) => (
        <p key={m} className="text-sm text-coral-oscuro" data-motivo-sin-precio>{m}</p>
      ))}
      {conChoque && (
        <p className="text-sm text-coral-oscuro">Hay mascotas que ya tienen otra reserva en esas fechas: cambia las fechas o quítalas para continuar.</p>
      )}
      {sinVacunasPendiente && <p className="text-sm text-ambar-oscuro">{avisoGeneralPendiente("sanitario", esAdmin)}</p>}
      {sinEvaluacionPendiente && <p className="text-sm text-ambar-oscuro">{avisoGeneralPendiente("comportamiento", esAdmin)}</p>}
    </div>
  );
}
