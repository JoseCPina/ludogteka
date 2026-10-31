"use client";

import { esperarConTope } from "@/lib/ui/espera";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { SUGERENCIAS, sumarMeses, type RegistroCartilla } from "@/lib/app/cartilla-util";
import { agregarRegistro, quitarRegistro, recordatoriosDeMascota } from "./acciones";

const FUENTE: Record<RegistroCartilla["fuente"], string> = { foto: "de la foto de su cartilla", manual: "lo anotaste tú", negocio: "lo registró tu negocio", qr: "lo registró una vet por QR" };
const ESTADO: Record<RegistroCartilla["estado"], { texto: string; clase: string }> = {
  vigente: { texto: "Al día", clase: "apd-chip" },
  por_vencer: { texto: "Toca pronto", clase: "apd-chip apd-chip-ambar" },
  vencida: { texto: "Ya pasó la fecha", clase: "apd-chip apd-chip-coral" },
  sin_fecha: { texto: "Sin próxima dosis", clase: "apd-chip apd-chip-neutro" },
};
const fecha = (f: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : "—");

export function Cartilla({ mascotaId, especie, registros, abrirCaptura, recordatoriosApagados }: { mascotaId: string; especie: "perro" | "gato" | "otro"; registros: RegistroCartilla[]; abrirCaptura: boolean; recordatoriosApagados: boolean }) {
  const router = useRouter();
  const envio = useEspera();
  const quitando = useEspera();
  const [capturar, setCapturar] = useState(abrirCaptura);
  const [tipo, setTipo] = useState<"vacuna" | "desparasitacion">("vacuna");
  const [nombre, setNombre] = useState("");
  const [aplicada, setAplicada] = useState("");
  const [proxima, setProxima] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const sugerencias = SUGERENCIAS[especie].filter((s) => s.tipo === tipo);

  return (
    <div className="apd-lista">
      {registros.length === 0 && !capturar && (
        <div className="apd-vacio">
          <p style={{ fontWeight: 800 }}>Su cartilla está vacía</p>
          <p className="apd-nota" style={{ marginTop: "0.4rem" }}>Tómale foto a la de papel o anota las fechas que recuerdes.</p>
        </div>
      )}
      {registros.map((r) => (
        <div key={r.id} className="apd-tarjeta" data-registro-cartilla data-estado={r.estado}>
          <div className="apd-fila" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 800 }}>{r.nombre}{r.subtipo ? <span className="apd-nota"> · {r.subtipo}</span> : null}</p>
              <p className="apd-nota">{r.tipo === "vacuna" ? "Vacuna" : "Desparasitación"} · aplicada {fecha(r.fechaAplicacion)}{r.proximaDosis ? ` · próxima ${fecha(r.proximaDosis)}` : ""}{r.lote ? ` · lote ${r.lote}` : ""}</p>
              <p className="apd-nota" style={{ fontSize: "0.75rem" }}>{FUENTE[r.fuente]}{r.confianza != null && r.confianza < 0.7 ? " · lectura dudosa, revísalo" : ""}</p>
            </div>
            <span className={ESTADO[r.estado].clase} style={{ flex: "none" }}>{ESTADO[r.estado].texto}</span>
          </div>
          {(r.fuente === "foto" || r.fuente === "manual") && (
            <button type="button" className="apd-enlace" style={{ background: "none", border: 0, padding: "0.4rem 0 0", cursor: "pointer", fontSize: "0.875rem" }} disabled={quitando.cargando} onClick={async () => { const x = await quitando.ejecutar(() => quitarRegistro(mascotaId, r.id)); if (!x.error) router.refresh(); }}>
              Quitar
            </button>
          )}
        </div>
      ))}

      {capturar ? (
        <form
          className="apd-tarjeta"
          data-captura-manual
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setOk(null);
            const r = await envio.ejecutar(() => agregarRegistro(mascotaId, { tipo, nombre, fecha_aplicacion: aplicada || null, proxima_dosis: proxima || null }));
            if (r.error) return setError(r.error);
            setOk(`Anotado. ${proxima ? "Te avisamos cuando toque." : "Si pones la próxima dosis, te avisamos cuando toque."}`);
            setNombre(""); setAplicada(""); setProxima("");
            router.refresh();
          }}
        >
          <p style={{ fontWeight: 800 }}>Anotar a mano</p>
          <div className="apd-tabs" style={{ marginTop: "0.6rem" }} role="group" aria-label="Tipo">
            <button type="button" className="apd-tab" aria-pressed={tipo === "vacuna"} onClick={() => setTipo("vacuna")}>Vacuna</button>
            <button type="button" className="apd-tab" aria-pressed={tipo === "desparasitacion"} onClick={() => setTipo("desparasitacion")}>Desparasitación</button>
          </div>
          <label className="apd-etiqueta" htmlFor="cm-nombre" style={{ marginTop: "0.8rem" }}>Cuál</label>
          <input id="cm-nombre" className="apd-campo" value={nombre} onChange={(e) => setNombre(e.target.value)} list="cm-sugerencias" maxLength={80} placeholder={tipo === "vacuna" ? "Antirrábica, Séxtuple…" : "Interna, pulgas y garrapatas…"} />
          <datalist id="cm-sugerencias">{sugerencias.map((s) => <option key={s.nombre} value={s.nombre} />)}</datalist>
          <div className="apd-tabs" style={{ marginTop: "0.5rem" }}>
            {sugerencias.map((s) => (
              <button key={s.nombre} type="button" className="apd-tab" aria-pressed={nombre === s.nombre} onClick={() => { setNombre(s.nombre); if (aplicada && !proxima) setProxima(sumarMeses(aplicada, s.meses)); }}>{s.nombre}</button>
            ))}
          </div>
          <div className="apd-datos" style={{ marginTop: "0.8rem" }}>
            <div>
              <label className="apd-etiqueta" htmlFor="cm-aplicada">Se aplicó</label>
              <input id="cm-aplicada" type="date" className="apd-campo" value={aplicada} onChange={(e) => { setAplicada(e.target.value); const sg = sugerencias.find((x) => x.nombre === nombre); if (sg && e.target.value && !proxima) setProxima(sumarMeses(e.target.value, sg.meses)); }} />
            </div>
            <div>
              <label className="apd-etiqueta" htmlFor="cm-proxima">Próxima dosis</label>
              <input id="cm-proxima" type="date" className="apd-campo" value={proxima} onChange={(e) => setProxima(e.target.value)} />
            </div>
          </div>
          {error && <p className="apd-aviso apd-aviso-error" role="alert" style={{ marginTop: "0.75rem" }}>{error}</p>}
          {ok && <p className="apd-aviso apd-aviso-ok" role="status" style={{ marginTop: "0.75rem" }}>{ok}</p>}
          <div className="apd-fila" style={{ marginTop: "0.9rem", flexWrap: "wrap" }}>
            <button type="submit" className="apd-boton-sec" aria-busy={envio.cargando} disabled={envio.cargando} data-guardar-manual>Anotar</button>
            <button type="button" className="apd-boton-suave" onClick={() => setCapturar(false)}>Cerrar</button>
          </div>
        </form>
      ) : (
        <button type="button" className="apd-boton-sec" onClick={() => setCapturar(true)} data-abrir-captura>Anotar una vacuna o desparasitación a mano</button>
      )}

      <label className="apd-fila apd-nota" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={!recordatoriosApagados} onChange={async (e) => { await esperarConTope(() => recordatoriosDeMascota(mascotaId, !e.target.checked)); router.refresh(); }} style={{ width: 20, height: 20 }} />
        Avisarme cuando le toque una dosis (una semana antes y el mismo día)
      </label>
    </div>
  );
}
