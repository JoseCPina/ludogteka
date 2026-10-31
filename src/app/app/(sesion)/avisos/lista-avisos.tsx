"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { marcarLeido, marcarTodosLeidos } from "./acciones";

type Fila = { id: string; tipo: string; titulo: string; cuerpo: string; url: string | null; leidoAt: string | null; cuando: string };

export function ListaAvisos({ avisos }: { avisos: Fila[] }) {
  const router = useRouter();
  const envio = useEspera();
  const sinLeer = avisos.filter((a) => !a.leidoAt).length;
  if (avisos.length === 0) {
    return (
      <div className="apd-vacio" data-sin-avisos>
        <p style={{ fontWeight: 800, fontSize: "1.125rem" }}>Nada pendiente por ahora</p>
        <p className="apd-nota" style={{ marginTop: "0.5rem" }}>Cuando haya algo que debas saber de tus mascotas, aparece aquí.</p>
      </div>
    );
  }
  return (
    <>
      <div className="apd-fila" style={{ justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <h2 className="apd-seccion-titulo" style={{ margin: 0 }}>{sinLeer > 0 ? `${sinLeer} sin leer` : "Todos leídos"}</h2>
        {sinLeer > 0 && (
          <button type="button" className="apd-boton-suave" aria-busy={envio.cargando} disabled={envio.cargando} onClick={async () => { const r = await envio.ejecutar(() => marcarTodosLeidos()); if (!r.error) router.refresh(); }}>
            Marcar todos como leídos
          </button>
        )}
      </div>
      <ul className="apd-lista" data-lista-avisos>
        {avisos.map((a) => {
          const contenido = (
            <>
              <span style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "baseline" }}>
                <span style={{ fontWeight: 800 }}>{a.titulo}</span>
                {!a.leidoAt && <span className="apd-chip" style={{ flex: "none" }}>Nuevo</span>}
              </span>
              <span className="apd-nota" style={{ display: "block", marginTop: "0.25rem", color: "var(--apd-tinta-2)" }}>{a.cuerpo}</span>
              <span className="apd-nota" style={{ display: "block", marginTop: "0.4rem", fontSize: "0.75rem" }}>{a.cuando}</span>
            </>
          );
          const alTocar = () => {
            if (!a.leidoAt) void marcarLeido(a.id).then(() => router.refresh());
          };
          return (
            <li key={a.id} data-aviso={a.tipo} data-leido={a.leidoAt ? "1" : "0"}>
              {a.url && a.url.startsWith("/") && a.url !== "/avisos" ? (
                <Link href={a.url} className="apd-tarjeta" onClick={alTocar}>{contenido}</Link>
              ) : (
                <button type="button" className="apd-tarjeta" style={{ width: "100%", textAlign: "left", cursor: a.leidoAt ? "default" : "pointer" }} onClick={alTocar}>{contenido}</button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
