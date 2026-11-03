"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { etiquetaEstado } from "@/lib/estados/insignias";
import { confirmarVisitaApp, resenarApp } from "../negocios/acciones";

export type VisitaVista = {
  tipo: "estetica" | "estancia";
  id: string;
  negocioId: string;
  negocioNombre: string;
  perroNombre: string;
  servicioNombre: string;
  cuando: string;
  estado: string;
  puedeConfirmar: boolean;
  puedeResenar: boolean;
  calificada: boolean;
  proxima: boolean;
};

const CHIP: Record<string, string> = { reservada: "apd-chip apd-chip-ambar", confirmada: "apd-chip", en_curso: "apd-chip", finalizada: "apd-chip apd-chip-neutro" };

/** Las visitas con sus dos acciones: confirmar (un toque) y opinar (estrellas y una línea). */
export function ListaVisitas({ proximas, pasadas }: { proximas: VisitaVista[]; pasadas: VisitaVista[] }) {
  const [estados, setEstados] = useState<Record<string, string>>({});
  const [calificadas, setCalificadas] = useState<Set<string>>(new Set());
  const [error, setError] = useState<{ id: string; texto: string } | null>(null);
  const [cual, setCual] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const envio = useEspera();

  async function confirmar(v: VisitaVista) {
    setError(null);
    setCual(v.id);
    const r = await envio.ejecutar(() => confirmarVisitaApp(v.negocioId, v.tipo, v.id));
    setCual(null);
    if (r.error) return setError({ id: v.id, texto: r.error });
    const estado = (r.datos as { estado?: string } | undefined)?.estado ?? "confirmada";
    setEstados((e) => ({ ...e, [v.id]: estado }));
  }

  const tarjeta = (v: VisitaVista) => {
    const estado = estados[v.id] ?? v.estado;
    const yaCalificada = v.calificada || calificadas.has(v.id);
    return (
      <li key={v.id} className="apd-tarjeta" data-visita={v.id} data-estado={estado}>
        <div className="apd-fila" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <span className="apd-ceja">{v.negocioNombre}</span>
          <span className={CHIP[estado] ?? "apd-chip apd-chip-neutro"} data-estado-visita>{etiquetaEstado(estado)}</span>
        </div>
        <p style={{ fontWeight: 800, marginTop: "0.35rem" }}>{v.servicioNombre} · {v.perroNombre}</p>
        <p className="apd-nota">{v.cuando}</p>
        {estado === "reservada" && v.puedeConfirmar && (
          <div className="apd-fila" style={{ marginTop: "0.75rem" }}>
            <button type="button" className="apd-boton" aria-busy={(envio.cargando && cual === v.id) || undefined} disabled={envio.cargando} onClick={() => confirmar(v)} data-confirmar-visita={v.id}>
              {envio.cargando && cual === v.id ? "Confirmando…" : "Confirmar que vamos"}
            </button>
          </div>
        )}
        {estado === "confirmada" && estados[v.id] && <p className="apd-aviso apd-aviso-ok" role="status" style={{ marginTop: "0.75rem" }}>Listo: {v.negocioNombre} ya sabe que van.</p>}
        {v.puedeResenar && !yaCalificada && abierta !== v.id && (
          <div className="apd-fila" style={{ marginTop: "0.75rem" }}>
            <button type="button" className="apd-boton-sec" onClick={() => setAbierta(v.id)} data-opinar={v.id}>¿Cómo te fue?</button>
          </div>
        )}
        {abierta === v.id && !yaCalificada && (
          <Opinar
            v={v}
            onListo={() => {
              setCalificadas((s) => new Set(s).add(v.id));
              setAbierta(null);
            }}
          />
        )}
        {yaCalificada && <p className="apd-nota" style={{ marginTop: "0.5rem" }} data-calificada>Gracias por tu opinión.</p>}
        {error?.id === v.id && <p className="apd-aviso apd-aviso-error" role="alert" style={{ marginTop: "0.75rem" }}>{error.texto}</p>}
      </li>
    );
  };

  return (
    <>
      {proximas.length > 0 && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 1 }} data-visitas-proximas>
          <h2 className="apd-seccion-titulo">Lo que viene</h2>
          <ul className="apd-lista">{proximas.map(tarjeta)}</ul>
        </section>
      )}
      {pasadas.length > 0 && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 2 }} data-visitas-pasadas>
          <h2 className="apd-seccion-titulo">Las que ya fueron</h2>
          <ul className="apd-lista">{pasadas.map(tarjeta)}</ul>
        </section>
      )}
    </>
  );
}

function Opinar({ v, onListo }: { v: VisitaVista; onListo: () => void }) {
  const [estrellas, setEstrellas] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const envio = useEspera();
  async function mandar(form: HTMLFormElement) {
    setError(null);
    if (estrellas < 1) return setError("Toca de 1 a 5 estrellas.");
    const texto = (new FormData(form).get("texto") as string | null) ?? "";
    const r = await envio.ejecutar(() => resenarApp(v.negocioId, v.tipo, v.id, estrellas, texto));
    if (r.error) return setError(r.error);
    onListo();
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mandar(e.currentTarget);
      }}
      style={{ marginTop: "0.75rem" }}
      data-form-opinar={v.id}
    >
      <p className="apd-etiqueta">¿Cómo le fue a {v.perroNombre} en {v.negocioNombre}?</p>
      <div className="apd-fila" role="radiogroup" aria-label="Estrellas" style={{ gap: "0.25rem", marginTop: "0.35rem" }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={estrellas === n}
            aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`}
            onClick={() => setEstrellas(n)}
            className="apd-estrella"
            data-activa={n <= estrellas ? "si" : "no"}
            data-estrella={n}
          >
            ★
          </button>
        ))}
      </div>
      <label className="apd-etiqueta" style={{ display: "block", marginTop: "0.6rem" }}>
        Cuéntales algo (opcional)
        <textarea name="texto" className="apd-campo" rows={3} maxLength={500} style={{ marginTop: "0.3rem" }} />
      </label>
      <button type="submit" className="apd-boton" style={{ marginTop: "0.6rem" }} aria-busy={envio.cargando || undefined} disabled={envio.cargando} data-mandar-opinion>
        {envio.cargando ? "Mandando…" : "Mandar mi opinión"}
      </button>
      {error && <p className="apd-aviso apd-aviso-error" role="alert" style={{ marginTop: "0.6rem" }}>{error}</p>}
    </form>
  );
}
