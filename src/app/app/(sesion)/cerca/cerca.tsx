"use client";

import { useEffect, useState, useTransition } from "react";
import { useEspera } from "@/hooks/use-espera";
import { distanciaTexto, type Giro, type LugarCerca } from "@/lib/app/cerca";
import { IconoFlechaArriba, IconoPin } from "@/components/app/iconos";
import { buscarCerca, guardarZona } from "./acciones";

const GIROS: { clave: Giro; nombre: string }[] = [
  { clave: "veterinaria", nombre: "Veterinarias" },
  { clave: "estetica", nombre: "Estéticas" },
  { clave: "guarderia", nombre: "Guarderías" },
  { clave: "hotel", nombre: "Hoteles" },
];

export function Cerca({ zonaGuardada }: { zonaGuardada: { lat: number; lng: number } | null }) {
  const envio = useEspera();
  const [punto, setPunto] = useState<{ lat: number; lng: number } | null>(zonaGuardada);
  const [giro, setGiro] = useState<Giro>("veterinaria");
  const [lugares, setLugares] = useState<LugarCerca[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buscando, empezar] = useTransition();

  const ubicar = async () => {
    setError(null);
    if (!("geolocation" in navigator)) return setError("Este navegador no puede dar tu ubicación.");
    const r = await envio.correr(
      () =>
        new Promise<{ lat: number; lng: number }>((resolver, rechazar) => {
          navigator.geolocation.getCurrentPosition(
            (p) => resolver({ lat: p.coords.latitude, lng: p.coords.longitude }),
            (e) => rechazar(new Error(e.code === e.PERMISSION_DENIED ? "Sin tu permiso no podemos saber qué hay cerca. Puedes darlo cuando quieras." : "No pudimos leer tu ubicación. Intenta de nuevo.")),
            { enableHighAccuracy: false, timeout: 12_000, maximumAge: 300_000 }
          );
        })
    );
    if (!r.ok) return setError(r.error);
    setPunto(r.valor);
    void guardarZona(r.valor.lat, r.valor.lng);
  };

  useEffect(() => {
    if (!punto) return;
    let vivo = true;
    empezar(async () => {
      try {
        const r = await buscarCerca(punto.lat, punto.lng, giro);
        if (!vivo) return;
        if (r.error) setError(r.error);
        else setLugares(r.lugares ?? []);
      } catch {
        if (vivo) setError("No pudimos buscar en este momento. Intenta de nuevo.");
      }
    });
    return () => {
      vivo = false;
    };
  }, [punto, giro]);

  return (
    <div className="apd-lista">
      {!punto ? (
        <div className="apd-vacio apd-aparece" style={{ ["--i" as string]: 1 }} data-cerca-sin-ubicacion>
          <IconoPin />
          <p style={{ fontWeight: 800, fontSize: "1.125rem" }}>¿Qué hay cerca de ti?</p>
          <p className="apd-nota" style={{ marginTop: "0.5rem" }}>Veterinarias, estéticas, guarderías y hoteles a unos minutos, con su calificación. Solo usamos tu zona para esto y para avisarte si se pierde una mascota cerca.</p>
          <button type="button" className="apd-boton" style={{ marginTop: "1rem" }} aria-busy={envio.cargando} disabled={envio.cargando} onClick={ubicar} data-usar-ubicacion>
            Usar mi ubicación
          </button>
          {error && <p className="apd-aviso apd-aviso-error" role="alert" style={{ marginTop: "0.75rem", textAlign: "left" }}>{error}</p>}
        </div>
      ) : (
        <>
          <div className="apd-tabs apd-aparece" style={{ ["--i" as string]: 1 }} role="group" aria-label="Qué buscar">
            {GIROS.map((g) => (
              <button key={g.clave} type="button" className="apd-tab" aria-pressed={giro === g.clave} onClick={() => setGiro(g.clave)}>{g.nombre}</button>
            ))}
          </div>
          <div className="apd-fila" style={{ justifyContent: "space-between" }}>
            <p className="apd-nota" aria-live="polite">{buscando ? "Buscando…" : lugares ? (lugares.length ? `${lugares.length} lugares a menos de 6 km` : "No encontramos de eso cerca de ti todavía") : ""}</p>
            <button type="button" className="apd-enlace" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={ubicar}>Actualizar ubicación</button>
          </div>
          {error && <p className="apd-aviso apd-aviso-error" role="alert">{error}</p>}
          <ul className="apd-lista" data-lista-cerca style={{ opacity: buscando ? 0.6 : 1, transition: "opacity .4s var(--apd-curva)" }}>
            {(lugares ?? []).map((l, i) => (
              <li key={l.id} className="apd-aparece" style={{ ["--i" as string]: Math.min(i, 8) }}>
                <a href={l.fichaUrl} target="_blank" rel="noopener" className="apd-tarjeta apd-fila" data-lugar>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 800 }}>{l.nombre}</span>
                      {l.enPeluDesk && <span className="apd-chip">Con PeluDesk</span>}
                    </span>
                    <span className="apd-nota" style={{ display: "block", marginTop: "0.2rem" }}>
                      {distanciaTexto(l.distanciaM)}
                      {l.calificacion ? ` · ${Number(l.calificacion).toFixed(1)} ★${l.resenas ? ` (${l.resenas})` : ""}` : ""}
                      {l.direccion ? ` · ${l.direccion}` : ""}
                    </span>
                  </span>
                  <IconoFlechaArriba style={{ width: 20, height: 20, color: "var(--apd-morado)", flex: "none" }} />
                </a>
              </li>
            ))}
          </ul>
          <p className="apd-nota">Las calificaciones y reseñas son las de Google Maps. Pronto: quién está abierto ahora, el cupo de los hoteles y reservar desde aquí.</p>
        </>
      )}
    </div>
  );
}
