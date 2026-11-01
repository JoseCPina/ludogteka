"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useEspera } from "@/hooks/use-espera";
import { esperarConTope } from "@/lib/ui/espera";
import { guardarAtencion, guardarEdicion, leerParaEditar, pedirCuenta, verReclamo } from "./acciones";
import type { AplicacionVet, DatosAtencion, Giro, ReclamoQR } from "@/lib/app/atenciones";

// El formulario de 20 segundos de la veterinaria, estética u hotel (docs/app-duenos/FASE-2.md). El nombre y el WhatsApp
// del negocio se recuerdan en ESTE teléfono (para el siguiente paciente); el token para corregir un registro también
// vive solo aquí, por eso solo se corrige desde el teléfono que lo hizo y dentro de las primeras 24 horas.

const LLAVE_NEGOCIO = "pd-qr-negocio";
const LLAVE_EDICIONES = "pd-qr-ediciones";
type Edicion = { id: string; token: string; hasta: string; mascota: string; resumen: string };

const leerLocal = <T,>(llave: string, porOmision: T): T => {
  try {
    const v = localStorage.getItem(llave);
    return v ? (JSON.parse(v) as T) : porOmision;
  } catch {
    return porOmision;
  }
};
const sinSuscripcion = () => () => {};
const leerCrudo = (llave: string) => () => {
  try {
    return window.localStorage.getItem(llave);
  } catch {
    return null;
  }
};
const guardarLocal = (llave: string, valor: unknown) => {
  try {
    localStorage.setItem(llave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: se sigue sin recordar */
  }
};

const sumarDias = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const sumarMeses = (fecha: string, meses: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
};

const VACUNAS: Record<string, string[]> = {
  perro: ["Antirrábica", "Múltiple (séxtuple)", "Bordetella"],
  gato: ["Antirrábica", "Triple felina", "Leucemia felina"],
  otro: ["Antirrábica"],
};

function Firma({ onCambio, reinicio }: { onCambio: (dataUrl: string | null) => void; reinicio: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const trazos = useRef(0);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#2b2a33";
    trazos.current = 0;
    onCambio(null);
  }, [reinicio, onCambio]);
  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  return (
    <canvas
      ref={ref}
      width={600}
      height={200}
      data-firma
      aria-label="Firma con el dedo"
      style={{ width: "100%", height: "auto", aspectRatio: "3 / 1", background: "#fff", borderRadius: "1.1rem", boxShadow: "var(--apd-filo)", touchAction: "none", display: "block" }}
      onPointerDown={(e) => {
        dibujando.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        const ctx = ref.current!.getContext("2d")!;
        const p = punto(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      }}
      onPointerMove={(e) => {
        if (!dibujando.current) return;
        const ctx = ref.current!.getContext("2d")!;
        const p = punto(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        trazos.current += 1;
      }}
      onPointerUp={() => {
        dibujando.current = false;
        if (trazos.current > 3) onCambio(ref.current!.toDataURL("image/png"));
      }}
    />
  );
}

export function RegistrarAtencion({ token, escaneoId, mascota, hoy, reglas }: { token: string; escaneoId: string | null; mascota: { nombre: string; especie: string }; hoy: string; reglas: { horasEdicion: number; ofertaA: number; porMascotaAlDia: number } }) {
  // Lo que este teléfono recuerda (localStorage): el negocio y los registros que todavía puede corregir.
  const negocioGuardado = useSyncExternalStore(sinSuscripcion, leerCrudo(LLAVE_NEGOCIO), () => null);
  const edicionesGuardadas = useSyncExternalStore(sinSuscripcion, leerCrudo(LLAVE_EDICIONES), () => null);
  const recordado = useMemo(() => {
    try {
      return negocioGuardado ? (JSON.parse(negocioGuardado) as { nombre?: string; whatsapp?: string; giro?: Giro | null }) : {};
    } catch {
      return {};
    }
  }, [negocioGuardado]);
  const [giroElegido, setGiro] = useState<Giro | null>(null);
  const giro = giroElegido ?? recordado.giro ?? null;
  const [aplicaciones, setAplicaciones] = useState<AplicacionVet[]>([]);
  const [servicio, setServicio] = useState("");
  const [proximaCita, setProximaCita] = useState("");
  const [entrada, setEntrada] = useState(hoy);
  const [salida, setSalida] = useState(hoy);
  const [fecha, setFecha] = useState(hoy);
  const [peso, setPeso] = useState("");
  const [nota, setNota] = useState("");
  const [negocioEditado, setNegocio] = useState<{ nombre: string; whatsapp: string } | null>(null);
  const negocio = negocioEditado ?? { nombre: recordado.nombre ?? "", whatsapp: recordado.whatsapp ?? "" };
  const [firma, setFirma] = useState<string | null>(null);
  const [reinicioFirma, setReinicioFirma] = useState(0);
  const [ubicacion, setUbicacion] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ id: string; total: number; ofrecer: boolean; prospectoId: string; editado?: boolean } | null>(null);
  const [editando, setEditando] = useState<Edicion | null>(null);
  const [, setVersionEdiciones] = useState(0);
  const pendientes = useMemo(() => {
    try {
      const lista = edicionesGuardadas ? (JSON.parse(edicionesGuardadas) as Edicion[]) : [];
      // Solo de esta mascota; las de más de 24 h las rechaza el servidor y se limpian al guardar la siguiente.
      return lista.filter((e) => e.mascota === token);
    } catch {
      return [];
    }
  }, [edicionesGuardadas, token]);
  const [reclamo, setReclamo] = useState<ReclamoQR | null>(null);
  const envio = useEspera();
  const carga = useEspera();
  const cuenta = useEspera();
  const cambioFirma = useCallback((d: string | null) => setFirma(d), []);

  // Mientras espera el código del reclamo: pregunta cada 3 s si ya llegó.
  useEffect(() => {
    if (!reclamo || reclamo.estado !== "pendiente" || !hecho) return;
    const t = setInterval(async () => {
      const { r } = await esperarConTope(async () => ({ error: null, r: await verReclamo(hecho.prospectoId, reclamo.id) }), 8000);
      if (r && r.estado !== "pendiente") setReclamo(r);
    }, 3000);
    return () => clearInterval(t);
  }, [reclamo, hecho]);

  function datos(): DatosAtencion | null {
    if (giro === "veterinaria") return { giro, aplicaciones: aplicaciones.filter((a) => a.nombre.trim()) };
    if (giro === "estetica") return { giro, servicio, proxima_cita: proximaCita || null };
    if (giro === "hotel") return { giro, entrada, salida };
    return null;
  }

  async function enviar() {
    setError(null);
    const d = datos();
    if (!d) return setError("Escoge si eres veterinaria, estética u hotel.");
    if (!firma && !editando) return setError("Falta la firma: fírmalo con el dedo en el recuadro.");
    const pesoKg = peso ? Number(peso.replace(",", ".")) : null;
    const campos = { datos: d, fecha, pesoKg, nota: nota || null, negocioNombre: negocio.nombre, negocioWhatsapp: negocio.whatsapp, firma, lat: ubicacion?.lat ?? null, lng: ubicacion?.lng ?? null };
    guardarLocal(LLAVE_NEGOCIO, { nombre: negocio.nombre, whatsapp: negocio.whatsapp, giro });
    if (editando) {
      const r = await envio.ejecutar(() => guardarEdicion(editando.id, editando.token, campos));
      if (r.error) return setError(r.error);
      setHecho({ id: editando.id, total: 0, ofrecer: false, prospectoId: "", editado: true });
      setEditando(null);
      return;
    }
    const r = await envio.ejecutar(() => guardarAtencion(token, escaneoId, campos));
    if (r.error || !r.atencionId) return setError(r.error ?? "No pudimos guardar el registro. Intenta de nuevo.");
    const nueva: Edicion = { id: r.atencionId, token: r.tokenEdicion!, hasta: r.editableHasta!, mascota: token, resumen: `${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}` };
    const lista = [...leerLocal<Edicion[]>(LLAVE_EDICIONES, []).filter((e) => new Date(e.hasta).getTime() > Date.now()), nueva].slice(-50);
    guardarLocal(LLAVE_EDICIONES, lista);
    setVersionEdiciones((v) => v + 1);
    setHecho({ id: r.atencionId, total: r.total ?? 1, ofrecer: Boolean(r.ofrecerCuenta), prospectoId: r.prospectoId ?? "" });
  }

  async function abrirEdicion(e: Edicion) {
    setError(null);
    const r = await carga.ejecutar(() => leerParaEditar(e.id, e.token));
    if (r.error || !r.atencion) return setError(r.error ?? "No pudimos abrir ese registro.");
    const a = r.atencion;
    setGiro(a.giro);
    setFecha(a.fecha);
    setPeso(a.pesoKg != null ? String(a.pesoKg) : "");
    setNota(a.nota ?? "");
    setNegocio({ nombre: a.negocioNombre, whatsapp: a.negocioWhatsapp });
    if (a.giro === "veterinaria") setAplicaciones(((a.datos.aplicaciones as AplicacionVet[]) ?? []).map((x) => ({ ...x })));
    if (a.giro === "estetica") {
      setServicio(String(a.datos.servicio ?? ""));
      setProximaCita(String(a.datos.proxima_cita ?? ""));
    }
    if (a.giro === "hotel") {
      setEntrada(String(a.datos.entrada));
      setSalida(String(a.datos.salida));
    }
    setReinicioFirma((x) => x + 1);
    setEditando(e);
    setHecho(null);
  }

  async function quieroCuenta() {
    if (!hecho) return;
    const r = await cuenta.ejecutar(() => pedirCuenta(hecho.prospectoId, negocio.whatsapp));
    if (r.error || !r.reclamo) return setError(r.error ?? "No pudimos generar tu código.");
    setReclamo(r.reclamo);
  }

  function otro() {
    setHecho(null);
    setAplicaciones([]);
    setServicio("");
    setProximaCita("");
    setPeso("");
    setNota("");
    setFecha(hoy);
    setReinicioFirma((x) => x + 1);
    setReclamo(null);
  }

  if (hecho) {
    return (
      <div className="apd-lista" data-atencion-guardada={hecho.id}>
        <div className="apd-aviso apd-aviso-ok" role="status" style={{ fontWeight: 700 }}>
          {hecho.editado ? `Listo: corregimos el registro de ${mascota.nombre} y su cartilla.` : `Listo: quedó en la cartilla de ${mascota.nombre} y a su familia le llegó el aviso.`}
        </div>
        <p className="apd-nota">Puedes corregirlo desde este teléfono durante {reglas.horasEdicion} horas.</p>
        {hecho.ofrecer && !reclamo && (
          <div className="apd-tarjeta" data-oferta-cuenta style={{ background: "var(--apd-menta-suave)", boxShadow: "none" }}>
            <p style={{ fontWeight: 800 }}>Ya registraste {hecho.total} pacientes aquí; abre tu cuenta gratis y quédate con su expediente</p>
            <p className="apd-nota" style={{ marginTop: "0.35rem", color: "var(--apd-tinta-2)" }}>Entras a la prueba de PeluDesk con estos pacientes y lo que les registraste. Te pedimos un código por WhatsApp para comprobar que el número es de tu negocio.</p>
            <button type="button" className="apd-boton" style={{ marginTop: "0.9rem" }} aria-busy={cuenta.cargando || undefined} disabled={cuenta.cargando} onClick={quieroCuenta} data-pedir-cuenta>
              Abrir mi cuenta gratis
            </button>
          </div>
        )}
        {reclamo && (
          <div className="apd-tarjeta" data-reclamo={reclamo.estado}>
            {reclamo.estado === "pendiente" ? (
              <>
                <p style={{ fontWeight: 800 }}>Manda este código por WhatsApp desde el número de tu negocio</p>
                <p className="apd-codigo" style={{ marginTop: "0.5rem" }} data-codigo-reclamo>{reclamo.codigo}</p>
                <p className="apd-nota">Mándalo tal cual: «RECLAMO {reclamo.codigo}». En cuanto llegue, aquí mismo se abre tu cuenta.</p>
                {reclamo.waUrl && <a href={reclamo.waUrl} target="_blank" rel="noopener noreferrer" className="apd-boton" style={{ marginTop: "0.9rem" }}>Mandarlo por WhatsApp</a>}
              </>
            ) : reclamo.estado === "verificado" && reclamo.registroUrl ? (
              <>
                <p style={{ fontWeight: 800 }}>Listo, comprobamos que el número es tuyo</p>
                <a href={reclamo.registroUrl} className="apd-boton" style={{ marginTop: "0.9rem" }} data-abrir-registro>Abrir mi cuenta</a>
              </>
            ) : (
              <p className="apd-nota">{reclamo.estado === "registrado" ? "Tu negocio ya tiene su cuenta en PeluDesk." : "El código venció. Pide otro."}</p>
            )}
          </div>
        )}
        {error && <div className="apd-aviso apd-aviso-error" role="alert">{error}</div>}
        <button type="button" className="apd-boton-sec" onClick={otro} data-registrar-otro>Registrar otra cosa de {mascota.nombre}</button>
      </div>
    );
  }

  const vacunas = VACUNAS[mascota.especie] ?? VACUNAS.otro;
  return (
    <form
      className="apd-lista"
      data-formulario-atencion
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      {pendientes.length > 0 && !editando && (
        <div className="apd-tarjeta" style={{ padding: "0.8rem 1rem" }}>
          <p className="apd-nota">Desde este teléfono registraste {pendientes.length === 1 ? "algo" : `${pendientes.length} cosas`} de {mascota.nombre} hoy.</p>
          <div className="apd-fila" style={{ flexWrap: "wrap", marginTop: "0.5rem" }}>
            {pendientes.map((p) => (
              <button key={p.id} type="button" className="apd-boton-sec" aria-busy={carga.cargando || undefined} disabled={carga.cargando} onClick={() => abrirEdicion(p)} data-editar-atencion={p.id}>
                Corregir el de las {p.resumen}
              </button>
            ))}
          </div>
        </div>
      )}
      {editando && <div className="apd-aviso apd-aviso-ambar" role="status" data-editando>Estás corrigiendo el registro de las {editando.resumen}.</div>}

      <div>
        <span className="apd-etiqueta">¿Qué eres?</span>
        <div className="apd-tabs" role="group" aria-label="Tipo de negocio">
          {([["veterinaria", "Veterinaria"], ["estetica", "Estética"], ["hotel", "Hotel"]] as const).map(([v, t]) => (
            <button key={v} type="button" className="apd-tab" aria-pressed={giro === v} disabled={Boolean(editando)} onClick={() => setGiro(v)} data-giro={v}>{t}</button>
          ))}
        </div>
      </div>

      {giro === "veterinaria" && (
        <div className="apd-lista">
          <div className="apd-fila" style={{ flexWrap: "wrap" }}>
            {vacunas.map((v) => (
              <button key={v} type="button" className="apd-chip" onClick={() => setAplicaciones((x) => [...x, { tipo: "vacuna", nombre: v, lote: "", proxima_dosis: sumarMeses(fecha, 12) }])} data-agregar-vacuna={v}>+ {v}</button>
            ))}
            <button type="button" className="apd-chip" onClick={() => setAplicaciones((x) => [...x, { tipo: "desparasitacion", nombre: "Desparasitación", subtipo: "interna", lote: "", proxima_dosis: sumarMeses(fecha, 3) }])} data-agregar-desparasitacion>+ Desparasitación</button>
          </div>
          {aplicaciones.map((a, i) => (
            <div key={i} className="apd-tarjeta" style={{ padding: "0.9rem" }} data-aplicacion={i}>
              <div className="apd-fila" style={{ justifyContent: "space-between" }}>
                <span className="apd-ceja">{a.tipo === "vacuna" ? "Vacuna" : "Desparasitación"}</span>
                <button type="button" className="apd-enlace" onClick={() => setAplicaciones((x) => x.filter((_, j) => j !== i))}>Quitar</button>
              </div>
              <label className="apd-etiqueta" style={{ marginTop: "0.6rem" }}>Producto
                <input className="apd-campo" value={a.nombre} maxLength={80} onChange={(e) => setAplicaciones((x) => x.map((y, j) => (j === i ? { ...y, nombre: e.target.value } : y)))} name={`producto-${i}`} />
              </label>
              <label className="apd-etiqueta">Lote (si lo tienes)
                <input className="apd-campo" value={a.lote ?? ""} maxLength={40} onChange={(e) => setAplicaciones((x) => x.map((y, j) => (j === i ? { ...y, lote: e.target.value } : y)))} name={`lote-${i}`} />
              </label>
              <label className="apd-etiqueta">Próxima dosis
                <input type="date" className="apd-campo" value={a.proxima_dosis ?? ""} min={sumarDias(fecha, 1)} onChange={(e) => setAplicaciones((x) => x.map((y, j) => (j === i ? { ...y, proxima_dosis: e.target.value || null } : y)))} name={`proxima-${i}`} />
              </label>
            </div>
          ))}
          <label className="apd-etiqueta">Peso en kilos (si lo pesaste)
            <input className="apd-campo" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="8.4" name="peso" />
          </label>
        </div>
      )}

      {giro === "estetica" && (
        <div className="apd-lista">
          <label className="apd-etiqueta">¿Qué le hiciste?
            <input className="apd-campo" value={servicio} maxLength={80} onChange={(e) => setServicio(e.target.value)} placeholder="Baño y corte" name="servicio" />
          </label>
          <div>
            <span className="apd-etiqueta">Próxima cita sugerida</span>
            <div className="apd-fila" style={{ flexWrap: "wrap" }}>
              {([["En 2 semanas", 14], ["En 1 mes", 30], ["En 2 meses", 60]] as const).map(([t, d]) => (
                <button key={t} type="button" className="apd-chip" aria-pressed={proximaCita === sumarDias(fecha, d)} onClick={() => setProximaCita(sumarDias(fecha, d))} data-proxima-cita={d}>{t}</button>
              ))}
            </div>
            <input type="date" className="apd-campo" style={{ marginTop: "0.5rem" }} value={proximaCita} min={sumarDias(fecha, 1)} onChange={(e) => setProximaCita(e.target.value)} aria-label="Fecha de la próxima cita" name="proxima_cita" />
          </div>
        </div>
      )}

      {giro === "hotel" && (
        <div className="apd-fila" style={{ gap: "0.75rem" }}>
          <label className="apd-etiqueta" style={{ flex: 1 }}>Entró
            <input type="date" className="apd-campo" value={entrada} max={hoy} onChange={(e) => setEntrada(e.target.value)} name="entrada" />
          </label>
          <label className="apd-etiqueta" style={{ flex: 1 }}>Salió
            <input type="date" className="apd-campo" value={salida} min={entrada} onChange={(e) => setSalida(e.target.value)} name="salida" />
          </label>
        </div>
      )}

      {giro && (
        <>
          <label className="apd-etiqueta">Fecha de la atención
            <input type="date" className="apd-campo" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} name="fecha" />
          </label>
          <label className="apd-etiqueta">Nota breve (si quieres)
            <input className="apd-campo" value={nota} maxLength={280} onChange={(e) => setNota(e.target.value)} placeholder="Todo bien, se portó tranquilo" name="nota" />
          </label>
          <div className="apd-tarjeta" style={{ padding: "0.9rem" }}>
            <span className="apd-ceja">Tu negocio</span>
            <label className="apd-etiqueta" style={{ marginTop: "0.6rem" }}>Nombre
              <input className="apd-campo" value={negocio.nombre} maxLength={80} autoComplete="organization" onChange={(e) => setNegocio({ ...negocio, nombre: e.target.value })} name="negocio_nombre" />
            </label>
            <label className="apd-etiqueta">WhatsApp del negocio
              <input className="apd-campo" inputMode="tel" value={negocio.whatsapp} maxLength={14} autoComplete="tel" onChange={(e) => setNegocio({ ...negocio, whatsapp: e.target.value })} placeholder="10 dígitos" name="negocio_whatsapp" />
            </label>
            <p className="apd-nota">Con este número le llega a su familia el recordatorio para agendar contigo. Lo recordamos en este teléfono para el siguiente paciente.</p>
            {!ubicacion && (
              <button type="button" className="apd-enlace" style={{ marginTop: "0.4rem" }} onClick={() => navigator.geolocation?.getCurrentPosition((p) => setUbicacion({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { timeout: 8000, maximumAge: 600_000 })}>
                Usar la ubicación del negocio (opcional)
              </button>
            )}
          </div>
          <div>
            <div className="apd-fila" style={{ justifyContent: "space-between" }}>
              <span className="apd-etiqueta">Firma con el dedo</span>
              <button type="button" className="apd-enlace" onClick={() => setReinicioFirma((x) => x + 1)}>Borrar firma</button>
            </div>
            <Firma onCambio={cambioFirma} reinicio={reinicioFirma} />
          </div>
          {error && <div className="apd-aviso apd-aviso-error" role="alert" data-error-atencion>{error}</div>}
          <button type="submit" className="apd-boton apd-boton-ancho" aria-busy={envio.cargando || undefined} disabled={envio.cargando} data-guardar-atencion>
            {envio.cargando ? "Guardando…" : editando ? "Guardar la corrección" : `Guardar en la cartilla de ${mascota.nombre}`}
          </button>
          {editando && <button type="button" className="apd-boton-sec" onClick={() => { setEditando(null); otro(); }}>Dejarlo como estaba</button>}
          <p className="apd-nota">Hasta {reglas.porMascotaAlDia} registros de {mascota.nombre} al día. Tu registro no se borra: su familia lo puede ocultar, y tú lo corriges desde este teléfono las primeras {reglas.horasEdicion} horas.</p>
        </>
      )}
    </form>
  );
}
