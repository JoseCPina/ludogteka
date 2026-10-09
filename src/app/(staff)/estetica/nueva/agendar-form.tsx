"use client";

import Link from "next/link";

import { useEffect, useMemo, useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { BuscadorClientes } from "@/components/buscador-clientes";
import type { ClienteBuscable } from "@/lib/clientes/buscables";
import { hoyNegocio, horaLocalParaInput, instanteDeHoraLocal } from "@/lib/formato";
import { SelectorRaza, type RazaOpcion } from "@/components/selector-raza";
import { crearPerritoEstetica } from "../perritos-actions";
import { completarTallaPelajeDelPerro, cotizarCitaEstetica, crearCita, type CotizacionCita } from "../agenda-actions";
import { conTope, mensajeDeFallo } from "@/lib/ui/espera";
import { asignarGrupoDePropuesta, asignarGrupoDeRaza } from "../../perros/razas/grupos-actions";
import { useZonaNegocio } from "@/components/zona-negocio";

type Perro = {
  id: string;
  cliente_id: string;
  nombre: string;
  pelajeClave: string | null;
  pelajeEtiqueta: string | null;
  tamanoId: string | null;
  pelajeId: string | null;
};
type Opcion = { id: string; etiqueta: string; clave: string };
type Servicio = {
  id: string;
  nombre: string;
  // Si este servicio tiene capturado un precio alternativo para pelo
  // maltratado en algún grupo. Lo resuelve la pantalla, no el formulario.
  tiene_precio_maltratado?: boolean;
  // Lo que trae el servicio, y lo que NO; y los pelajes a los que no se ofrece.
  incluye: string[];
  no_incluye: string | null;
  pelajes_excluidos: string[];
};
type Empleado = { id: string; nombre_completo: string | null };
type EstanciaEnCurso = { id: string; perroId: string; servicioNombre: string };

export function AgendarForm({
  clientes,
  perros,
  servicios,
  empleados,
  estanciasEnCurso,
  rolActual,
  userIdActual,
  perrosConAvisoSanitario,
  perrosSinGrupo,
  gruposPrecio,
  tamanos,
  pelajes,
  puedeAsignarGrupo,
  puedeExcepcion,
  razas = [],
}: {
  clientes: ClienteBuscable[];
  perros: Perro[];
  servicios: Servicio[];
  empleados: Empleado[];
  estanciasEnCurso: EstanciaEnCurso[];
  // Perros que usan guardería u hotel y traen requisitos sanitarios
  // vencidos o sin registro: la cita de estética se agenda igual (a ellos
  // se les exige en la estancia, no aquí), pero se avisa.
  perrosConAvisoSanitario: string[];
  // Perros cuya raza (nueva en el catálogo) no tiene grupo de precio en este
  // negocio: la app no adivina el precio, hay que asignarlo o hacer excepción.
  perrosSinGrupo: {
    perroId: string;
    razaId: string | null;
    propuestaId: string | null;
    razaNombre: string;
    // 'sin_grupo': la raza no tiene grupo de precio en este negocio.
    // 'pelaje': tiene grupo, pero ese grupo no cobra automático a su pelaje.
    motivo: "sin_grupo" | "pelaje";
    grupoNombre: string | null;
    pelajeClave: string | null;
  }[];
  gruposPrecio: { id: string; nombre: string }[];
  // Para completar en línea la talla y el pelaje del perro (solo los que entran a la matriz).
  tamanos: Opcion[];
  pelajes: Opcion[];
  puedeAsignarGrupo: boolean;
  puedeExcepcion: boolean;
  // Catálogo de razas, para dar de alta otro perrito del cliente sin salir de aquí.
  razas?: RazaOpcion[];
  rolActual: string;
  userIdActual: string;
}) {
  const zona = useZonaNegocio();
  const router = useRouter();
  const [clienteId, setClienteId] = useState<string | null>(null);
  // Varios perritos del mismo dueño en una visita: cada uno con su cita y su cuenta.
  const [agendadas, setAgendadas] = useState<{ citaId: string; reservaId: string; perroNombre: string; servicio: string; precio: number; tarifa: boolean }[]>([]);
  const [perrosExtra, setPerrosExtra] = useState<Perro[]>([]);
  const [nuevoPerro, setNuevoPerro] = useState(false);
  const [npNombre, setNpNombre] = useState("");
  const [npRaza, setNpRaza] = useState<{ raza_id: string | null; raza: string }>({ raza_id: null, raza: "" });
  const [npTamano, setNpTamano] = useState("");
  const [npPelaje, setNpPelaje] = useState("");
  const creandoPerro = useEspera();
  // Tarifa «cliente de guardería»: la propone la base; quien tiene el permiso de excepciones la quita o la pone a mano.
  const [tarifaModo, setTarifaModo] = useState<"auto" | "si" | "no">("auto");
  const [motivoTarifa, setMotivoTarifa] = useState("");
  const [perroId, setPerroId] = useState("");
  const [servicioId, setServicioId] = useState(servicios[0]?.id ?? "");
  const [empleadoId, setEmpleadoId] = useState(rolActual === "estetica" ? userIdActual : empleados[0]?.id ?? "");
  const [fechaHora, setFechaHora] = useState(`${hoyNegocio(zona)}T10:00`);
  const [estanciaId, setEstanciaId] = useState("");
  const [peloMaltratado, setPeloMaltratado] = useState(false);
  const [grupoElegido, setGrupoElegido] = useState("");
  const [excepcion, setExcepcion] = useState(false);
  const [motivoExcepcion, setMotivoExcepcion] = useState("");
  const [recargo, setRecargo] = useState("");
  const [motivoRecargo, setMotivoRecargo] = useState("");
  const asignando = useEspera();
  const completando = useEspera();
  const enviando = useEspera();
  const [cotizacion, setCotizacion] = useState<{ clave: string; valor: CotizacionCita } | null>(null);
  const [version, setVersion] = useState(0);
  const [tamanoFalta, setTamanoFalta] = useState("");
  const [pelajeFalta, setPelajeFalta] = useState("");
  // Lo que se acaba de guardar en el expediente (hasta que la página se refresca).
  const [pelajeLocal, setPelajeLocal] = useState<Record<string, { clave: string; etiqueta: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const clienteElegido = clientes.find((c) => c.id === clienteId) ?? null;
  const perrosDelCliente = useMemo(() => [...perros, ...perrosExtra].filter((p) => p.cliente_id === clienteId), [perros, perrosExtra, clienteId]);
  const estanciasDelPerro = estanciasEnCurso.filter((e) => e.perroId === perroId);
  const sinGrupo = perrosSinGrupo.find((p) => p.perroId === perroId) ?? null;
  const perroBase = [...perros, ...perrosExtra].find((p) => p.id === perroId) ?? null;
  const perroElegido = perroBase
    ? { ...perroBase, pelajeClave: pelajeLocal[perroBase.id]?.clave ?? perroBase.pelajeClave, pelajeEtiqueta: pelajeLocal[perroBase.id]?.etiqueta ?? perroBase.pelajeEtiqueta }
    : null;
  // Un servicio que no se ofrece al pelaje del perro (el rapado, a pelo
  // corto) ni aparece: enseñar una opción que va a rebotar no ayuda.
  const noOfrecidos = servicios.filter((s) => perroElegido?.pelajeClave && s.pelajes_excluidos.includes(perroElegido.pelajeClave));
  const serviciosOfrecidos = servicios.filter((s) => !noOfrecidos.includes(s));
  const servicioActual = serviciosOfrecidos.find((s) => s.id === servicioId) ?? serviciosOfrecidos[0] ?? null;
  const recargoNumero = Number(recargo.replace(",", "."));
  const grupoDeExcepcion = excepcion && grupoElegido ? grupoElegido : null;

  // El precio que va a cobrar esta cita, o lo único que falta para saberlo. Se
  // guarda con la clave de lo que se preguntó: una respuesta vieja nunca se ve
  // como la de otro perro o servicio.
  const claveCot = `${perroId}|${servicioActual?.id ?? ""}|${peloMaltratado}|${grupoDeExcepcion ?? ""}|${tarifaModo}|${version}`;
  const cot: CotizacionCita | null = cotizacion?.clave === claveCot ? cotizacion.valor : null;
  useEffect(() => {
    if (!perroId || !servicioActual?.id) return;
    let vigente = true;
    conTope(cotizarCitaEstetica(perroId, servicioActual.id, peloMaltratado, grupoDeExcepcion, tarifaModo))
      .then((r) => {
        if (vigente) setCotizacion({ clave: claveCot, valor: r });
      })
      .catch((e) => {
        if (vigente) setCotizacion({ clave: claveCot, valor: { error: mensajeDeFallo(e) } });
      });
    return () => {
      vigente = false;
    };
  }, [claveCot, perroId, servicioActual?.id, peloMaltratado, grupoDeExcepcion, tarifaModo]);

  async function asignarGrupo() {
    if (!sinGrupo || !grupoElegido) return;
    setError(null);
    const res = await asignando.ejecutar(() => (sinGrupo.razaId ? asignarGrupoDeRaza(sinGrupo.razaId, grupoElegido) : asignarGrupoDePropuesta(sinGrupo.propuestaId ?? "", grupoElegido)));
    if (res.error) {
      setError(res.error);
      return;
    }
    setGrupoElegido("");
    setVersion((v) => v + 1);
    router.refresh();
  }

  async function completarDatos() {
    if (!perroId || !cot || cot.error !== null || cot.estado !== "faltan_datos") return;
    const quiereTamano = cot.faltan?.includes("tamano");
    const quierePelaje = cot.faltan?.includes("pelaje");
    if ((quiereTamano && !tamanoFalta) || (quierePelaje && !pelajeFalta)) {
      setError(`Elige ${quiereTamano && quierePelaje ? "el tamaño y el pelaje" : quiereTamano ? "el tamaño" : "el pelaje"} de ${perroElegido?.nombre ?? "el perro"}.`);
      return;
    }
    setError(null);
    const res = await completando.ejecutar(() => completarTallaPelajeDelPerro(perroId, quiereTamano ? tamanoFalta : null, quierePelaje ? pelajeFalta : null));
    if (res.error) {
      setError(res.error);
      return;
    }
    if (quierePelaje) {
      const pel = pelajes.find((x) => x.id === pelajeFalta);
      if (pel) setPelajeLocal((prev) => ({ ...prev, [perroId]: { clave: pel.clave, etiqueta: pel.etiqueta } }));
    }
    setTamanoFalta("");
    setPelajeFalta("");
    setVersion((v) => v + 1);
    router.refresh();
  }

  async function enviar() {
    if (!perroId) {
      setError("Elige un perro.");
      return;
    }
    if (!cot || cot.error !== null || cot.estado !== "ok") {
      setError("Todavía no hay un precio para esta cita: resuelve el aviso de arriba.");
      return;
    }
    if (grupoDeExcepcion && !motivoExcepcion.trim()) {
      setError("La excepción necesita un motivo.");
      return;
    }
    if (recargo.trim() && (!Number.isFinite(recargoNumero) || recargoNumero < 0)) {
      setError("El recargo tiene que ser un número de cero para arriba.");
      return;
    }
    if (recargoNumero > 0 && !motivoRecargo.trim()) {
      setError("El recargo necesita un motivo.");
      return;
    }
    if (tarifaModo === "no" && motivoTarifa.trim().length < 3) {
      setError("Para quitar la tarifa de guardería escribe el motivo.");
      return;
    }
    setError(null);
    const res = await enviando.ejecutar(() => crearCita({
      tarifaModo,
      motivoTarifa: tarifaModo === "no" ? motivoTarifa.trim() : null,
      grupoExcepcionId: grupoDeExcepcion,
      motivoExcepcion: grupoDeExcepcion ? motivoExcepcion.trim() : null,
      perroId,
      servicioId: servicioActual?.id ?? servicioId,
      recargo: recargoNumero > 0 ? recargoNumero : null,
      motivoRecargo: recargoNumero > 0 ? motivoRecargo.trim() : null,
      peloMaltratado,
      empleadoId,
      // datetime-local no trae huso horario: la hora tecleada es la del
      // negocio (su zona), no la del navegador.
      inicio: instanteDeHoraLocal(fechaHora, zona),
      estanciaId: estanciaId || null,
    }));
    if (res.error) {
      setError(res.error);
      return;
    }
    // En vez de salirse: se anota la cita y se ofrece agregar a otro perrito del mismo dueño.
    setAgendadas((prev) => [
      ...prev,
      { citaId: res.citaId as string, reservaId: res.reservaId as string, perroNombre: perroElegido?.nombre ?? "—", servicio: servicioActual?.nombre ?? "", precio: res.precio ?? 0, tarifa: Boolean(res.tarifaGuarderia) },
    ]);
    if (res.fin) setFechaHora(horaLocalParaInput(res.fin, zona));
    setPerroId("");
    setTarifaModo("auto");
    setMotivoTarifa("");
    setPeloMaltratado(false);
    setRecargo("");
    setMotivoRecargo("");
    setExcepcion(false);
    setGrupoElegido("");
    setMotivoExcepcion("");
    setNuevoPerro(false);
    router.refresh();
  }

  async function guardarNuevoPerro() {
    setError(null);
    if (!clienteId) return;
    const res = await creandoPerro.ejecutar(() =>
      crearPerritoEstetica(clienteId, { nombre: npNombre, razaId: npRaza.raza_id, razaTexto: npRaza.raza, tamanoId: npTamano, pelajeId: npPelaje })
    );
    if (res.error || !res.perroId) {
      setError(res.error ?? "No pudimos guardar al perrito.");
      return;
    }
    const pel = pelajes.find((x) => x.id === npPelaje);
    setPerrosExtra((prev) => [
      ...prev,
      { id: res.perroId as string, cliente_id: clienteId, nombre: npNombre.trim(), pelajeClave: pel?.clave ?? null, pelajeEtiqueta: pel?.etiqueta ?? null, tamanoId: npTamano, pelajeId: npPelaje },
    ]);
    setPerroId(res.perroId as string);
    setNuevoPerro(false);
    setNpNombre("");
    setNpRaza({ raza_id: null, raza: "" });
    setNpTamano("");
    setNpPelaje("");
    setVersion((v) => v + 1);
  }

  if (!clienteElegido) {
    return (
      <div className="flex flex-col gap-4">
        <BuscadorClientes clientes={clientes} onElegir={(c) => setClienteId(c.id)} nuevoCliente="estetica" autoFocus />
      </div>
    );
  }

  // UN solo aviso, el que corresponde: cuánto va a costar, o lo único que falta
  // para saberlo, con la salida ahí mismo (nunca un callejón sin salida).
  const nombrePerro = perroElegido?.nombre ?? "el perro";
  const faltanTamano = cot && cot.error === null && cot.estado === "faltan_datos" && cot.faltan?.includes("tamano");
  const faltanPelaje = cot && cot.error === null && cot.estado === "faltan_datos" && cot.faltan?.includes("pelaje");
  let avisoPrecio: React.ReactNode = null;
  if (perroId && servicioActual) {
    if (!cot) {
      avisoPrecio = <p data-aviso-precio="calculando" className="text-sm text-n-600">Calculando el precio…</p>;
    } else if (cot.error !== null) {
      avisoPrecio = (
        <Alert variante="error" titulo="No pudimos calcular el precio">
          {cot.error}
        </Alert>
      );
    } else if (cot.estado === "ok") {
      avisoPrecio = (
        <div data-aviso-precio="ok" className="flex flex-col gap-2 rounded-md border-l-4 border-menta bg-menta-suave px-3 py-2 text-n-900">
          <p>
            Precio: <strong className="tabular-nums">${(cot.precio ?? 0).toFixed(2)}</strong>
            {cot.maltratadoAplicado ? " (pelo maltratado)" : ""}
            {grupoDeExcepcion ? " · con excepción de grupo" : ""}
          </p>
          {cot.tarifaGuarderia && (
            <p data-tarifa-guarderia className="text-sm font-semibold text-menta-oscuro">
              Tarifa de cliente de guardería{cot.tarifaServicio ? `: el precio de «${cot.tarifaServicio}»` : ""}
              {cot.precioNormal != null ? ` (el baño normal costaría $${cot.precioNormal.toFixed(2)})` : ""}
              {cot.tarifaOrigen === "manual" ? " · puesta a mano" : " · automática, porque tiene guardería"}. No es un descuento.
            </p>
          )}
          {cot.tarifaAviso && <p className="text-sm text-ambar-oscuro">{cot.tarifaAviso}</p>}
          {puedeExcepcion && cot.tarifaGuarderia && tarifaModo !== "no" && (
            <div className="flex flex-col gap-2">
              <Field label="Motivo para quitar la tarifa" value={motivoTarifa} onChange={(e) => setMotivoTarifa(e.target.value)} ayuda="Solo si el dueño no la quiere o no corresponde. Queda con tu nombre." />
              <Button type="button" variante="secundario" className="self-start" disabled={motivoTarifa.trim().length < 3} onClick={() => setTarifaModo("no")}>
                Quitar la tarifa de guardería
              </Button>
            </div>
          )}
          {puedeExcepcion && !cot.tarifaGuarderia && cot.tarifaAplicable && (
            <Button type="button" variante="secundario" className="self-start" onClick={() => { setTarifaModo("si"); setMotivoTarifa(""); }}>
              {tarifaModo === "no" ? "Volver a poner la tarifa de guardería" : "Aplicar la tarifa de guardería a mano"}
            </Button>
          )}
          {tarifaModo === "no" && !cot.tarifaGuarderia && (
            <p className="text-sm text-n-700">Sin la tarifa de guardería (motivo: {motivoTarifa}).</p>
          )}
        </div>
      );
    } else if (cot.estado === "faltan_datos") {
      avisoPrecio = (
        <div data-aviso-precio="faltan-datos" className="flex flex-col gap-3 rounded-lg border-l-4 border-ambar bg-ambar-suave p-4">
          <p className="font-bold text-n-900">
            Para calcular el precio falta {faltanTamano && faltanPelaje ? "el tamaño y el pelaje" : faltanTamano ? "el tamaño" : "el pelaje"} de {nombrePerro}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {faltanTamano && (
              <Select label="Tamaño" value={tamanoFalta} onChange={(e) => setTamanoFalta(e.target.value)}>
                <option value="">Elige el tamaño</option>
                {tamanos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.etiqueta}
                  </option>
                ))}
              </Select>
            )}
            {faltanPelaje && (
              <Select label="Pelaje" value={pelajeFalta} onChange={(e) => setPelajeFalta(e.target.value)}>
                <option value="">Elige el pelaje</option>
                {pelajes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.etiqueta}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <Button type="button" className="self-start" cargando={completando.cargando} onClick={completarDatos}>
            Guardar en su expediente y calcular
          </Button>
        </div>
      );
    } else if (cot.estado === "pelaje_no_ofrecido") {
      avisoPrecio = null;
    } else {
      // sin_grupo, sin_precio o no_aplica: una sola caja.
      const sinGrupoAviso = cot.estado === "sin_grupo";
      avisoPrecio = (
        <div data-aviso-precio={cot.estado} className="flex flex-col gap-3 rounded-lg border-l-4 border-ambar bg-ambar-suave p-4">
          {sinGrupoAviso ? (
            <>
              <p className="font-bold text-n-900">
                {cot.motivo === "pelaje"
                  ? `El grupo «${cot.grupoNombre ?? "de este perro"}» no cobra automático a un perro de pelo ${perroElegido?.pelajeEtiqueta?.toLowerCase() ?? "sin capturar"}`
                  : `La raza ${cot.razaNombre ?? sinGrupo?.razaNombre ?? ""} todavía no tiene grupo de precio`}
              </p>
              <p className="text-sm text-n-800">
                {cot.motivo === "pelaje" ? (
                  <>
                    <Link href={`/perros/${perroId}`} className="font-semibold underline">Corrige su pelaje</Link> si está mal capturado, o registra una excepción solo para esta cita.
                  </>
                ) : puedeAsignarGrupo || puedeExcepcion ? (
                  "Asigna el grupo ahora o registra una excepción con motivo solo para esta cita."
                ) : (
                  "Pídele a admin que lo asigne, o a alguien con el permiso de excepciones al reservar."
                )}
              </p>
            </>
          ) : (
            <>
              <p className="font-bold text-n-900">
                Esta combinación no tiene precio{cot.grupoNombre ? ` en «${cot.grupoNombre}»` : ""}: agrega el precio en Servicios y precios, o registra una excepción con motivo.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={cot.rutaPrecios}
                  className="inline-flex min-h-12 items-center justify-center rounded-md border-[1.5px] border-morado bg-white px-5 text-base font-semibold text-morado hover:bg-morado-suave"
                >
                  Agregar el precio en Servicios y precios
                </Link>
                {puedeExcepcion && !excepcion && (
                  <Button type="button" variante="secundario" onClick={() => setExcepcion(true)}>
                    Registrar excepción con motivo
                  </Button>
                )}
              </div>
              {!puedeExcepcion && <p className="text-sm text-n-700">Para una excepción, pídele a alguien con el permiso de excepciones al reservar.</p>}
            </>
          )}
          {sinGrupoAviso && cot.motivo !== "pelaje" && puedeAsignarGrupo && sinGrupo && !excepcion && (
            <>
              <Select label="Grupo de precio" value={grupoElegido} onChange={(e) => setGrupoElegido(e.target.value)}>
                <option value="">Elige un grupo</option>
                {gruposPrecio.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nombre}
                  </option>
                ))}
              </Select>
              <Button type="button" className="self-start" disabled={!grupoElegido} cargando={asignando.cargando} onClick={asignarGrupo}>
                Asignarlo a la raza {sinGrupo.razaNombre}
              </Button>
            </>
          )}
          {sinGrupoAviso && puedeExcepcion && !excepcion && (
            <Button type="button" variante="secundario" className="self-start" onClick={() => setExcepcion(true)}>
              Registrar excepción con motivo
            </Button>
          )}
        </div>
      );
    }
  }

  // La excepción (grupo + motivo) se queda a la vista aunque ya haya precio: si no, al elegir el grupo desaparecería el campo del motivo.
  const bloqueExcepcion = excepcion && puedeExcepcion && perroId ? (
    <div data-excepcion className="flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
      <p className="font-semibold text-n-900">Excepción solo para esta cita</p>
      <Select label="Grupo de precio" value={grupoElegido} onChange={(e) => setGrupoElegido(e.target.value)}>
        <option value="">Elige el grupo con el que cobrar</option>
        {gruposPrecio.map((g) => (
          <option key={g.id} value={g.id}>
            {g.nombre}
          </option>
        ))}
      </Select>
      <Field label="Motivo de la excepción" value={motivoExcepcion} onChange={(e) => setMotivoExcepcion(e.target.value)} ayuda="Queda registrado con tu nombre." />
      <Button type="button" variante="secundario" className="self-start" onClick={() => { setExcepcion(false); setGrupoElegido(""); setMotivoExcepcion(""); }}>
        Quitar la excepción
      </Button>
    </div>
  ) : null;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
        <div>
          <p className="text-sm text-n-600">Cliente</p>
          <p className="font-bold text-n-900">{clienteElegido.nombre}</p>
        </div>
        <Button type="button" variante="secundario" onClick={() => setClienteId(null)}>
          Cambiar cliente
        </Button>
      </div>

      {agendadas.length > 0 && (
        <div data-citas-agendadas className="flex flex-col gap-3 rounded-lg border-[1.5px] border-menta bg-menta-suave p-4">
          <p className="font-bold text-menta-oscuro">
            {agendadas.length === 1 ? "Cita agendada" : `${agendadas.length} citas agendadas para ${clienteElegido.nombre}`}
          </p>
          <ul className="flex flex-col gap-1 text-sm text-n-900">
            {agendadas.map((a) => (
              <li key={a.citaId}>
                <Link href={`/estetica/${a.citaId}`} className="font-semibold text-morado hover:underline">
                  {a.perroNombre} — {a.servicio}
                </Link>{" "}
                · ${a.precio.toFixed(2)}
                {a.tarifa ? " (tarifa de guardería)" : ""} · su propia cuenta
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variante="secundario" data-agregar-otro-perrito onClick={() => { setPerroId(""); setNuevoPerro(false); }}>
              Agregar otro perrito de {clienteElegido.nombre}
            </Button>
            {agendadas.length > 1 && (
              <Link
                href={`/caja/cobrar-junto?cuentas=${agendadas.map((a) => a.reservaId).join(",")}`}
                data-cobrar-juntas
                className="inline-flex min-h-12 items-center justify-center rounded-md border-[1.5px] border-morado bg-white px-5 text-base font-semibold text-morado hover:bg-morado-suave"
              >
                Cobrar las {agendadas.length} cuentas juntas
              </Link>
            )}
            <Link href="/estetica" className="inline-flex min-h-12 items-center justify-center rounded-md px-5 text-base font-semibold text-n-700 hover:bg-n-100">
              Listo, ir a la agenda
            </Link>
          </div>
          <p className="text-sm text-n-700">Cada perrito tiene su cita y su cuenta. Al cobrar puedes juntarlas en un solo pago (Caja → Cobrar todo junto).</p>
        </div>
      )}

      {nuevoPerro || perrosDelCliente.length === 0 ? (
        <div data-nuevo-perrito className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
          <p className="font-bold text-n-900">
            {perrosDelCliente.length === 0 ? `Registra el perrito de ${clienteElegido.nombre}` : `Otro perrito de ${clienteElegido.nombre}`}
          </p>
          <p className="text-sm text-n-600">Solo lo que hace falta para el baño: nombre, raza, tamaño y pelaje. Nada de guardería u hotel.</p>
          <Field label="Nombre del perrito" value={npNombre} onChange={(e) => setNpNombre(e.target.value)} />
          <SelectorRaza razas={razas} label="Raza" mostrarGrupo valorId={npRaza.raza_id} valorTexto={npRaza.raza} onCambio={(v) => setNpRaza({ raza_id: v.raza_id, raza: v.raza })} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select label="Tamaño" value={npTamano} onChange={(e) => setNpTamano(e.target.value)}>
              <option value="">Elige el tamaño</option>
              {tamanos.map((t) => (
                <option key={t.id} value={t.id}>{t.etiqueta}</option>
              ))}
            </Select>
            <Select label="Pelaje" value={npPelaje} onChange={(e) => setNpPelaje(e.target.value)}>
              <option value="">Elige el pelaje</option>
              {pelajes.map((p) => (
                <option key={p.id} value={p.id}>{p.etiqueta}</option>
              ))}
            </Select>
          </div>
          <AccionesFormulario error={error}>
            <Button type="button" cargando={creandoPerro.cargando} onClick={guardarNuevoPerro}>
              Guardar y agendarle su cita
            </Button>
            {perrosDelCliente.length > 0 && (
              <Button type="button" variante="secundario" onClick={() => { setNuevoPerro(false); setError(null); }}>
                Mejor elegir uno que ya tiene
              </Button>
            )}
          </AccionesFormulario>
        </div>
      ) : (
        <>
          <Select label="Perro" value={perroId} onChange={(e) => { setPerroId(e.target.value); setEstanciaId(""); setGrupoElegido(""); setExcepcion(false); setMotivoExcepcion(""); setTamanoFalta(""); setPelajeFalta(""); setTarifaModo("auto"); setMotivoTarifa(""); }}>
            <option value="">Elige un perro</option>
            {perrosDelCliente.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>

          <Button type="button" variante="secundario" className="self-start" data-agregar-perrito onClick={() => { setNuevoPerro(true); setError(null); }}>
            Agregar otro perrito de este cliente
          </Button>

          {perroId && perrosConAvisoSanitario.includes(perroId) && (
            <Alert variante="advertencia" titulo="Trae requisitos sanitarios vencidos o sin registro">
              La cita de estética se agenda igual: las vacunas se exigen en guardería y hotel, no en el baño. Pero este
              perro sí usa guardería u hotel, y ahí sí lo van a detener: conviene ponerlo al día.
            </Alert>
          )}

          {avisoPrecio}
          {bloqueExcepcion}

          {estanciasDelPerro.length > 0 && (
            <Select
              label="¿Ligar a una estancia en curso? (opcional)"
              value={estanciaId}
              onChange={(e) => setEstanciaId(e.target.value)}
              ayuda="El perro ya está adentro — esta cita no genera una entrada/salida aparte."
            >
              <option value="">No, es una visita suelta</option>
              {estanciasDelPerro.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.servicioNombre}
                </option>
              ))}
            </Select>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="Servicio" value={servicioActual?.id ?? ""} onChange={(e) => { setServicioId(e.target.value); setTarifaModo("auto"); setMotivoTarifa(""); }}>
              {serviciosOfrecidos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
            <Select
              label="Empleado"
              value={empleadoId}
              onChange={(e) => setEmpleadoId(e.target.value)}
              disabled={rolActual === "estetica"}
              ayuda={rolActual === "estetica" ? "Solo puedes agendar en tu propia agenda." : undefined}
            >
              {empleados.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nombre_completo ?? "—"}
                </option>
              ))}
            </Select>
          </div>

          {noOfrecidos.length > 0 && (
            <p className="text-sm text-n-600">
              {noOfrecidos.map((s) => s.nombre).join(", ")} no se ofrece a perros de pelo {perroElegido?.pelajeEtiqueta?.toLowerCase()}.
            </p>
          )}

          {servicioActual && (servicioActual.incluye.length > 0 || servicioActual.no_incluye) && (
            <div data-incluye className="rounded-md border border-n-200 bg-n-50 p-3 text-sm text-n-800">
              {servicioActual.incluye.length > 0 && (
                <>
                  <p className="font-semibold text-n-900">Incluye</p>
                  <ul className="mt-1 list-disc pl-5">
                    {servicioActual.incluye.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </>
              )}
              {servicioActual.no_incluye && <p className="mt-2 text-n-700">{servicioActual.no_incluye}</p>}
            </div>
          )}
          <p data-nota-costo className="text-sm text-n-600">El costo puede aumentar según el tipo de pelo y el cuidado previo.</p>

          {empleados.length === 0 && (
            <Alert variante="advertencia" titulo="No hay nadie que pueda quedar como responsable de la cita">
              No hay ninguna cuenta con rol de estética (ni de admin) dada de alta. La cita necesita un responsable, así
              que no se puede agendar todavía.{" "}
              <Link href="/admin" className="font-semibold underline">
                Invita al personal de estética desde el panel de admin →
              </Link>
            </Alert>
          )}

          {/* Solo se ofrece en el servicio que de verdad tiene precio
              alternativo. En los demás la casilla no haría nada y sería
              una pregunta de más en el mostrador. */}
          {servicioActual?.tiene_precio_maltratado && (
            <label className="flex items-start gap-2 rounded-md border-[1.5px] border-n-200 bg-white p-3 text-n-900">
              <input
                type="checkbox"
                checked={peloMaltratado}
                onChange={(e) => setPeloMaltratado(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span>
                Llegó con el pelo maltratado
                <span className="block text-sm text-n-600">
                  Cobra el precio alternativo de este mismo baño, no un cargo aparte.
                </span>
              </span>
            </label>
          )}

          {puedeExcepcion && (
            <div className="flex flex-col gap-2 rounded-md border border-n-200 p-3">
              <Field
                label="Recargo manual (opcional)"
                inputMode="decimal"
                value={recargo}
                onChange={(e) => setRecargo(e.target.value)}
                ayuda="Se suma al precio de la cita. Queda registrado con tu nombre y su motivo."
              />
              {recargoNumero > 0 && <Field label="Motivo del recargo" value={motivoRecargo} onChange={(e) => setMotivoRecargo(e.target.value)} />}
            </div>
          )}

          <Field
            label="Fecha y hora"
            type="datetime-local"
            value={fechaHora}
            onChange={(e) => setFechaHora(e.target.value)}
          />

          <AccionesFormulario error={error}>
            <Button
              type="button"
              disabled={enviando.cargando || !perroId || !empleadoId || !(cot && cot.error === null && cot.estado === "ok")}
              onClick={enviar}
            >
              {enviando.cargando ? "Agendando…" : "Agendar cita"}
            </Button>
          </AccionesFormulario>
        </>
      )}
    </div>
  );
}
