"use client";

import Link from "next/link";

import { useMemo, useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { BuscadorClientes } from "@/components/buscador-clientes";
import type { ClienteBuscable } from "@/lib/clientes/buscables";
import { hoyNegocio, instanteDeHoraLocal } from "@/lib/formato";
import { crearCita } from "../agenda-actions";
import { asignarGrupoDePropuesta, asignarGrupoDeRaza } from "../../perros/razas/grupos-actions";
import { useZonaNegocio } from "@/components/zona-negocio";

type Perro = { id: string; cliente_id: string; nombre: string; pelajeClave: string | null; pelajeEtiqueta: string | null };
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
  puedeAsignarGrupo,
  puedeExcepcion,
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
  puedeAsignarGrupo: boolean;
  puedeExcepcion: boolean;
  rolActual: string;
  userIdActual: string;
}) {
  const zona = useZonaNegocio();
  const router = useRouter();
  const [clienteId, setClienteId] = useState<string | null>(null);
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
  const enviando = useEspera();
  const [error, setError] = useState<string | null>(null);

  const clienteElegido = clientes.find((c) => c.id === clienteId) ?? null;
  const perrosDelCliente = useMemo(() => perros.filter((p) => p.cliente_id === clienteId), [perros, clienteId]);
  const estanciasDelPerro = estanciasEnCurso.filter((e) => e.perroId === perroId);
  const sinGrupo = perrosSinGrupo.find((p) => p.perroId === perroId) ?? null;
  const perroElegido = perros.find((p) => p.id === perroId) ?? null;
  // Un servicio que no se ofrece al pelaje del perro (el rapado, a pelo
  // corto) ni aparece: enseñar una opción que va a rebotar no ayuda.
  const noOfrecidos = servicios.filter((s) => perroElegido?.pelajeClave && s.pelajes_excluidos.includes(perroElegido.pelajeClave));
  const serviciosOfrecidos = servicios.filter((s) => !noOfrecidos.includes(s));
  const servicioActual = serviciosOfrecidos.find((s) => s.id === servicioId) ?? serviciosOfrecidos[0] ?? null;
  const recargoNumero = Number(recargo.replace(",", "."));

  async function asignarGrupo() {
    if (!sinGrupo || !grupoElegido) return;
    setError(null);
    const res = await asignando.ejecutar(() => (sinGrupo.razaId ? asignarGrupoDeRaza(sinGrupo.razaId, grupoElegido) : asignarGrupoDePropuesta(sinGrupo.propuestaId ?? "", grupoElegido)));
    if (res.error) {
      setError(res.error);
      return;
    }
    setGrupoElegido("");
    router.refresh();
  }

  async function enviar() {
    if (!perroId) {
      setError("Elige un perro.");
      return;
    }
    if (sinGrupo && (!excepcion || !grupoElegido || !motivoExcepcion.trim())) {
      setError(
        sinGrupo.motivo === "pelaje"
          ? "El grupo de este perro no cobra automático a su pelaje. Corrige el pelaje en su expediente, o registra una excepción con grupo y motivo."
          : `La raza ${sinGrupo.razaNombre} todavía no tiene grupo de precio en este negocio. Asígnaselo arriba, o registra una excepción con grupo y motivo.`
      );
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
    setError(null);
    const res = await enviando.ejecutar(() => crearCita({
      grupoExcepcionId: sinGrupo ? grupoElegido : null,
      motivoExcepcion: sinGrupo ? motivoExcepcion.trim() : null,
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
    router.push(`/estetica/${res.citaId}`);
  }

  if (!clienteElegido) {
    return (
      <div className="flex flex-col gap-4">
        <BuscadorClientes clientes={clientes} onElegir={(c) => setClienteId(c.id)} nuevoCliente="estetica" autoFocus />
      </div>
    );
  }

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

      {perrosDelCliente.length === 0 ? (
        <Alert variante="advertencia" titulo="Este cliente no tiene perros registrados">
          Da de alta al perro antes de poder agendarle una cita.
        </Alert>
      ) : (
        <>
          <Select label="Perro" value={perroId} onChange={(e) => { setPerroId(e.target.value); setEstanciaId(""); setGrupoElegido(""); setExcepcion(false); setMotivoExcepcion(""); }}>
            <option value="">Elige un perro</option>
            {perrosDelCliente.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>

          {perroId && perrosConAvisoSanitario.includes(perroId) && (
            <Alert variante="advertencia" titulo="Trae requisitos sanitarios vencidos o sin registro">
              La cita de estética se agenda igual: las vacunas se exigen en guardería y hotel, no en el baño. Pero este
              perro sí usa guardería u hotel, y ahí sí lo van a detener: conviene ponerlo al día.
            </Alert>
          )}

          {sinGrupo && (
            <div className="flex flex-col gap-3 rounded-lg border-l-4 border-ambar bg-ambar-suave p-4">
              {sinGrupo.motivo === "pelaje" ? (
                <>
                  <p className="font-bold text-n-900">
                    {sinGrupo.grupoNombre ? `El grupo «${sinGrupo.grupoNombre}»` : "El grupo de este perro"} no cobra automático a un perro de pelo {perroElegido?.pelajeEtiqueta?.toLowerCase() ?? "sin capturar"}
                  </p>
                  <p className="text-sm text-n-800">
                    La app no adivina el precio de un baño.{" "}
                    <Link href={`/perros/${perroId}`} className="font-semibold underline">Corrige su pelaje</Link> si está mal capturado.{" "}
                    {puedeExcepcion ? "Si no, registra una excepción solo para esta cita." : "Si no, pídele a alguien con el permiso de excepciones al reservar que la registre."}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-n-900">La raza {sinGrupo.razaNombre} todavía no tiene grupo de precio</p>
                  <p className="text-sm text-n-800">
                    La app no adivina el precio de un baño. {puedeAsignarGrupo || puedeExcepcion ? "Asigna el grupo ahora o registra una excepción solo para esta cita." : "Pídele a admin que lo asigne, o a alguien con el permiso de excepciones al reservar."}
                  </p>
                </>
              )}
              {(sinGrupo.motivo === "sin_grupo" || puedeExcepcion) && (
                <Select label="Grupo de precio" value={grupoElegido} onChange={(e) => setGrupoElegido(e.target.value)}>
                  <option value="">Elige un grupo</option>
                  {gruposPrecio.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nombre}
                    </option>
                  ))}
                </Select>
              )}
              {puedeAsignarGrupo && sinGrupo.motivo === "sin_grupo" && (
                <Button type="button" className="self-start" disabled={!grupoElegido} cargando={asignando.cargando} onClick={asignarGrupo}>
                  Asignarlo a la raza {sinGrupo.razaNombre}
                </Button>
              )}
              {puedeExcepcion && (
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-n-800">
                    <input type="checkbox" className="h-5 w-5" checked={excepcion} onChange={(e) => setExcepcion(e.target.checked)} />
                    Solo para esta cita, con el grupo que elegí (excepción)
                  </label>
                  {excepcion && <Field label="Motivo de la excepción" value={motivoExcepcion} onChange={(e) => setMotivoExcepcion(e.target.value)} ayuda="Queda registrado con tu nombre." />}
                </div>
              )}
            </div>
          )}

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
            <Select label="Servicio" value={servicioActual?.id ?? ""} onChange={(e) => setServicioId(e.target.value)}>
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

          {error && (
            <Alert variante="error" titulo="No se pudo agendar">
              {error}
            </Alert>
          )}

          <Button type="button" disabled={enviando.cargando || !perroId || !empleadoId} onClick={enviar} className="self-start">
            {enviando.cargando ? "Agendando…" : "Agendar cita"}
          </Button>
        </>
      )}
    </div>
  );
}
