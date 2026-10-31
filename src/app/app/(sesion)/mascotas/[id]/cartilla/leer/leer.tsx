"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { conTope, mensajeDeFallo } from "@/lib/ui/espera";
import { comprimirImagen } from "@/lib/imagen";
import { IconoCamara, IconoFlecha } from "@/components/app/iconos";
import type { LecturaCartilla, RegistroLeido } from "@/lib/app/cartilla-ia";
import { confirmarLectura } from "../acciones";

/**
 * Leer la cartilla con una foto: tomar o escoger la foto → la IA la pasa a limpio (unos segundos) → el dueño revisa
 * fila por fila (puede corregir fechas y nombres, quitar las que no son) → confirma → queda en su cartilla con sus
 * recordatorios. Sin cartilla a la mano: capturar a mano.
 */
type Paso = "foto" | "leyendo" | "revisar";
const TOPE_LECTURA_MS = 70_000;

export function LeerCartilla({ mascotaId, nombre, nueva }: { mascotaId: string; nombre: string; nueva: boolean }) {
  const router = useRouter();
  const envio = useEspera();
  const [paso, setPaso] = useState<Paso>("foto");
  const [vista, setVista] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lectura, setLectura] = useState<LecturaCartilla | null>(null);
  const [fotoId, setFotoId] = useState<string | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [filas, setFilas] = useState<(RegistroLeido & { quitar?: boolean })[]>([]);
  const [peso, setPeso] = useState<string>("");
  const foto = useRef<Blob | null>(null);

  const leer = async () => {
    if (!foto.current) return setError("Primero toma o escoge la foto.");
    setError(null);
    setPaso("leyendo");
    try {
      const fd = new FormData();
      fd.set("foto", new File([foto.current], "cartilla.jpg", { type: foto.current.type || "image/jpeg" }));
      const r = await conTope(fetch(`/mascotas/${mascotaId}/cartilla/leer/foto`, { method: "POST", body: fd, signal: AbortSignal.timeout(TOPE_LECTURA_MS) }), TOPE_LECTURA_MS);
      const j = (await r.json().catch(() => ({}))) as { error?: string | null; fotoId?: string | null; lectura?: LecturaCartilla; ms?: number };
      if (!r.ok || j.error || !j.lectura) throw new Error(j.error || "No pudimos leer la foto.");
      setLectura(j.lectura);
      setFotoId(j.fotoId ?? null);
      setMs(j.ms ?? null);
      setFilas(j.lectura.registros.map((x) => ({ ...x })));
      setPeso(j.lectura.peso_kg ? String(j.lectura.peso_kg) : "");
      setPaso("revisar");
    } catch (e) {
      setError(mensajeDeFallo(e));
      setPaso("foto");
    }
  };

  const confirmar = async () => {
    setError(null);
    const buenas = filas.filter((f) => !f.quitar && f.nombre.trim());
    if (!buenas.length) return setError("Deja al menos un registro, o captura a mano.");
    const r = await envio.ejecutar(() => confirmarLectura(mascotaId, fotoId, buenas.map((x) => { const { quitar, ...r } = x; void quitar; return r; }), peso ? Number(peso.replace(",", ".")) : null));
    if (r.error) return setError(r.error);
    router.replace(`/mascotas/${mascotaId}/cartilla?guardado=${buenas.length}`);
  };

  if (paso === "revisar" && lectura) {
    return (
      <div className="apd-lista" data-paso-revisar>
        <div className="apd-tarjeta apd-aparece">
          <span className="apd-ceja">Revisa antes de guardar</span>
          <p style={{ fontWeight: 800, fontSize: "1.125rem", marginTop: "0.5rem" }}>
            {lectura.registros.length === 0 ? "No alcanzamos a leer registros" : lectura.registros.length === 1 ? "Leímos 1 registro" : `Leímos ${lectura.registros.length} registros`}
            {ms ? <span className="apd-nota" style={{ fontWeight: 400 }}> · en {(ms / 1000).toFixed(1)} s</span> : null}
          </p>
          {!lectura.es_cartilla && <p className="apd-aviso apd-aviso-ambar" style={{ marginTop: "0.6rem" }}>La foto no parece una cartilla. Si sí lo es, intenta con más luz y la hoja completa.</p>}
          {lectura.observaciones && <p className="apd-aviso apd-aviso-ambar" style={{ marginTop: "0.6rem" }}>{lectura.observaciones}</p>}
          <p className="apd-nota" style={{ marginTop: "0.6rem" }}>Corrige lo que haga falta y quita lo que no sea. Las fechas van día/mes/año en la cartilla; aquí las ves ya ordenadas.</p>
        </div>
        {filas.map((f, i) => (
          <div key={i} className={`apd-tarjeta apd-aparece${f.quitar ? " opacity-50" : ""}`} style={{ ["--i" as string]: i + 1 }} data-fila-lectura data-confianza={f.confianza}>
            <div className="apd-fila" style={{ justifyContent: "space-between" }}>
              <span className="apd-chip" style={f.confianza < 0.7 ? { background: "var(--apd-ambar-suave)", color: "var(--apd-ambar-oscuro)" } : undefined}>
                {f.tipo === "vacuna" ? "Vacuna" : "Desparasitación"}{f.confianza < 0.7 ? " · revisa" : ""}
              </span>
              <button type="button" className="apd-enlace" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => setFilas((xs) => xs.map((x, j) => (j === i ? { ...x, quitar: !x.quitar } : x)))}>
                {f.quitar ? "Volver a poner" : "Quitar"}
              </button>
            </div>
            <label className="apd-etiqueta" style={{ marginTop: "0.6rem" }}>Qué es</label>
            <input className="apd-campo" value={f.nombre} onChange={(e) => setFilas((xs) => xs.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} maxLength={80} />
            <div className="apd-datos" style={{ marginTop: "0.6rem" }}>
              <div>
                <label className="apd-etiqueta">Se aplicó</label>
                <input type="date" className="apd-campo" value={f.fecha_aplicacion ?? ""} onChange={(e) => setFilas((xs) => xs.map((x, j) => (j === i ? { ...x, fecha_aplicacion: e.target.value || null } : x)))} />
              </div>
              <div>
                <label className="apd-etiqueta">Próxima dosis</label>
                <input type="date" className="apd-campo" value={f.proxima_dosis ?? ""} onChange={(e) => setFilas((xs) => xs.map((x, j) => (j === i ? { ...x, proxima_dosis: e.target.value || null } : x)))} />
              </div>
              <div>
                <label className="apd-etiqueta">Lote</label>
                <input className="apd-campo" value={f.lote ?? ""} onChange={(e) => setFilas((xs) => xs.map((x, j) => (j === i ? { ...x, lote: e.target.value || null } : x)))} maxLength={40} />
              </div>
            </div>
          </div>
        ))}
        <div className="apd-tarjeta apd-aparece" style={{ ["--i" as string]: filas.length + 1 }}>
          <label className="apd-etiqueta" htmlFor="lc-peso">Peso anotado (kg, si venía)</label>
          <input id="lc-peso" className="apd-campo" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="Ej. 12.5" />
        </div>
        {error && <p className="apd-aviso apd-aviso-error" role="alert">{error}</p>}
        <div className="apd-fila" style={{ flexWrap: "wrap" }}>
          <button type="button" className="apd-boton" aria-busy={envio.cargando} disabled={envio.cargando} onClick={confirmar} data-confirmar-lectura>
            Guardar en su cartilla
            <span className="apd-boton-flecha"><IconoFlecha style={{ width: 16, height: 16 }} /></span>
          </button>
          <button type="button" className="apd-boton-suave" onClick={() => { setPaso("foto"); setLectura(null); }}>Tomar otra foto</button>
        </div>
      </div>
    );
  }

  return (
    <div className="apd-lista" data-paso-foto>
      <div className="apd-tarjeta apd-aparece" style={{ ["--i" as string]: 1 }}>
        {vista ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vista} alt="La foto de la cartilla" style={{ width: "100%", borderRadius: "1.1rem", maxHeight: 360, objectFit: "contain", background: "#f3f0ea" }} />
        ) : (
          <div className="apd-vacio" style={{ boxShadow: "none", background: "#f8f4ec" }}>
            <IconoCamara />
            <p style={{ fontWeight: 800 }}>Tómale foto a la cartilla de {nombre}</p>
            <p className="apd-nota" style={{ marginTop: "0.4rem" }}>La hoja completa, con buena luz y sin sombras. Si son varias hojas, una por una.</p>
          </div>
        )}
        <div className="apd-fila" style={{ marginTop: "0.9rem", flexWrap: "wrap" }}>
          <label className="apd-boton-sec" style={{ cursor: "pointer" }}>
            {vista ? "Otra foto" : "Tomar o escoger foto"}
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              data-foto-cartilla
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setError(null);
                try {
                  const b = await comprimirImagen(f, 1800);
                  foto.current = b;
                  setVista(URL.createObjectURL(b));
                } catch {
                  foto.current = f;
                  setVista(URL.createObjectURL(f));
                }
              }}
            />
          </label>
          {vista && (
            <button type="button" className="apd-boton" aria-busy={paso === "leyendo"} disabled={paso === "leyendo"} onClick={leer} data-leer-cartilla>
              {paso === "leyendo" ? "Leyendo la cartilla…" : "Pasarla a limpio"}
              <span className="apd-boton-flecha"><IconoFlecha style={{ width: 16, height: 16 }} /></span>
            </button>
          )}
        </div>
        {paso === "leyendo" && <p className="apd-nota" style={{ marginTop: "0.6rem" }} aria-live="polite">Toma unos segundos. Leemos cada fila y cada etiqueta; tú revisas antes de guardar.</p>}
        {error && <p className="apd-aviso apd-aviso-error" role="alert" style={{ marginTop: "0.75rem" }}>{error}</p>}
      </div>
      <p className="apd-nota apd-aparece" style={{ ["--i" as string]: 2 }}>
        ¿No tienes la cartilla a la mano? <Link href={`/mascotas/${mascotaId}/cartilla?capturar=1`} className="apd-enlace">Anota las fechas que recuerdes</Link>
        {nueva ? <> o <Link href={`/mascotas/${mascotaId}`} className="apd-enlace">déjalo para después</Link>.</> : "."}
      </p>
    </div>
  );
}
