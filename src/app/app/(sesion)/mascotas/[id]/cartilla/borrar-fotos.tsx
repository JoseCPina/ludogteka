"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { borrarFotosRevisadas } from "./acciones";

/**
 * Las fotos de la cartilla se guardan para revisar lo que leyó la IA. Ya revisadas, el dueño puede borrarlas: se borra
 * el archivo y lo que quedó en su cartilla no cambia.
 */
export function BorrarFotos({ mascotaId, cuantas }: { mascotaId: string; cuantas: number }) {
  const envio = useEspera();
  const [seguro, setSeguro] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<number | null>(null);

  if (listo !== null) {
    return (
      <p className="apd-aviso apd-aviso-ok" role="status" data-fotos-borradas>
        {listo === 0 ? "No había fotos por borrar." : `Listo: borramos ${listo === 1 ? "1 foto" : `${listo} fotos`} de su cartilla. Lo que ya estaba en su cartilla sigue igual.`}
      </p>
    );
  }
  if (cuantas === 0) return null;

  const fotos = cuantas === 1 ? "la foto" : `las ${cuantas} fotos`;
  return (
    <div className="apd-tarjeta" data-borrar-fotos>
      <p style={{ fontWeight: 800 }}>Fotos de la cartilla</p>
      <p className="apd-nota" style={{ marginTop: "0.3rem" }}>
        Guardamos {fotos} que ya revisaste por si hay que volver a leerlas. Si prefieres, bórralas: lo que ya está en su cartilla no cambia.
      </p>
      {error && <p className="apd-aviso apd-aviso-error" role="alert" style={{ marginTop: "0.75rem" }}>{error}</p>}
      <div className="apd-fila" style={{ marginTop: "0.9rem", flexWrap: "wrap" }}>
        {!seguro ? (
          <button type="button" className="apd-boton-suave" onClick={() => setSeguro(true)} data-borrar-fotos-abrir>
            Borrar {fotos}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="apd-boton-sec"
              aria-busy={envio.cargando}
              disabled={envio.cargando}
              data-borrar-fotos-confirmar
              onClick={async () => {
                setError(null);
                const r = await envio.ejecutar(() => borrarFotosRevisadas(mascotaId));
                if (r.error) return setError(r.error);
                setListo(r.borradas ?? 0);
              }}
            >
              {envio.cargando ? "Borrando…" : `Sí, borrar ${fotos}`}
            </button>
            <button type="button" className="apd-boton-suave" disabled={envio.cargando} onClick={() => setSeguro(false)}>
              No, dejarlas
            </button>
          </>
        )}
      </div>
    </div>
  );
}
