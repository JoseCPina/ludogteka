"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { CampoCopiable } from "@/components/ui/campo-copiable";

/** El QR de la placa: apunta al perfil público de la mascota. Se dibuja aquí mismo y se baja como PNG. */
export function QrPlaca({ url, nombre }: { url: string; nombre: string }) {
  const [png, setPng] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 640, errorCorrectionLevel: "H", color: { dark: "#2b2a33", light: "#ffffff" } }).then(setPng).catch(() => setPng(null));
  }, [url]);
  return (
    <div className="apd-lista">
      <div className="apd-bandeja">
        <div className="apd-tarjeta" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
          {png ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={png} alt={`QR de ${nombre}`} style={{ width: "min(100%, 18rem)", borderRadius: "1rem" }} data-qr />
          ) : (
            <div style={{ width: "18rem", height: "18rem", borderRadius: "1rem", background: "#f3f0ea" }} aria-hidden />
          )}
          <p className="apd-nota" style={{ textAlign: "center" }}>Quien lo escanee ve a {nombre} y te puede escribir sin ver tu teléfono.</p>
        </div>
      </div>
      <CampoCopiable valor={url} etiqueta="El link del perfil (por si prefieres grabarlo en la placa)" textoBoton="Copiar" />
      <div className="apd-fila" style={{ flexWrap: "wrap" }}>
        {png && <a href={png} download={`qr-${nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`} className="apd-boton" data-bajar-qr>Bajar el QR en PNG</a>}
        <a href={url} target="_blank" rel="noopener" className="apd-boton-sec">Ver cómo se ve</a>
      </div>
      <div className="apd-tarjeta" style={{ background: "var(--apd-menta-suave)", boxShadow: "none" }}>
        <p style={{ fontWeight: 800 }}>Cómo ponerlo en la placa</p>
        <p className="apd-nota" style={{ marginTop: "0.35rem", color: "var(--apd-tinta-2)" }}>
          Baja el PNG y pídele a cualquier taller de placas o grabado que lo imprima o grabe (de 2 cm por lado se lee bien). Si prefieres, graban el link de arriba. Si cambias de celular o de número, el QR sigue sirviendo: es de {nombre}, no del teléfono.
        </p>
      </div>
    </div>
  );
}
