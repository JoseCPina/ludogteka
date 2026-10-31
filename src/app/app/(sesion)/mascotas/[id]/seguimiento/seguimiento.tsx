"use client";

import { esperarConTope } from "@/lib/ui/espera";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { agregarGasto, agregarMedicamento, agregarPeso, quitarGasto, quitarPeso, terminarMedicamento } from "./acciones";

export type Peso = { id: string; pesoKg: number; fecha: string; notas: string | null };
export type Medicamento = { id: string; nombre: string; dosis: string | null; horas: string[]; fechaInicio: string; fechaFin: string | null };
export type Gasto = { id: string; concepto: string; monto: number; categoria: string; fecha: string };
const CATEGORIAS: [string, string][] = [["alimento", "Alimento"], ["veterinaria", "Veterinaria"], ["estetica", "Estética"], ["guarderia_hotel", "Guardería u hotel"], ["medicinas", "Medicinas"], ["accesorios", "Accesorios"], ["otro", "Otro"]];
const fecha = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const pesos = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hoy = () => new Date().toISOString().slice(0, 10);

export function Seguimiento({ mascotaId, pesosLista, medicamentos, gastos, totalMes, mesNombre }: { mascotaId: string; pesosLista: Peso[]; medicamentos: Medicamento[]; gastos: Gasto[]; totalMes: number; mesNombre: string }) {
  return (
    <div className="apd-lista" style={{ gap: "1.75rem" }}>
      <SeccionPeso mascotaId={mascotaId} lista={pesosLista} />
      <SeccionMedicamentos mascotaId={mascotaId} lista={medicamentos} />
      <SeccionGastos mascotaId={mascotaId} lista={gastos} totalMes={totalMes} mesNombre={mesNombre} />
    </div>
  );
}

function SeccionPeso({ mascotaId, lista }: { mascotaId: string; lista: Peso[] }) {
  const router = useRouter();
  const envio = useEspera();
  const [abierto, setAbierto] = useState(false);
  const [peso, setPeso] = useState("");
  const [f, setF] = useState(hoy());
  const [error, setError] = useState<string | null>(null);
  const ultimo = lista[0];
  const anterior = lista[1];
  return (
    <section data-seccion-peso>
      <h2 className="apd-seccion-titulo">Peso</h2>
      <div className="apd-tarjeta">
        {ultimo ? (
          <p><span style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.02em" }}>{ultimo.pesoKg} kg</span> <span className="apd-nota">el {fecha(ultimo.fecha)}{anterior ? ` · antes ${anterior.pesoKg} kg (${fecha(anterior.fecha)})` : ""}</span></p>
        ) : (
          <p className="apd-nota">Todavía no hay peso anotado. Anota el de la báscula de la vet o el de casa.</p>
        )}
        {abierto ? (
          <form className="apd-lista" style={{ marginTop: "0.9rem" }} onSubmit={async (e) => { e.preventDefault(); setError(null); const r = await envio.ejecutar(() => agregarPeso(mascotaId, peso, f, null)); if (r.error) return setError(r.error); setPeso(""); setAbierto(false); router.refresh(); }}>
            <div className="apd-datos">
              <div><label className="apd-etiqueta" htmlFor="pp-kg">Kilos</label><input id="pp-kg" className="apd-campo" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="12.5" /></div>
              <div><label className="apd-etiqueta" htmlFor="pp-f">Fecha</label><input id="pp-f" type="date" className="apd-campo" value={f} max={hoy()} onChange={(e) => setF(e.target.value)} /></div>
            </div>
            {error && <p className="apd-aviso apd-aviso-error" role="alert">{error}</p>}
            <div className="apd-fila"><button type="submit" className="apd-boton-sec" aria-busy={envio.cargando} disabled={envio.cargando}>Anotar peso</button><button type="button" className="apd-boton-suave" onClick={() => setAbierto(false)}>Cancelar</button></div>
          </form>
        ) : (
          <button type="button" className="apd-boton-suave" style={{ marginTop: "0.9rem" }} onClick={() => setAbierto(true)} data-anotar-peso>Anotar peso</button>
        )}
        {lista.length > 1 && (
          <details style={{ marginTop: "0.75rem" }}>
            <summary className="apd-nota" style={{ cursor: "pointer" }}>Ver los {lista.length} registros</summary>
            <ul className="apd-nota" style={{ marginTop: "0.5rem", display: "grid", gap: "0.25rem" }}>
              {lista.map((p) => (
                <li key={p.id} className="apd-fila" style={{ justifyContent: "space-between" }}>
                  <span>{fecha(p.fecha)} · {p.pesoKg} kg{p.notas ? ` · ${p.notas}` : ""}</span>
                  <button type="button" className="apd-enlace" style={{ background: "none", border: 0, cursor: "pointer", fontSize: "0.8rem" }} onClick={async () => { await esperarConTope(() => quitarPeso(mascotaId, p.id)); router.refresh(); }}>Quitar</button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

function SeccionMedicamentos({ mascotaId, lista }: { mascotaId: string; lista: Medicamento[] }) {
  const router = useRouter();
  const envio = useEspera();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [dosis, setDosis] = useState("");
  const [horas, setHoras] = useState<string[]>(["08:00"]);
  const [inicio, setInicio] = useState(hoy());
  const [fin, setFin] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <section data-seccion-medicamentos>
      <h2 className="apd-seccion-titulo">Medicación</h2>
      <div className="apd-lista">
        {lista.length === 0 && !abierto && <div className="apd-tarjeta"><p className="apd-nota">Sin medicamentos activos. Si le toca uno, anótalo y te recordamos cada toma.</p></div>}
        {lista.map((m) => (
          <div key={m.id} className="apd-tarjeta" data-medicamento>
            <p style={{ fontWeight: 800 }}>{m.nombre}{m.dosis ? <span className="apd-nota"> · {m.dosis}</span> : null}</p>
            <p className="apd-nota">A las {m.horas.join(", ")} · desde el {fecha(m.fechaInicio)}{m.fechaFin ? ` hasta el ${fecha(m.fechaFin)}` : ""}</p>
            <button type="button" className="apd-enlace" style={{ background: "none", border: 0, padding: "0.4rem 0 0", cursor: "pointer", fontSize: "0.875rem" }} onClick={async () => { await esperarConTope(() => terminarMedicamento(mascotaId, m.id)); router.refresh(); }}>Ya terminó</button>
          </div>
        ))}
        {abierto ? (
          <form className="apd-tarjeta apd-lista" onSubmit={async (e) => { e.preventDefault(); setError(null); const r = await envio.ejecutar(() => agregarMedicamento(mascotaId, { nombre, dosis: dosis || null, horas, fecha_inicio: inicio, fecha_fin: fin || null })); if (r.error) return setError(r.error); setNombre(""); setDosis(""); setAbierto(false); router.refresh(); }}>
            <div><label className="apd-etiqueta" htmlFor="md-n">Medicamento</label><input id="md-n" className="apd-campo" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} placeholder="Amoxicilina" /></div>
            <div><label className="apd-etiqueta" htmlFor="md-d">Dosis (si quieres)</label><input id="md-d" className="apd-campo" value={dosis} onChange={(e) => setDosis(e.target.value)} maxLength={80} placeholder="1 tableta, 2 ml…" /></div>
            <div>
              <p className="apd-etiqueta">Horas del día</p>
              <div className="apd-fila" style={{ flexWrap: "wrap" }}>
                {horas.map((h, i) => (
                  <input key={i} type="time" className="apd-campo" style={{ width: "8.5rem" }} value={h} onChange={(e) => setHoras((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))} />
                ))}
                {horas.length < 4 && <button type="button" className="apd-boton-suave" onClick={() => setHoras((xs) => [...xs, "20:00"])}>+ otra hora</button>}
                {horas.length > 1 && <button type="button" className="apd-boton-suave" onClick={() => setHoras((xs) => xs.slice(0, -1))}>− quitar</button>}
              </div>
            </div>
            <div className="apd-datos">
              <div><label className="apd-etiqueta" htmlFor="md-i">Desde</label><input id="md-i" type="date" className="apd-campo" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
              <div><label className="apd-etiqueta" htmlFor="md-f">Hasta (si sabes)</label><input id="md-f" type="date" className="apd-campo" value={fin} onChange={(e) => setFin(e.target.value)} /></div>
            </div>
            {error && <p className="apd-aviso apd-aviso-error" role="alert">{error}</p>}
            <div className="apd-fila"><button type="submit" className="apd-boton-sec" aria-busy={envio.cargando} disabled={envio.cargando} data-guardar-medicamento>Anotar y recordarme</button><button type="button" className="apd-boton-suave" onClick={() => setAbierto(false)}>Cancelar</button></div>
          </form>
        ) : (
          <button type="button" className="apd-boton-suave" onClick={() => setAbierto(true)} data-anotar-medicamento>Anotar un medicamento</button>
        )}
      </div>
    </section>
  );
}

function SeccionGastos({ mascotaId, lista, totalMes, mesNombre }: { mascotaId: string; lista: Gasto[]; totalMes: number; mesNombre: string }) {
  const router = useRouter();
  const envio = useEspera();
  const [abierto, setAbierto] = useState(false);
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [categoria, setCategoria] = useState("alimento");
  const [f, setF] = useState(hoy());
  const [error, setError] = useState<string | null>(null);
  return (
    <section data-seccion-gastos>
      <h2 className="apd-seccion-titulo">Gastos de {mesNombre}</h2>
      <div className="apd-tarjeta">
        <p><span style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.02em" }} data-total-mes>{pesos(totalMes)}</span> <span className="apd-nota">este mes{lista.length ? ` · ${lista.length} ${lista.length === 1 ? "gasto" : "gastos"}` : ""}</span></p>
        {lista.length > 0 && (
          <ul className="apd-nota" style={{ marginTop: "0.6rem", display: "grid", gap: "0.3rem" }}>
            {lista.map((g) => (
              <li key={g.id} className="apd-fila" style={{ justifyContent: "space-between" }}>
                <span>{fecha(g.fecha)} · {g.concepto} <span style={{ opacity: 0.7 }}>({CATEGORIAS.find((c) => c[0] === g.categoria)?.[1] ?? "Otro"})</span></span>
                <span className="apd-fila" style={{ gap: "0.5rem" }}><strong>{pesos(g.monto)}</strong><button type="button" className="apd-enlace" style={{ background: "none", border: 0, cursor: "pointer", fontSize: "0.8rem" }} onClick={async () => { await esperarConTope(() => quitarGasto(mascotaId, g.id)); router.refresh(); }}>Quitar</button></span>
              </li>
            ))}
          </ul>
        )}
        {abierto ? (
          <form className="apd-lista" style={{ marginTop: "0.9rem" }} onSubmit={async (e) => { e.preventDefault(); setError(null); const r = await envio.ejecutar(() => agregarGasto(mascotaId, { concepto, monto, categoria, fecha: f })); if (r.error) return setError(r.error); setConcepto(""); setMonto(""); setAbierto(false); router.refresh(); }}>
            <div><label className="apd-etiqueta" htmlFor="gs-c">En qué</label><input id="gs-c" className="apd-campo" value={concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={80} placeholder="Croquetas, consulta, baño…" /></div>
            <div className="apd-datos">
              <div><label className="apd-etiqueta" htmlFor="gs-m">Cuánto</label><input id="gs-m" className="apd-campo" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="350" /></div>
              <div><label className="apd-etiqueta" htmlFor="gs-f">Fecha</label><input id="gs-f" type="date" className="apd-campo" value={f} max={hoy()} onChange={(e) => setF(e.target.value)} /></div>
            </div>
            <div className="apd-tabs">{CATEGORIAS.map(([k, n]) => <button key={k} type="button" className="apd-tab" aria-pressed={categoria === k} onClick={() => setCategoria(k)}>{n}</button>)}</div>
            {error && <p className="apd-aviso apd-aviso-error" role="alert">{error}</p>}
            <div className="apd-fila"><button type="submit" className="apd-boton-sec" aria-busy={envio.cargando} disabled={envio.cargando} data-guardar-gasto>Anotar gasto</button><button type="button" className="apd-boton-suave" onClick={() => setAbierto(false)}>Cancelar</button></div>
          </form>
        ) : (
          <button type="button" className="apd-boton-suave" style={{ marginTop: "0.9rem" }} onClick={() => setAbierto(true)} data-anotar-gasto>Anotar un gasto</button>
        )}
      </div>
    </section>
  );
}
