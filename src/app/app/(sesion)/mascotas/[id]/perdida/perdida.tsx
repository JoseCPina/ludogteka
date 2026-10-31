"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { IconoFlecha, IconoWhatsApp } from "@/components/app/iconos";
import { marcarEncontrada, marcarPerdida, responder } from "./acciones";

export type Mensaje = { id: string; de: "hallador" | "dueno"; texto: string; halladorNombre: string | null; entregadoAt: string | null; cuando: string };

export function Perdida({ mascotaId, nombre, perdida, perdidaNota, urlPublica, urlCartel, mensajes, zonaGuardada }: { mascotaId: string; nombre: string; perdida: boolean; perdidaNota: string | null; urlPublica: string; urlCartel: string; mensajes: Mensaje[]; zonaGuardada: boolean }) {
  const router = useRouter();
  const envio = useEspera();
  const respuesta = useEspera();
  const [punto, setPunto] = useState<{ lat: number; lng: number } | null>(null);
  const [nota, setNota] = useState(perdidaNota ?? "");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const compartir = `Se perdió ${nombre}${perdidaNota ? ` cerca de ${perdidaNota}` : ""}. Si la ves, escríbele a su familia desde aquí: ${urlPublica}`;

  const ubicar = async () => {
    setError(null);
    const r = await envio.correr(() => new Promise<{ lat: number; lng: number }>((ok, mal) => navigator.geolocation.getCurrentPosition((p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }), () => mal(new Error("No pudimos leer tu ubicación. Da el permiso o escribe la zona.")), { timeout: 12_000, maximumAge: 120_000 })));
    if (!r.ok) return setError(r.error);
    setPunto(r.valor);
  };

  if (!perdida) {
    return (
      <div className="apd-lista">
        <div className="apd-tarjeta apd-aparece" style={{ ["--i" as string]: 1 }}>
          <p style={{ fontWeight: 800, fontSize: "1.125rem" }}>Si {nombre} se perdió, avísanos aquí</p>
          <p className="apd-nota" style={{ marginTop: "0.4rem" }}>Les avisamos a los dueños de la app que estén a 5 km y a las veterinarias y estéticas con PeluDesk de la zona, y te damos un cartel para compartir. Su perfil con QR ya funciona.</p>
          <div className="apd-fila" style={{ marginTop: "0.9rem", flexWrap: "wrap" }}>
            <button type="button" className="apd-boton-sec" aria-busy={envio.cargando} disabled={envio.cargando} onClick={ubicar} data-ubicar-perdida>{punto ? "Ubicación lista ✓" : zonaGuardada ? "Usar mi ubicación (o la zona que ya guardaste)" : "Usar mi ubicación"}</button>
          </div>
          <label className="apd-etiqueta" htmlFor="pd-nota" style={{ marginTop: "0.9rem" }}>Dónde se perdió, con tus palabras</label>
          <input id="pd-nota" className="apd-campo" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} placeholder="Parque de la colonia Lomas, cerca del Oxxo" />
          {error && <p className="apd-aviso apd-aviso-error" role="alert" style={{ marginTop: "0.75rem" }}>{error}</p>}
          <button
            type="button"
            className="apd-boton apd-boton-ancho"
            style={{ marginTop: "1rem", background: "var(--apd-coral-oscuro)" }}
            aria-busy={envio.cargando}
            disabled={envio.cargando}
            data-marcar-perdida
            onClick={async () => {
              setError(null);
              const r = await envio.ejecutar(() => marcarPerdida(mascotaId, { lat: punto?.lat ?? null, lng: punto?.lng ?? null, nota }));
              if (r.error) return setError(r.error);
              const a = r.alerta;
              setAviso(a ? `Avisamos a ${a.duenosAvisados} ${a.duenosAvisados === 1 ? "dueño" : "dueños"} de la app cerca y a ${a.negociosAvisados} de ${a.negociosCerca} negocios PeluDesk de la zona${a.negociosCerca && !a.plantillaAprobada ? " (el aviso a negocios por WhatsApp está pendiente de aprobación de Meta)" : ""}.` : null);
              router.refresh();
            }}
          >
            Avisar que se perdió
            <span className="apd-boton-flecha"><IconoFlecha style={{ width: 16, height: 16 }} /></span>
          </button>
        </div>
        {aviso && <p className="apd-aviso apd-aviso-ok" role="status">{aviso}</p>}
      </div>
    );
  }

  return (
    <div className="apd-lista">
      <div className="apd-tarjeta apd-aparece" style={{ ["--i" as string]: 1, background: "var(--apd-coral-suave)", boxShadow: "none" }} data-perdida-activa>
        <p style={{ fontWeight: 800, fontSize: "1.125rem", color: "var(--apd-coral-oscuro)" }}>{nombre} está marcada como perdida</p>
        {perdidaNota && <p className="apd-nota" style={{ marginTop: "0.3rem", color: "var(--apd-tinta-2)" }}>Zona: {perdidaNota}</p>}
        {aviso && <p className="apd-nota" style={{ marginTop: "0.3rem", color: "var(--apd-tinta-2)" }}>{aviso}</p>}
        <div className="apd-fila" style={{ marginTop: "0.9rem", flexWrap: "wrap" }}>
          <a href={`https://wa.me/?text=${encodeURIComponent(compartir)}`} target="_blank" rel="noopener noreferrer" className="apd-boton" data-compartir-whatsapp><IconoWhatsApp style={{ width: 20, height: 20 }} /> Compartir por WhatsApp</a>
          <a href={urlCartel} target="_blank" rel="noopener" className="apd-boton-sec" data-cartel>Ver el cartel</a>
          <button type="button" className="apd-boton-suave" aria-busy={envio.cargando} disabled={envio.cargando} data-marcar-encontrada onClick={async () => { const r = await envio.ejecutar(() => marcarEncontrada(mascotaId)); if (r.error) return setError(r.error); router.refresh(); }}>
            ¡Ya apareció!
          </button>
        </div>
        {error && <p className="apd-aviso apd-aviso-error" role="alert" style={{ marginTop: "0.75rem" }}>{error}</p>}
      </div>
      <CampoCopiable valor={urlPublica} etiqueta="Su perfil público (el del QR)" textoBoton="Copiar" />
      <section className="apd-aparece" style={{ ["--i" as string]: 2 }}>
        <h2 className="apd-seccion-titulo">Mensajes de quien la vea</h2>
        {mensajes.length === 0 ? (
          <p className="apd-nota">Todavía nadie ha escrito. Cuando alguien escanee el QR o abra el cartel y te escriba, lo ves aquí y te llega aviso.</p>
        ) : (
          <ul className="apd-lista" data-hilo>
            {mensajes.map((x) => (
              <li key={x.id} className="apd-tarjeta" style={x.de === "dueno" ? { background: "var(--apd-morado-suave)", boxShadow: "none" } : undefined} data-mensaje={x.de}>
                <p className="apd-nota" style={{ fontSize: "0.75rem" }}>{x.de === "dueno" ? "Tú" : x.halladorNombre || "Alguien"} · {x.cuando}{x.de === "dueno" && !x.entregadoAt ? " · sin entregar por WhatsApp" : ""}</p>
                <p style={{ marginTop: "0.2rem" }}>{x.texto}</p>
              </li>
            ))}
          </ul>
        )}
        {mensajes.some((x) => x.de === "hallador") && (
          <form className="apd-tarjeta" style={{ marginTop: "0.75rem" }} onSubmit={async (e) => { e.preventDefault(); setError(null); const r = await respuesta.ejecutar(() => responder(mascotaId, texto)); if (r.error) return setError(r.error); setTexto(""); setAviso(r.entregado ? "Tu respuesta le llegó por WhatsApp." : r.motivo ?? null); router.refresh(); }}>
            <label className="apd-etiqueta" htmlFor="pd-resp">Contestar (no ven tu teléfono)</label>
            <input id="pd-resp" className="apd-campo" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={600} placeholder="¡Gracias! ¿Dónde la viste?" />
            <button type="submit" className="apd-boton-sec" style={{ marginTop: "0.75rem" }} aria-busy={respuesta.cargando} disabled={respuesta.cargando} data-responder>Mandar</button>
          </form>
        )}
      </section>
    </div>
  );
}
