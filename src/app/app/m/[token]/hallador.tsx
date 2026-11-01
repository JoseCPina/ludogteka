"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useEspera } from "@/hooks/use-espera";
import { esperarConTope } from "@/lib/ui/espera";
import { IconoFlecha, IconoWhatsApp } from "@/components/app/iconos";
import { mandarMensaje, verHilo } from "./acciones";

type Msg = { de: "hallador" | "dueno"; texto: string; creado: string };

/** Quien encontró a la mascota le escribe a su familia desde aquí (o por WhatsApp al bot); ve las respuestas en esta misma página. */
export function Hallador({ token, nombre, waUrl }: { token: string; nombre: string; waUrl: string | null }) {
  const envio = useEspera();
  const clave = `apd_hallador_${token}`;
  // Desde cuándo ve el hilo: lo que escribió en esta visita o en una anterior (localStorage; sin él, solo esta visita).
  const guardado = useSyncExternalStore(() => () => {}, () => { try { return window.localStorage.getItem(clave); } catch { return null; } }, () => null);
  const [desdeNuevo, setDesdeNuevo] = useState<string | null>(null);
  const desde = desdeNuevo ?? guardado;
  const setDesde = setDesdeNuevo;
  const [hilo, setHilo] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [nom, setNom] = useState("");
  const [wa, setWa] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [errorSondeo, setErrorSondeo] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const trampa = useRef<HTMLInputElement>(null);

  // Desde que escribió: cada 10 s, ¿contestó la familia? Con tope, sin encimar, aviso a dos fallos.
  useEffect(() => {
    if (!desde) return;
    let vivo = true;
    let enCurso = false;
    let fallos = 0;
    const comprobar = async () => {
      if (enCurso) return;
      enCurso = true;
      try {
        const r = await esperarConTope(() => verHilo(token, desde).then((x) => ({ error: null as string | null, ...x })), 8000);
        if (!vivo) return;
        if (r.error) {
          fallos += 1;
          if (fallos >= 2) setErrorSondeo(r.error);
          return;
        }
        fallos = 0;
        setErrorSondeo(null);
        setHilo(r.mensajes ?? []);
      } finally {
        enCurso = false;
      }
    };
    void comprobar();
    const t = window.setInterval(comprobar, 10_000);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [desde, token, intento]);

  return (
    <div className="apd-lista">
      {hilo.length > 0 && (
        <ul className="apd-lista" data-hilo-publico>
          {hilo.map((m, i) => (
            <li key={i} className="apd-tarjeta" style={m.de === "dueno" ? { background: "var(--apd-morado-suave)", boxShadow: "none" } : undefined} data-mensaje={m.de}>
              <p className="apd-nota" style={{ fontSize: "0.75rem" }}>{m.de === "dueno" ? `La familia de ${nombre}` : "Tú"}</p>
              <p style={{ marginTop: "0.2rem" }}>{m.texto}</p>
            </li>
          ))}
        </ul>
      )}
      <form
        className="apd-tarjeta"
        data-form-hallador
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setOk(null);
          if (texto.trim().length < 2) return setError("Escribe qué pasó o dónde está.");
          const r = await envio.ejecutar(() => mandarMensaje(token, texto, nom, wa, trampa.current?.value ?? ""));
          if (r.error) return setError(r.error);
          const d = desde ?? r.desde ?? new Date().toISOString();
          try {
            window.localStorage.setItem(clave, d);
          } catch {
            /* sin almacenamiento */
          }
          setDesde(d);
          setTexto("");
          setOk("Listo, ya le avisamos a su familia. Si te contestan, lo ves aquí mismo; deja esta página abierta o vuelve a escanear el QR.");
          setIntento((n) => n + 1);
        }}
      >
        <label className="apd-etiqueta" htmlFor="hl-texto">Escríbele a la familia de {nombre}</label>
        <textarea id="hl-texto" className="apd-campo" style={{ minHeight: "5.5rem", paddingTop: "0.75rem" }} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={600} placeholder={`La vi en el parque de… / La tengo conmigo, está bien.`} required />
        <div className="apd-datos" style={{ marginTop: "0.75rem" }}>
          <div><label className="apd-etiqueta" htmlFor="hl-nombre">Tu nombre (si quieres)</label><input id="hl-nombre" className="apd-campo" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={60} /></div>
          <div><label className="apd-etiqueta" htmlFor="hl-wa">Tu WhatsApp (para que te contesten ahí)</label><input id="hl-wa" className="apd-campo" type="tel" inputMode="numeric" value={wa} onChange={(e) => setWa(e.target.value)} placeholder="10 dígitos" /></div>
        </div>
        <input ref={trampa} type="text" name="sitio_web" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
        <p className="apd-nota" style={{ marginTop: "0.5rem" }}>Ni tú ves su teléfono ni ellos el tuyo: PeluDesk lleva los mensajes.</p>
        {error && <p className="apd-aviso apd-aviso-error" role="alert" style={{ marginTop: "0.75rem" }}>{error}</p>}
        {ok && <p className="apd-aviso apd-aviso-ok" role="status" style={{ marginTop: "0.75rem" }}>{ok}</p>}
        {errorSondeo && (
          <div className="apd-aviso apd-aviso-error" role="alert" style={{ marginTop: "0.75rem" }}>
            <span>No pudimos revisar si ya te contestaron. {errorSondeo}</span>
            <button type="button" className="apd-boton-suave" onClick={() => { setErrorSondeo(null); setIntento((n) => n + 1); }}>Reintentar</button>
          </div>
        )}
        <div className="apd-fila" style={{ marginTop: "0.9rem", flexWrap: "wrap" }}>
          <button type="submit" className="apd-boton" aria-busy={envio.cargando} disabled={envio.cargando} data-mandar-mensaje>
            Avisarle a su familia
            <span className="apd-boton-flecha"><IconoFlecha style={{ width: 16, height: 16 }} /></span>
          </button>
          {waUrl && (
            <a href={waUrl} target="_blank" rel="noopener noreferrer" className="apd-boton-sec" data-hallazgo-whatsapp><IconoWhatsApp style={{ width: 20, height: 20 }} /> Mejor por WhatsApp</a>
          )}
        </div>
      </form>
    </div>
  );
}
