"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { BorradorFormulario } from "@/lib/borradores/borrador-formulario";
import { useRegistroVivo } from "@/components/concurrencia/registro-vivo";
import { SECCIONES_CONSULTA, type ConsultaVet, type Diagnostico, type DiagnosticoBuscado } from "@/lib/veterinaria/expediente";
import { DictadoPanel } from "./dictado-panel";
import { CargosConsulta } from "./cargos-consulta";
import { dinero } from "@/lib/dinero";
import type { CargosConsulta as DatosCargos } from "@/lib/veterinaria/cargos-consulta";
import { AvisoConflicto } from "@/components/concurrencia/aviso-conflicto";
import type { Conflicto } from "@/lib/concurrencia/tipos";
import { agregarDiagnosticoNegocio, buscarDiagnosticos, descartarBorrador, firmarConsulta, guardarBorrador, type DatosBorrador } from "../../expediente/actions";
import { EVENTO_APLICACION_CONSULTA, type AplicacionConsulta } from "@/lib/veterinaria/aplicacion-consulta";

type Valores = Record<string, string>;
const NUMERICOS = ["peso_kg", "temperatura_c", "frecuencia_cardiaca", "frecuencia_respiratoria", "condicion_corporal", "tllc_seg"] as const;
const TEXTOS = ["motivo", "anamnesis", "examen_fisico", "hallazgos", "plan", "tratamiento", "notas_internas", "mucosas", "hidratacion"] as const;

function inicial(c: ConsultaVet): Valores {
  const v: Valores = {};
  for (const k of TEXTOS) v[k] = (c[k as keyof ConsultaVet] as string | null) ?? "";
  for (const k of NUMERICOS) v[k] = c[k as keyof ConsultaVet] == null ? "" : String(c[k as keyof ConsultaVet]);
  return v;
}

const ETIQUETA_ESTADO: Record<string, string> = {
  limpio: "",
  pendiente: "Cambios sin guardar…",
  guardando: "Guardando…",
  guardado: "Borrador guardado",
  error: "No se pudo guardar",
};

/** El borrador de una consulta: se guarda solo (a los 1.5 s de dejar de escribir) y se firma desde aquí. */
export function EditorConsulta({ consulta, especie, soyElMedico, nombreMedico, cargosIniciales, puedeCatalogo = false, aplicarVacuna, aplicarDesparasitacion, seAnulanAlDescartar = [], puedeEmitirReceta = false }: { consulta: ConsultaVet; especie: string | null; soyElMedico: boolean; nombreMedico: string; cargosIniciales: DatosCargos | null; puedeCatalogo?: boolean; aplicarVacuna?: ReactNode; aplicarDesparasitacion?: ReactNode; seAnulanAlDescartar?: string[]; puedeEmitirReceta?: boolean }) {
  const router = useRouter();
  const [v, setV] = useState<Valores>(() => inicial(consulta));
  const [dx, setDx] = useState<Diagnostico[]>(consulta.diagnosticos ?? []);
  const [estado, setEstado] = useState<"limpio" | "pendiente" | "guardando" | "guardado" | "error">("limpio");
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [errorFirma, setErrorFirma] = useState<string | null>(null);
  const recetaEnvio = useEspera();
  // QA S41 (N140): firmada, la pantalla lo dice con la respuesta (registros publicados por useEspera), sin esperar a recargar.
  const [avisoFirmada, setAvisoFirmada] = useState<string | null>(null);
  const vivo = useRegistroVivo("vet_consultas", consulta.id, { estado: consulta.estado as string }, consulta.updated_at);
  const [cargos, setCargos] = useState<DatosCargos | null>(cargosIniciales);
  // Lo que el servidor recalcula (p. ej. al aplicar una vacuna) reemplaza lo mostrado.
  // QA S27: una vacuna o desparasitación registrada aquí trae sus cargos ya sincronizados en la respuesta.
  useEffect(() => {
    function alAplicar(e: Event) {
      const d = (e as CustomEvent<AplicacionConsulta>).detail;
      if (d.consultaId === consulta.id && d.cargos) setCargos(d.cargos);
    }
    window.addEventListener(EVENTO_APLICACION_CONSULTA, alAplicar);
    return () => window.removeEventListener(EVENTO_APLICACION_CONSULTA, alAplicar);
  }, [consulta.id]);
  const [cargosPrevios, setCargosPrevios] = useState(cargosIniciales);
  if (cargosIniciales !== cargosPrevios) {
    setCargosPrevios(cargosIniciales);
    setCargos(cargosIniciales);
  }
  const ultimo = useRef<{ v: Valores; dx: Diagnostico[] }>({ v: inicial(consulta), dx: consulta.diagnosticos ?? [] });
  const sucios = useRef<Set<string>>(new Set());
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardadoEnvio = useEspera();
  // QA N43: la versión del borrador que esta pestaña tiene; si otra persona lo cambia, no se pisa.
  const version = useRef<string | null>(consulta.updated_at ?? null);
  const [conflicto, setConflicto] = useState<Conflicto | null>(null);
  const forzarSiguiente = useRef(false);
  const firmaEnvio = useEspera();
  const descarteEnvio = useEspera();
  // QA S18 (N94): confirmar en la pantalla, nunca con window.confirm (un navegador que bloquea diálogos lo contesta «no» en silencio).
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);
  // QA S19: la firma se confirma en la pantalla (nunca window.confirm: un navegador que bloquea diálogos lo contesta «no»).
  const [confirmandoFirma, setConfirmandoFirma] = useState<string | null>(null);
  const [exitoDescarte, setExitoDescarte] = useState<string | null>(null);

  // Avisa si se intenta cerrar la pestaña con cambios sin guardar.
  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => {
      if (sucios.current.size > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, []);

  async function guardarAhora(): Promise<boolean> {
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
    if (sucios.current.size === 0) return true;
    if (conflicto && !forzarSiguiente.current) return false;
    const claves = [...sucios.current];
    sucios.current.clear();
    const datos: Record<string, unknown> = {};
    for (const k of claves) {
      if (k === "diagnosticos") datos[k] = ultimo.current.dx;
      else if ((NUMERICOS as readonly string[]).includes(k)) {
        const t = (ultimo.current.v[k] ?? "").replace(",", ".").trim();
        datos[k] = t === "" ? null : Number(t);
      } else datos[k] = ultimo.current.v[k] ?? "";
    }
    setEstado("guardando");
    const forzar = forzarSiguiente.current;
    forzarSiguiente.current = false;
    const r = await guardadoEnvio.ejecutar(() =>
      guardarBorrador(consulta.id, datos as DatosBorrador, { versiones: version.current ? [{ t: "vet_consultas", i: consulta.id, v: version.current }] : [], forzar })
    );
    if (r.conflicto) {
      for (const k of claves) sucios.current.add(k);
      setConflicto(r.conflicto);
      setEstado("error");
      setErrorGuardado(null);
      return false;
    }
    setConflicto(null);
    if (r.guardado_at) version.current = r.guardado_at;
    if (r.error) {
      for (const k of claves) sucios.current.add(k);
      setEstado("error");
      setErrorGuardado(r.error);
      return false;
    }
    setErrorGuardado(null);
    setEstado(sucios.current.size > 0 ? "pendiente" : "guardado");
    return true;
  }

  function programar() {
    setEstado("pendiente");
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      void guardarAhora();
    }, 1500);
  }

  function cambiar(clave: string, valor: string) {
    ultimo.current.v = { ...ultimo.current.v, [clave]: valor };
    setV(ultimo.current.v);
    sucios.current.add(clave);
    programar();
  }

  function cambiarDx(nuevo: Diagnostico[]) {
    ultimo.current.dx = nuevo;
    setDx(nuevo);
    sucios.current.add("diagnosticos");
    programar();
  }

  async function firmar() {
    setErrorFirma(null);
    if (dx.length === 0) {
      setErrorFirma("Agrega al menos un diagnóstico (presuntivo o definitivo) en «A · Diagnóstico» antes de firmar.");
      return;
    }
    if (cargos && cargos.sin_precio > 0) {
      setErrorFirma(`Falta el precio de ${cargos.sin_precio === 1 ? "un cargo" : `${cargos.sin_precio} cargos`}. Ponlo en «Cargos de esta consulta» (o márcalo «Sin cobro» con su motivo) y vuelve a firmar.`);
      return;
    }
    const resumenCobro = cargos && cargos.total > 0 ? ` Pasarán a Caja ${dinero(cargos.total)} en cargos.` : "";
    setConfirmandoFirma(`Al firmar, la consulta ya no se edita: solo admitirá una adenda firmada.${resumenCobro} ¿Firmar con tu cédula?`);
  }

  async function firmarConfirmado() {
    setErrorFirma(null);
    if (!(await guardarAhora())) {
      setConfirmandoFirma(null);
      setErrorFirma("No se pudo guardar el borrador; revisa el aviso de arriba antes de firmar.");
      return;
    }
    const r = await firmaEnvio.ejecutar(() => firmarConsulta(consulta.id));
    setConfirmandoFirma(null);
    if (r.error) {
      setErrorFirma(r.error);
      return;
    }
    setAvisoFirmada(r.exito ?? "Consulta firmada. Ya no se edita: solo admite una adenda.");
    router.refresh();
  }

  // El borrador del dictado entra por las mismas rutas que lo que se escribe a mano (se autoguarda).
  function aplicarDictado(campos: Record<string, string>, nuevos: Diagnostico[]) {
    for (const [clave, valor] of Object.entries(campos)) cambiar(clave, valor);
    if (nuevos.length > 0) cambiarDx([...ultimo.current.dx, ...nuevos.filter((n) => !ultimo.current.dx.some((d) => d.ref_id === n.ref_id))]);
  }

  const grupos = Array.from(new Set(SECCIONES_CONSULTA.map((s) => s.grupo)));

  if (avisoFirmada || vivo.estado !== "borrador") {
    return (
      <Alert variante="exito" titulo="Consulta firmada">
        <span data-consulta-firmada>{avisoFirmada ?? "Ya no se edita: solo admite una adenda."}</span>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Respaldo en el servidor de lo escrito, por si se pierde la conexión o se cierra la pestaña a medias. */}
      <BorradorFormulario formulario="consulta" clave={consulta.id} />
      <div role="status" aria-live="polite" className={`sticky top-0 z-10 -mx-1 rounded-md px-3 py-2 text-sm font-semibold ${estado === "error" ? "bg-coral-suave text-coral-oscuro" : "bg-n-50 text-n-600"}`}>
        {ETIQUETA_ESTADO[estado] || "Borrador: se guarda solo mientras escribes."}
        {errorGuardado && <span> · {errorGuardado}</span>}
      </div>
      {/* QA S49: la receta también sale de la consulta abierta. Guarda lo escrito y abre la receta prellenada con el
          «Tratamiento» de este momento (la base deja ligarla a un borrador o a una firmada, nunca a una anulada). */}
      {puedeEmitirReceta && (
        <Button
          type="button"
          className="self-start"
          cargando={recetaEnvio.cargando}
          data-emitir-receta
          onClick={async () => {
            const r = await recetaEnvio.correr(() => guardarAhora());
            // Si no se pudo guardar, el aviso de arriba ya dice por qué.
            if (r.ok && r.valor) window.location.assign(`/veterinaria/recetas/nueva?perro=${consulta.perro_id}&consulta=${consulta.id}`);
          }}
        >
          Emitir receta
        </Button>
      )}
      {conflicto && (
        <AvisoConflicto
          conflicto={conflicto}
          registro="esta consulta"
          cargando={guardadoEnvio.cargando}
          onRecargar={() => window.location.reload()}
          onGuardarEncima={() => {
            forzarSiguiente.current = true;
            setConflicto(null);
            void guardarAhora();
          }}
        />
      )}

      <DictadoPanel consultaId={consulta.id} valores={v} diagnosticos={dx} onAplicar={aplicarDictado} />

      {grupos.map((g) => (
        <section key={g} className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">{g}</h2>
          {g.startsWith("O") && (
            <fieldset className="rounded-md border border-n-200 bg-n-50 p-4">
              <legend className="px-1 text-sm font-semibold text-n-700">Signos vitales</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Peso (kg)" name="peso_kg" inputMode="decimal" value={v.peso_kg} onChange={(e) => cambiar("peso_kg", e.target.value)} ayuda="Al firmar entra al historial de pesos." />
                <Field label="Temperatura (°C)" name="temperatura_c" inputMode="decimal" value={v.temperatura_c} onChange={(e) => cambiar("temperatura_c", e.target.value)} />
                <Field label="Frec. cardiaca (lpm)" name="frecuencia_cardiaca" inputMode="numeric" value={v.frecuencia_cardiaca} onChange={(e) => cambiar("frecuencia_cardiaca", e.target.value)} />
                <Field label="Frec. respiratoria (rpm)" name="frecuencia_respiratoria" inputMode="numeric" value={v.frecuencia_respiratoria} onChange={(e) => cambiar("frecuencia_respiratoria", e.target.value)} />
                <Select label="Condición corporal (1–9)" name="condicion_corporal" value={v.condicion_corporal} onChange={(e) => cambiar("condicion_corporal", e.target.value)}>
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <option key={n} value={n}>
                      {n} · {n <= 3 ? "delgado" : n <= 5 ? "ideal" : n <= 7 ? "sobrepeso" : "obesidad"}
                    </option>
                  ))}
                </Select>
                <Field label="TLLC (segundos)" name="tllc_seg" inputMode="decimal" value={v.tllc_seg} onChange={(e) => cambiar("tllc_seg", e.target.value)} />
                <Field label="Mucosas" name="mucosas" value={v.mucosas} onChange={(e) => cambiar("mucosas", e.target.value)} placeholder="Rosadas, húmedas…" />
                <Field label="Hidratación" name="hidratacion" value={v.hidratacion} onChange={(e) => cambiar("hidratacion", e.target.value)} placeholder="Normal, 5 %…" />
              </div>
            </fieldset>
          )}
          {SECCIONES_CONSULTA.filter((s) => s.grupo === g).map((s) => (
            <Textarea key={s.clave} label={s.etiqueta} name={s.clave} rows={s.filas} value={v[s.clave]} onChange={(e) => cambiar(s.clave, e.target.value)} />
          ))}
          {g.startsWith("P") && (
            <Textarea label="Notas internas (nunca las ve el dueño)" name="notas_internas" rows={2} value={v.notas_internas} onChange={(e) => cambiar("notas_internas", e.target.value)} />
          )}
          {g.startsWith("O") && (
            <div className="rounded-md border border-n-200 bg-n-50 p-4">
              <h3 className="mb-2 text-sm font-bold text-n-800">
                A · Diagnóstico (mín. 1) <span className="text-coral-oscuro" aria-hidden="true">*</span>
                <span className="sr-only">obligatorio para firmar</span>
              </h3>
              {dx.length === 0 && (
                <p data-dx-obligatorio className="mb-2 text-sm font-semibold text-ambar-oscuro">Obligatorio para firmar: agrega al menos un diagnóstico, presuntivo o definitivo.</p>
              )}
              <SelectorDiagnosticos valor={dx} onCambio={cambiarDx} especie={especie} />
            </div>
          )}
        </section>
      ))}

      {cargos && <CargosConsulta consultaId={consulta.id} inicial={cargos} puedeAgregar onResumen={setCargos} puedeCatalogo={puedeCatalogo} aplicarVacuna={aplicarVacuna} aplicarDesparasitacion={aplicarDesparasitacion} />}

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Firmar</h2>
        {soyElMedico ? (
          <p className="text-n-700">Firmas como <strong>{nombreMedico}</strong>, con tu cédula. Después de firmar la consulta no se edita: solo admite una adenda firmada.</p>
        ) : (
          <Alert variante="info" titulo="Solo la firma el médico">
            Esta consulta está a cargo de <strong>{nombreMedico}</strong>: quien la firma es él o ella, con su cédula. Puedes dejar el borrador listo.
          </Alert>
        )}
        <AccionesFormulario error={errorFirma} exito={exitoDescarte}>
          {soyElMedico && !confirmandoFirma && (
            <Button type="button" cargando={firmaEnvio.cargando} onClick={firmar}>
              Firmar la consulta
            </Button>
          )}
          {soyElMedico && confirmandoFirma && (
            <div className="flex w-full flex-col gap-2 rounded-md border-[1.5px] border-morado bg-morado-suave p-3" data-confirmar-firma>
              <p className="text-sm font-semibold text-n-900">{confirmandoFirma}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" cargando={firmaEnvio.cargando} onClick={firmarConfirmado}>
                  {firmaEnvio.cargando ? "Firmando…" : "Sí, firmar"}
                </Button>
                <Button type="button" variante="secundario" disabled={firmaEnvio.cargando} onClick={() => setConfirmandoFirma(null)}>
                  No, seguir editando
                </Button>
              </div>
            </div>
          )}
          <Button type="button" variante="secundario" onClick={() => void guardarAhora()}>
            Guardar ahora
          </Button>
          {!confirmandoDescarte ? (
            <Button type="button" variante="peligro" onClick={() => { setErrorFirma(null); setConfirmandoDescarte(true); }} data-descartar-borrador>
              Descartar borrador
            </Button>
          ) : (
            <div className="flex w-full flex-col gap-2 rounded-md border-[1.5px] border-coral bg-coral-suave p-3" data-confirmar-descarte>
              <p className="text-sm font-semibold text-coral-oscuro" data-texto-descarte>{textoDescarte(seAnulanAlDescartar)}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variante="peligro"
                  cargando={descarteEnvio.cargando}
                  onClick={async () => {
                    sucios.current.clear();
                    const r = await descarteEnvio.ejecutar(() => descartarBorrador(consulta.id, consulta.perro_id));
                    if (r.error) {
                      setConfirmandoDescarte(false);
                      setErrorFirma(r.error);
                      return;
                    }
                    setExitoDescarte("Borrador descartado.");
                    // QA S19: navegación completa DESPUÉS de la respuesta: el autoguardado de esta pantalla ya no corre
                    // y la agenda o el expediente se cargan de nuevo con «Borrador descartado».
                    window.location.assign(r.ir ?? `/veterinaria/expediente/${consulta.perro_id}?aviso=descartado`);
                  }}
                >
                  {descarteEnvio.cargando ? "Descartando…" : "Sí, descartar"}
                </Button>
                <Button type="button" variante="secundario" disabled={descarteEnvio.cargando} onClick={() => setConfirmandoDescarte(false)}>
                  No, seguir editando
                </Button>
              </div>
            </div>
          )}
        </AccionesFormulario>
      </section>
    </div>
  );
}

/** Busca en el catálogo (y en los del negocio) y arma la lista de diagnósticos presuntivos y definitivos. */
function SelectorDiagnosticos({ valor, onCambio, especie }: { valor: Diagnostico[]; onCambio: (d: Diagnostico[]) => void; especie: string | null }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<DiagnosticoBuscado[]>([]);
  const [tipo, setTipo] = useState<"presuntivo" | "definitivo">("presuntivo");
  const [guardarEnCatalogo, setGuardarEnCatalogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busqueda = useEspera();
  const alta = useEspera();
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  function escribir(texto: string) {
    setQ(texto);
    setError(null);
    if (temporizador.current) clearTimeout(temporizador.current);
    if (texto.trim().length < 2) {
      setResultados([]);
      return;
    }
    temporizador.current = setTimeout(async () => {
      const r = await busqueda.ejecutar(async () => ({ error: null as string | null, lista: await buscarDiagnosticos(texto, especie) }));
      if (!r.error) setResultados(r.lista ?? []);
    }, 300);
  }

  const yaEsta = (nombre: string, t: string) => valor.some((d) => d.nombre.toLowerCase() === nombre.toLowerCase() && d.tipo === t);

  function agregar(d: Diagnostico) {
    if (yaEsta(d.nombre, d.tipo)) return;
    onCambio([...valor, d]);
    setQ("");
    setResultados([]);
  }

  async function agregarLibre() {
    const nombre = q.trim();
    if (nombre.length < 3) return;
    if (guardarEnCatalogo) {
      const r = await alta.ejecutar(() => agregarDiagnosticoNegocio(nombre, "Otros", especie));
      if (r.error) {
        setError(r.error);
        return;
      }
      agregar({ ref_id: r.id ?? null, origen: "negocio", nombre, tipo, nota: "" });
      return;
    }
    agregar({ ref_id: null, origen: "libre", nombre, tipo, nota: "" });
  }

  return (
    <div className="flex flex-col gap-3">
      {valor.length === 0 ? (
        <p className="text-sm text-n-600">Sin diagnósticos todavía.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {valor.map((d, i) => (
            <li key={`${d.nombre}-${i}`} className="flex flex-wrap items-center gap-2 rounded-md border border-n-200 bg-white px-3 py-2">
              <span className="font-semibold text-n-900">{d.nombre}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.tipo === "definitivo" ? "bg-menta-suave text-menta-oscuro" : "bg-ambar-suave text-ambar-oscuro"}`}>{d.tipo === "definitivo" ? "Definitivo" : "Presuntivo"}</span>
              {d.origen === "libre" && <span className="text-xs text-n-500">texto libre</span>}
              <input
                aria-label={`Nota de ${d.nombre}`}
                className="min-w-40 flex-1 rounded border border-borde px-2 py-1 text-sm"
                placeholder="Nota (opcional)"
                value={d.nota}
                onChange={(e) => onCambio(valor.map((x, j) => (j === i ? { ...x, nota: e.target.value } : x)))}
              />
              <button
                type="button"
                className="text-sm font-semibold text-morado hover:underline"
                onClick={() => onCambio(valor.map((x, j) => (j === i ? { ...x, tipo: x.tipo === "definitivo" ? "presuntivo" : "definitivo" } : x)))}
              >
                Pasar a {d.tipo === "definitivo" ? "presuntivo" : "definitivo"}
              </button>
              <button type="button" className="text-sm font-semibold text-coral-oscuro hover:underline" onClick={() => onCambio(valor.filter((_, j) => j !== i))}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="Buscar diagnóstico" name="buscar_dx" value={q} onChange={(e) => escribir(e.target.value)} placeholder="otitis, tos de perrera, FLUTD…" autoComplete="off" ayuda="Busca por nombre o por cómo se le conoce." />
        <Select label="Agregar como" name="tipo_dx" value={tipo} onChange={(e) => setTipo(e.target.value as "presuntivo" | "definitivo")}>
          <option value="presuntivo">Presuntivo</option>
          <option value="definitivo">Definitivo</option>
        </Select>
      </div>
      {busqueda.cargando && <p className="text-sm text-n-500">Buscando…</p>}
      {resultados.length > 0 && (
        <ul className="divide-y divide-n-200 overflow-hidden rounded-md border border-n-200 bg-white">
          {resultados.map((r) => (
            <li key={`${r.origen}-${r.id}`}>
              <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-n-50" onClick={() => agregar({ ref_id: r.id, origen: r.origen, nombre: r.nombre, tipo, nota: "" })}>
                <span className="font-semibold text-n-900">{r.nombre}</span>
                <span className="text-xs text-n-500">{r.categoria}{r.origen === "negocio" ? " · de tu negocio" : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 3 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-n-300 p-3 text-sm">
          <span className="text-n-700">¿No está? Escríbelo tal cual:</span>
          <label className="flex items-center gap-2 text-n-700">
            <input type="checkbox" checked={guardarEnCatalogo} onChange={(e) => setGuardarEnCatalogo(e.target.checked)} className="h-4 w-4" />
            Guardarlo en el catálogo de mi negocio
          </label>
          <Button type="button" variante="secundario" cargando={alta.cargando} onClick={agregarLibre}>
            Agregar «{q.trim()}»
          </Button>
        </div>
      )}
      {error && <p className="text-sm font-semibold text-coral-oscuro">{error}</p>}
    </div>
  );
}

/** QA S19: la confirmación dice todo lo que se pierde, también las vacunas y desparasitaciones que nacieron en el borrador. */
function textoDescarte(seAnulan: string[]): string {
  const cita = "La cita vuelve a la agenda como estaba, sin consulta.";
  if (seAnulan.length === 0) return `¿Descartar este borrador? Se pierde lo que escribiste. ${cita}`;
  const lista = seAnulan.length === 1 ? seAnulan[0] : `${seAnulan.slice(0, -1).join(", ")} y ${seAnulan[seAnulan.length - 1]}`;
  return `¿Descartar este borrador? Se pierde lo que escribiste y se anula ${lista}. ${cita}`;
}
