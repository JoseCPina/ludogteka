"use client";

import { useEffect, useRef, useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { subirConProgreso } from "@/lib/media/subir";
import { MAX_SEGUNDOS_DICTADO, mimeBase, type BorradorSoap, type EstadoDictado } from "@/lib/dictado/tipos";
import { SECCIONES_CONSULTA, type Diagnostico } from "@/lib/veterinaria/expediente";
import { estadoDictado, prepararDictado, transcribirDictado } from "./dictado-actions";

type Fase = "cerrado" | "preparado" | "grabando" | "subiendo" | "transcribiendo" | "resultado";

const SIGNOS: { clave: keyof BorradorSoap; etiqueta: string }[] = [
  { clave: "peso_kg", etiqueta: "Peso (kg)" },
  { clave: "temperatura_c", etiqueta: "Temperatura (°C)" },
  { clave: "frecuencia_cardiaca", etiqueta: "Frec. cardiaca" },
  { clave: "frecuencia_respiratoria", etiqueta: "Frec. respiratoria" },
  { clave: "condicion_corporal", etiqueta: "Condición corporal" },
  { clave: "tllc_seg", etiqueta: "TLLC (s)" },
  { clave: "mucosas", etiqueta: "Mucosas" },
  { clave: "hidratacion", etiqueta: "Hidratación" },
];

const reloj = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function mimeDeGrabacion(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

/**
 * «Dictar»: el médico graba su dictado, el servidor lo transcribe y propone un BORRADOR del SOAP.
 * Nada se firma ni se guarda solo: lo propuesto se pasa al expediente (que se autoguarda como
 * borrador) y el médico lo revisa, corrige y firma.
 */
export function DictadoPanel({
  consultaId,
  valores,
  diagnosticos,
  onAplicar,
}: {
  consultaId: string;
  valores: Record<string, string>;
  diagnosticos: Diagnostico[];
  onAplicar: (campos: Record<string, string>, nuevos: Diagnostico[]) => void;
}) {
  const [estado, setEstado] = useState<(EstadoDictado & { configurado: boolean }) | null>(null);
  const [fase, setFase] = useState<Fase>("cerrado");
  const [aviso, setAviso] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [progreso, setProgreso] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcripcion, setTranscripcion] = useState("");
  const [borrador, setBorrador] = useState<BorradorSoap | null>(null);
  const [elegidos, setElegidos] = useState<Record<string, boolean>>({});
  const [aplicado, setAplicado] = useState(false);
  const grabadora = useRef<MediaRecorder | null>(null);
  const flujo = useRef<MediaStream | null>(null);
  const trozos = useRef<Blob[]>([]);
  const inicio = useRef(0);
  const reloj$ = useRef<ReturnType<typeof setInterval> | null>(null);
  const descartar = useRef(false);
  const preparar = useEspera();
  const transcribir = useEspera({ tope: 150_000 });

  useEffect(() => {
    let vivo = true;
    void estadoDictado().then((e) => vivo && setEstado(e));
    return () => {
      vivo = false;
      if (reloj$.current) clearInterval(reloj$.current);
      flujo.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (!estado?.permitido) return null;

  const agotado = Boolean(estado.agotado);

  function liberarMicrofono() {
    if (reloj$.current) clearInterval(reloj$.current);
    reloj$.current = null;
    flujo.current?.getTracks().forEach((t) => t.stop());
    flujo.current = null;
  }

  async function empezar() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Este navegador no puede grabar audio. Usa Chrome, Edge o Safari actualizados, en una conexión segura (https).");
      return;
    }
    let micro: MediaStream;
    try {
      micro = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError("No pudimos usar el micrófono. Permite el acceso al micrófono en el navegador y vuelve a intentar.");
      return;
    }
    flujo.current = micro;
    trozos.current = [];
    descartar.current = false;
    const mime = mimeDeGrabacion();
    const g = new MediaRecorder(micro, mime ? { mimeType: mime, audioBitsPerSecond: 48_000 } : { audioBitsPerSecond: 48_000 });
    g.ondataavailable = (e) => e.data.size > 0 && trozos.current.push(e.data);
    g.onstop = () => void terminarGrabacion(g.mimeType || mime || "audio/webm");
    grabadora.current = g;
    g.start(1000);
    inicio.current = Date.now();
    setSegundos(0);
    setFase("grabando");
    reloj$.current = setInterval(() => {
      const s = Math.floor((Date.now() - inicio.current) / 1000);
      setSegundos(s);
      if (s >= MAX_SEGUNDOS_DICTADO) detener();
    }, 500);
  }

  function detener() {
    if (grabadora.current && grabadora.current.state !== "inactive") grabadora.current.stop();
    liberarMicrofono();
  }

  function cancelar() {
    descartar.current = true;
    detener();
    setFase("preparado");
    setSegundos(0);
  }

  async function terminarGrabacion(mimeGrabado: string) {
    if (descartar.current) return;
    const duracion = Math.max(1, Math.round((Date.now() - inicio.current) / 1000));
    const tipo = mimeBase(mimeGrabado);
    const blob = new Blob(trozos.current, { type: tipo });
    if (blob.size < 500) {
      setError("No se grabó nada. Revisa el micrófono y vuelve a intentar.");
      setFase("preparado");
      return;
    }
    setFase("subiendo");
    setProgreso(0);
    const prep = await preparar.ejecutar(() => prepararDictado(consultaId, duracion, tipo, aviso));
    if (prep.error || !prep.dictadoId || !prep.urlFirmada || !prep.ruta) {
      setError(prep.error ?? "No pudimos preparar el dictado.");
      setFase("preparado");
      void estadoDictado().then(setEstado);
      return;
    }
    try {
      await subirConProgreso({ url: prep.urlFirmada, blob, onProgreso: setProgreso });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos subir el audio.");
      setFase("preparado");
      return;
    }
    setFase("transcribiendo");
    const r = await transcribir.ejecutar(() => transcribirDictado(prep.dictadoId!, consultaId, prep.ruta!));
    void estadoDictado().then(setEstado);
    setTranscripcion(r.transcripcion ?? "");
    setBorrador(r.borrador ?? null);
    setError(r.error);
    setAplicado(false);
    if (r.borrador) {
      const marcas: Record<string, boolean> = {};
      for (const s of SECCIONES_CONSULTA) marcas[s.clave] = Boolean(r.borrador[s.clave as keyof BorradorSoap]);
      for (const s of SIGNOS) marcas[s.clave] = r.borrador[s.clave] != null && !valores[s.clave];
      r.borrador.diagnosticos.forEach((d) => (marcas[`dx:${d.ref_id}`] = !diagnosticos.some((x) => x.ref_id === d.ref_id)));
      setElegidos(marcas);
      setFase("resultado");
    } else {
      setFase(r.transcripcion ? "resultado" : "preparado");
    }
  }

  function pasarAlExpediente() {
    if (!borrador) return;
    const campos: Record<string, string> = {};
    for (const s of SECCIONES_CONSULTA) {
      const nuevo = borrador[s.clave as keyof BorradorSoap] as string | null;
      if (!nuevo || !elegidos[s.clave]) continue;
      const actual = (valores[s.clave] ?? "").trim();
      campos[s.clave] = actual ? `${actual}\n\n${nuevo}` : nuevo;
    }
    for (const s of SIGNOS) {
      const nuevo = borrador[s.clave];
      if (nuevo == null || !elegidos[s.clave]) continue;
      campos[s.clave] = String(nuevo);
    }
    const nuevosDx: Diagnostico[] = borrador.diagnosticos
      .filter((d) => elegidos[`dx:${d.ref_id}`])
      .map((d) => ({ ref_id: d.ref_id, origen: d.origen, nombre: d.nombre, tipo: d.tipo, nota: d.nota }));
    onAplicar(campos, nuevosDx);
    setAplicado(true);
  }

  const ocupado = fase === "subiendo" || fase === "transcribiendo";

  return (
    <section aria-label="Dictado por voz" className="flex flex-col gap-3 rounded-lg border border-morado bg-morado-suave/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-n-900">Dictado por voz</h2>
        <span className={`text-sm font-semibold ${estado.agotado ? "text-coral-oscuro" : estado.cerca ? "text-ambar-oscuro" : "text-n-600"}`}>
          Este mes: {estado.usados ?? 0} de {estado.tope ?? 0} min
        </span>
      </div>

      {estado.cerca && !agotado && (
        <Alert variante="info" titulo="Se acercan los minutos del mes">
          Llevas {estado.usados} de {estado.tope} minutos de dictado. Cuando se acaben, el expediente se sigue escribiendo a mano.
        </Alert>
      )}
      {agotado && (
        <Alert variante="error" titulo="Ya no hay minutos de dictado este mes">
          Escribe a mano esta consulta o pídele a PeluDesk más minutos. Vuelven a empezar el primer día del mes.
        </Alert>
      )}
      {!estado.configurado && (
        <Alert variante="info" titulo="El dictado aún no está listo">
          Falta activar el servicio de voz en PeluDesk. Avísanos y lo dejamos funcionando.
        </Alert>
      )}
      {error && (
        <Alert variante="error" titulo="El dictado no terminó bien">
          {error}
        </Alert>
      )}

      {fase === "cerrado" && (
        <div>
          <Button type="button" variante="secundario" onClick={() => setFase("preparado")} disabled={agotado || !estado.configurado}>
            Dictar
          </Button>
        </div>
      )}

      {(fase === "preparado" || fase === "grabando") && (
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-n-200 bg-white p-3 text-sm text-n-800">
            <p className="font-semibold">Antes de grabar</p>
            <ul className="mt-1 list-disc pl-5">
              <li>Se graba <strong>tu voz</strong> con el micrófono de este equipo y se manda a servicios de terceros: ElevenLabs la convierte en texto y Anthropic (Claude) ordena el texto en un borrador.</li>
              <li>
                {estado.conservar_audio
                  ? "La clínica tiene activado conservar el audio: queda ligado a esta consulta 30 días y luego se borra solo."
                  : "El audio se borra en cuanto termina la transcripción. No se guarda ni el audio ni el borrador del dictado."}
              </li>
              <li>Es un borrador: revísalo y corrígelo antes de firmar. Nada se firma solo.</li>
            </ul>
            <label className="mt-2 flex items-start gap-2">
              <input type="checkbox" checked={aviso} onChange={(e) => setAviso(e.target.checked)} disabled={fase === "grabando"} className="mt-1 h-4 w-4" />
              <span>Ya le avisé al dueño que voy a grabar mi dictado de esta consulta.</span>
            </label>
          </div>
          {fase === "preparado" ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void empezar()} disabled={!aviso || agotado}>
                Empezar a grabar
              </Button>
              <Button type="button" variante="secundario" onClick={() => setFase("cerrado")}>
                Cerrar
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span role="timer" aria-live="off" className="font-mono text-lg font-bold text-coral-oscuro">
                ● {reloj(segundos)}
              </span>
              <Button type="button" variante="peligro" onClick={detener}>
                Detener y transcribir
              </Button>
              <Button type="button" variante="secundario" onClick={cancelar}>
                Descartar
              </Button>
              <span className="text-sm text-n-600">Máximo {MAX_SEGUNDOS_DICTADO / 60} minutos por dictado.</span>
            </div>
          )}
        </div>
      )}

      {ocupado && (
        <p role="status" className="flex items-center gap-2 text-n-800">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-morado border-t-transparent" aria-hidden />
          {fase === "subiendo" ? `Subiendo el audio… ${Math.round(progreso * 100)} %` : "Transcribiendo y armando el borrador… puede tardar un minuto."}
        </p>
      )}

      {fase === "resultado" && (
        <div className="flex flex-col gap-3">
          {borrador ? (
            <>
              <Alert variante="info" titulo="Borrador hecho con IA">
                Revisa cada parte: marca lo que quieres pasar al expediente. Lo que ya tiene texto se agrega al final. Después lo corriges y firmas tú.
              </Alert>
              <ul className="flex flex-col gap-2">
                {SECCIONES_CONSULTA.map((s) => {
                  const texto = borrador[s.clave as keyof BorradorSoap] as string | null;
                  if (!texto) return null;
                  return (
                    <li key={s.clave} className="rounded-md border border-n-200 bg-white p-3">
                      <label className="flex items-start gap-2">
                        <input type="checkbox" className="mt-1 h-4 w-4" checked={Boolean(elegidos[s.clave])} onChange={(e) => setElegidos((m) => ({ ...m, [s.clave]: e.target.checked }))} />
                        <span>
                          <span className="block text-sm font-bold text-n-900">
                            {s.etiqueta}
                            {valores[s.clave]?.trim() ? <span className="ml-2 font-normal text-n-600">(ya tiene texto: se agrega al final)</span> : null}
                          </span>
                          <span className="whitespace-pre-wrap text-n-800">{texto}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
                {SIGNOS.some((s) => borrador[s.clave] != null) && (
                  <li className="rounded-md border border-n-200 bg-white p-3">
                    <p className="text-sm font-bold text-n-900">Signos vitales dictados</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      {SIGNOS.filter((s) => borrador[s.clave] != null).map((s) => (
                        <label key={s.clave} className="flex items-center gap-2 text-n-800">
                          <input type="checkbox" className="h-4 w-4" checked={Boolean(elegidos[s.clave])} onChange={(e) => setElegidos((m) => ({ ...m, [s.clave]: e.target.checked }))} />
                          {s.etiqueta}: <strong>{String(borrador[s.clave])}</strong>
                          {valores[s.clave] ? <span className="text-n-600">(hoy: {valores[s.clave]})</span> : null}
                        </label>
                      ))}
                    </div>
                  </li>
                )}
                {borrador.diagnosticos.length > 0 && (
                  <li className="rounded-md border border-n-200 bg-white p-3">
                    <p className="text-sm font-bold text-n-900">Diagnósticos sugeridos del catálogo</p>
                    <div className="mt-1 flex flex-col gap-1">
                      {borrador.diagnosticos.map((d) => (
                        <label key={d.ref_id} className="flex items-center gap-2 text-n-800">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={Boolean(elegidos[`dx:${d.ref_id}`])}
                            onChange={(e) => setElegidos((m) => ({ ...m, [`dx:${d.ref_id}`]: e.target.checked }))}
                            disabled={diagnosticos.some((x) => x.ref_id === d.ref_id)}
                          />
                          {d.nombre} <span className="text-sm text-n-600">({d.tipo}){diagnosticos.some((x) => x.ref_id === d.ref_id) ? " · ya está" : ""}</span>
                        </label>
                      ))}
                    </div>
                  </li>
                )}
              </ul>
              {borrador.sin_catalogo.length > 0 && (
                <p className="text-sm text-n-700">No están en el catálogo (búscalos a mano en Diagnósticos): {borrador.sin_catalogo.join(", ")}.</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={pasarAlExpediente} disabled={aplicado}>
                  {aplicado ? "Pasado al expediente" : "Pasar al expediente"}
                </Button>
                <Button type="button" variante="secundario" onClick={() => { setFase("preparado"); setBorrador(null); setTranscripcion(""); setError(null); }}>
                  Dictar otra vez
                </Button>
                <Button type="button" variante="secundario" onClick={() => setFase("cerrado")}>
                  Cerrar
                </Button>
              </div>
            </>
          ) : (
            <p className="text-n-700">No se armó el borrador, pero la transcripción quedó abajo para que la uses.</p>
          )}
          {transcripcion && (
            <details className="rounded-md border border-n-200 bg-white p-3">
              <summary className="cursor-pointer text-sm font-semibold text-n-800">Ver la transcripción</summary>
              <p className="mt-2 whitespace-pre-wrap text-n-800">{transcripcion}</p>
              <p className="mt-2 text-xs text-n-600">Solo se ve aquí: no se guarda en ningún lado. Si la necesitas, cópiala ahora.</p>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
