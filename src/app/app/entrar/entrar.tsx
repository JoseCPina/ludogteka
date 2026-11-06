"use client";

import { useEffect, useRef, useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { IconoFlecha } from "@/components/app/iconos";
import type { EnvioCodigo } from "@/lib/app/entrada-codigo";
import { conContrasena, pedirCodigo, verificarCodigo } from "./acciones";

const LUGAR: Record<EnvioCodigo["canal"], string> = { plantilla: "por WhatsApp", sesion: "por WhatsApp", sms: "por SMS" };

/**
 * Entrar: tu número → te mandamos un código de 6 dígitos por WhatsApp → lo escribes y entras. Si no llega en 60 s, se puede
 * reenviar o pedir por SMS. Quien tiene contraseña (clientes de un negocio) la puede usar abajo.
 */
export function Entrar({ ir }: { ir: string | null }) {
  const envio = useEspera();
  const [telefono, setTelefono] = useState("");
  const [enviado, setEnviado] = useState<EnvioCodigo | null>(null);
  const [codigo, setCodigo] = useState("");
  const [faltan, setFaltan] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [conPass, setConPass] = useState(false);
  const [password, setPassword] = useState("");
  const campoTel = useRef<HTMLInputElement>(null);
  const campoCodigo = useRef<HTMLInputElement>(null);
  const verificando = useRef(false);

  useEffect(() => {
    if (faltan <= 0) return;
    const t = window.setTimeout(() => setFaltan((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [faltan]);

  const pedir = async (canal?: "whatsapp" | "sms") => {
    setError(null);
    setAviso(null);
    const tel = campoTel.current?.value ?? telefono;
    if (tel.replace(/\D/g, "").length < 10) return setError("Escribe tu número de WhatsApp a diez dígitos.");
    const r = await envio.ejecutar(() => pedirCodigo(tel, canal));
    if (r.error) return setError(r.error);
    if (r.envio) {
      setTelefono(tel);
      setEnviado(r.envio);
      setCodigo("");
      setFaltan(r.envio.reenviarEnSegundos);
      if (enviado) setAviso(`Te mandamos otro código ${LUGAR[r.envio.canal]}. Solo sirve el último.`);
      window.setTimeout(() => campoCodigo.current?.focus(), 50);
    }
  };

  const verificar = async (valor: string) => {
    if (verificando.current) return;
    verificando.current = true;
    setError(null);
    setAviso(null);
    const r = await envio.ejecutar(() => verificarCodigo(telefono, valor, ir));
    verificando.current = false;
    if (r?.error) {
      setError(r.error);
      setCodigo("");
      if (r.pedirOtro) setFaltan(0);
      campoCodigo.current?.focus();
    }
  };

  if (enviado) {
    return (
      <form
        className="apd-lista"
        data-entrada-paso2
        onSubmit={(e) => {
          e.preventDefault();
          if (codigo.length === 6) void verificar(codigo);
        }}
      >
        <div className="apd-tarjeta apd-aparece">
          <span className="apd-ceja">Paso 2 de 2</span>
          <h2 className="apd-titulo" style={{ fontSize: "1.5rem" }}>Escribe tu código</h2>
          <p className="apd-linea">Te lo mandamos {LUGAR[enviado.canal]} al número que termina en {enviado.telefonoUlt4}. Vence en {enviado.venceEnMinutos} minutos.</p>
          <label htmlFor="entrar-codigo" className="apd-etiqueta" style={{ marginTop: "1rem" }}>Código de 6 dígitos</label>
          <input
            id="entrar-codigo"
            ref={campoCodigo}
            className="apd-campo apd-codigo"
            data-codigo-entrada
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            value={codigo}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCodigo(v);
              if (v.length === 6) void verificar(v);
            }}
          />
          {aviso && <p className="apd-aviso apd-aviso-ambar" style={{ marginTop: "0.9rem" }}>{aviso}</p>}
          {error && <p className="apd-aviso apd-aviso-error" role="alert" style={{ marginTop: "0.9rem" }}>{error}</p>}
          <button type="submit" className="apd-boton apd-boton-ancho" style={{ marginTop: "1rem" }} aria-busy={envio.cargando} disabled={envio.cargando || codigo.length !== 6}>
            {envio.cargando ? "Entrando…" : "Entrar"}
          </button>
          <div className="apd-fila" style={{ marginTop: "1rem", flexWrap: "wrap" }}>
            {faltan > 0 ? (
              <span className="apd-nota" aria-live="polite" data-reenviar-en>Si no llega, puedes pedir otro en {faltan} s.</span>
            ) : (
              <>
                <button type="button" className="apd-boton-suave" disabled={envio.cargando} onClick={() => void pedir("whatsapp")} data-reenviar>Reenviar</button>
                {enviado.smsDisponible && <button type="button" className="apd-boton-suave" disabled={envio.cargando} onClick={() => void pedir("sms")} data-mandar-sms>Mandar por SMS</button>}
              </>
            )}
          </div>
        </div>
        <button type="button" className="apd-enlace" style={{ background: "none", border: 0, padding: "0.5rem 0", textAlign: "left", cursor: "pointer" }} onClick={() => { setEnviado(null); setError(null); setAviso(null); }}>
          Cambiar de número
        </button>
      </form>
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
        <input id="entrar-tel" data-campo-telefono ref={campoTel} type="tel" inputMode="numeric" autoComplete="tel" placeholder="10 dígitos" className="apd-campo" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        {conPass && (
          <div style={{ marginTop: "0.9rem" }}>
            <label htmlFor="entrar-pass" className="apd-etiqueta">Tu contraseña</label>
            <input id="entrar-pass" type="password" autoComplete="current-password" className="apd-campo" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        )}
        {error && <p className="apd-aviso apd-aviso-error" role="alert" style={{ marginTop: "0.9rem" }}>{error}</p>}
        <button type="submit" data-boton-entrar className="apd-boton apd-boton-ancho" style={{ marginTop: "1rem" }} aria-busy={envio.cargando} disabled={envio.cargando}>
          {conPass ? "Entrar" : "Mandarme mi código"}
          <span className="apd-boton-flecha"><IconoFlecha style={{ width: 16, height: 16 }} /></span>
        </button>
      </div>
      <p className="apd-nota apd-aparece" style={{ ["--i" as string]: 2 }}>
        {conPass ? (
          <>¿Mejor sin contraseña? <button type="button" className="apd-enlace" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => { setConPass(false); setError(null); }}>Entra con un código por WhatsApp</button>.</>
        ) : (
          <>Te mandamos un código por WhatsApp y entras, sin contraseña. Si ya tienes una del portal de tu veterinaria o guardería, <button type="button" className="apd-enlace" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => { setConPass(true); setError(null); }}>entra con ella</button>.</>
        )}
      </p>
    </form>
  );
}
