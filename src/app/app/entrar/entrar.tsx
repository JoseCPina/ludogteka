"use client";

import { useEffect, useRef, useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { esperarConTope } from "@/lib/ui/espera";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { IconoFlecha, IconoWhatsApp } from "@/components/app/iconos";
import type { EstadoEntrada } from "@/lib/app/entrada";
import { canjear, conContrasena, consultarEntrada, pedirCodigo } from "./acciones";

/**
 * Entrar: tu número → un código en pantalla → lo mandas tú por WhatsApp → entras. Mientras, la pantalla pregunta cada
 * 3 s si ya llegó; verificado, canjea y navega. Quien tiene contraseña (clientes de un negocio) la puede usar abajo.
 */
export function Entrar({ ir }: { ir: string | null }) {
  const envio = useEspera();
  const [telefono, setTelefono] = useState("");
  const [entrada, setEntrada] = useState<EstadoEntrada | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conPass, setConPass] = useState(false);
  const [password, setPassword] = useState("");
  const [errorSondeo, setErrorSondeo] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const canjeando = useRef(false);
  const campoTel = useRef<HTMLInputElement>(null);

  // Mientras el código está pendiente: ¿ya lo mandó? Con tope, sin encimar preguntas; a dos fallos seguidos se dice.
  useEffect(() => {
    if (!entrada || entrada.estado !== "pendiente") return;
    let vivo = true;
    let enCurso = false;
    let fallos = 0;
    const comprobar = async () => {
      if (enCurso || canjeando.current) return;
      enCurso = true;
      try {
        const r = await esperarConTope(() => consultarEntrada(entrada.id), 8000);
        if (!vivo) return;
        if (r.error) {
          fallos += 1;
          if (fallos >= 2) setErrorSondeo(r.error);
          return;
        }
        fallos = 0;
        setErrorSondeo(null);
        if (r.entrada && r.entrada.estado !== "pendiente") setEntrada(r.entrada);
      } finally {
        enCurso = false;
      }
    };
    if (intento > 0) void comprobar();
    const t = window.setInterval(comprobar, 3000);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [entrada, intento]);

  // Verificada: se canjea una sola vez y la acción navega.
  useEffect(() => {
    if (!entrada || entrada.estado !== "verificada" || canjeando.current) return;
    canjeando.current = true;
    (async () => {
      const r = await esperarConTope(() => canjear(entrada.id, ir));
      if (r?.error) {
        canjeando.current = false;
        setError(r.error);
        setEntrada(null);
      }
    })();
  }, [entrada, ir]);

  const pedir = async () => {
    setError(null);
    const tel = campoTel.current?.value ?? telefono;
    if (tel.replace(/\D/g, "").length < 10) return setError("Escribe tu número de WhatsApp a diez dígitos.");
    const r = await envio.ejecutar(() => pedirCodigo(tel));
    if (r.error) return setError(r.error);
    if (r.entrada) setEntrada(r.entrada);
  };

  if (entrada && entrada.estado !== "vencida") {
    const verificada = entrada.estado === "verificada" || entrada.estado === "usada";
    return (
      <div className="apd-lista" data-entrada-paso2>
        <div className="apd-bandeja apd-aparece">
          <div className="apd-tarjeta">
            <span className="apd-ceja">Paso 2 de 2</span>
            <h2 className="apd-titulo" style={{ fontSize: "1.5rem" }}>{verificada ? "Listo, ya entraste" : "Mándanos este código por WhatsApp"}</h2>
            <p className="apd-linea">
              {verificada
                ? "Un segundo, te llevamos adentro."
                : `Desde el número que termina en ${entrada.telefonoUlt4}. Así sabemos que eres tú, sin contraseña. En cuanto llegue, esta pantalla entra sola.`}
            </p>
            {!verificada && (
              <>
                <p className="apd-codigo" style={{ marginTop: "1rem" }} data-codigo-entrada>{entrada.codigo}</p>
                <div style={{ marginTop: "1rem" }}>
                  <CampoCopiable valor={`ENTRAR ${entrada.codigo}`} etiqueta="El mensaje completo" textoBoton="Copiar" monoespaciado />
                </div>
                <div className="apd-fila" style={{ marginTop: "1rem", flexWrap: "wrap" }}>
                  {entrada.waUrl ? (
                    <a href={entrada.waUrl} target="_blank" rel="noopener noreferrer" className="apd-boton" data-abrir-whatsapp>
                      <IconoWhatsApp style={{ width: 20, height: 20 }} /> Abrir WhatsApp con el código
                    </a>
                  ) : (
                    <p className="apd-aviso apd-aviso-ambar">El WhatsApp de PeluDesk no está configurado en este entorno: manda el mensaje a mano o entra con tu contraseña.</p>
                  )}
                  <span className="apd-nota" aria-live="polite" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--apd-morado)", display: "inline-block" }} className="animate-pulse" aria-hidden /> Esperando tu mensaje…
                  </span>
                </div>
              </>
            )}
            {errorSondeo && (
              <div className="apd-aviso apd-aviso-error" role="alert" style={{ marginTop: "1rem" }} data-error-sondeo>
                <span>No pudimos revisar si ya llegó tu mensaje. {errorSondeo}</span>
                <button type="button" className="apd-boton-suave" onClick={() => { setErrorSondeo(null); setIntento((n) => n + 1); }}>Reintentar</button>
              </div>
            )}
          </div>
        </div>
        {!verificada && (
          <button type="button" className="apd-enlace" style={{ background: "none", border: 0, padding: "0.5rem 0", textAlign: "left", cursor: "pointer" }} onClick={() => setEntrada(null)}>
            Cambiar de número o pedir otro código
          </button>
        )}
      </div>
    );
  }

  return (
    <form
      className="apd-lista"
      data-entrada-paso1
      onSubmit={(e) => {
        e.preventDefault();
        if (conPass) {
          setError(null);
          envio.ejecutar(() => conContrasena(campoTel.current?.value ?? telefono, password, ir)).then((r) => r?.error && setError(r.error));
        } else void pedir();
      }}
    >
      <div className="apd-tarjeta apd-aparece" style={{ ["--i" as string]: 1 }}>
        <label htmlFor="entrar-tel" className="apd-etiqueta">Tu número de WhatsApp</label>
        <input id="entrar-tel" ref={campoTel} type="tel" inputMode="numeric" autoComplete="tel" placeholder="10 dígitos" className="apd-campo" value={telefono} onChange={(e) => setTelefono(e.target.value)} required data-campo-telefono />
        {conPass && (
          <div style={{ marginTop: "0.9rem" }}>
            <label htmlFor="entrar-pass" className="apd-etiqueta">Tu contraseña</label>
            <input id="entrar-pass" type="password" autoComplete="current-password" className="apd-campo" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        )}
        {entrada?.estado === "vencida" && !error && <p className="apd-aviso apd-aviso-ambar" style={{ marginTop: "0.9rem" }}>Ese código ya venció. Pide uno nuevo: toma un segundo.</p>}
        {error && <p className="apd-aviso apd-aviso-error" role="alert" style={{ marginTop: "0.9rem" }}>{error}</p>}
        <button type="submit" className="apd-boton apd-boton-ancho" style={{ marginTop: "1rem" }} aria-busy={envio.cargando} disabled={envio.cargando} data-boton-entrar>
          {conPass ? "Entrar" : "Darme mi código"}
          <span className="apd-boton-flecha"><IconoFlecha style={{ width: 16, height: 16 }} /></span>
        </button>
      </div>
      <p className="apd-nota apd-aparece" style={{ ["--i" as string]: 2 }}>
        {conPass ? (
          <>¿Mejor sin contraseña? <button type="button" className="apd-enlace" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => setConPass(false)}>Entrar con el código por WhatsApp</button>.</>
        ) : (
          <>Te damos un código, nos lo mandas por WhatsApp y entras. Sin contraseña. Si ya tienes una del portal de tu veterinaria o guardería, también sirve: <button type="button" className="apd-enlace" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => setConPass(true)} data-con-contrasena>entrar con contraseña</button>.</>
        )}
      </p>
    </form>
  );
}
