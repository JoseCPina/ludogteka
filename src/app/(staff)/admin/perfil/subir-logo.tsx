"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { LogoNegocio } from "@/components/marca/logo-negocio";
import { avisosDeLogo, TIPOS_LOGO, type AvisoLogo } from "@/lib/logo";
import { subirLogo, type ResultadoPerfil } from "./actions";

type Analisis = { url: string; ancho: number | null; alto: number | null; avisos: AvisoLogo[] };

// Mide el archivo y revisa si trae fondo sólido (esquinas opacas): sobre una
// franja de color se vería como un cuadro blanco.
async function analizar(archivo: File, url: string): Promise<Analisis> {
  const img = new Image();
  img.src = url;
  let ancho: number | null = null;
  let alto: number | null = null;
  const avisos: AvisoLogo[] = [];
  try {
    await img.decode();
    ancho = img.naturalWidth || null;
    alto = img.naturalHeight || null;
  } catch {
    avisos.push({ nivel: "error", texto: "No pudimos leer esa imagen. Prueba con otro archivo PNG, JPG, WebP o SVG." });
  }
  avisos.push(...avisosDeLogo({ tipo: archivo.type, bytes: archivo.size, ancho, alto }));
  if (ancho && alto && archivo.type !== "image/svg+xml") {
    try {
      const lado = Math.min(1, 256 / Math.max(ancho, alto));
      const w = Math.max(1, Math.round(ancho * lado));
      const h = Math.max(1, Math.round(alto * lado));
      const lienzo = document.createElement("canvas");
      lienzo.width = w;
      lienzo.height = h;
      const c = lienzo.getContext("2d", { willReadFrequently: true });
      if (c) {
        c.drawImage(img, 0, 0, w, h);
        const d = c.getImageData(0, 0, w, h).data;
        const opaco = (x: number, y: number) => d[(y * w + x) * 4 + 3] > 250;
        const esquinas = [opaco(0, 0), opaco(w - 1, 0), opaco(0, h - 1), opaco(w - 1, h - 1)];
        if (esquinas.every(Boolean)) {
          avisos.push({ nivel: "aviso", texto: "El logo tiene un fondo sólido (no transparente): sobre la franja de color de tu registro se va a ver como un cuadro. Un PNG o SVG con fondo transparente se ve mejor." });
        }
        // Márgenes: si el dibujo ocupa poco de la imagen, se verá chico.
        let x0 = w, y0 = h, x1 = -1, y1 = -1;
        const fondo = [d[0], d[1], d[2]];
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const distinto = d[i + 3] > 40 && (Math.abs(d[i] - fondo[0]) > 30 || Math.abs(d[i + 1] - fondo[1]) > 30 || Math.abs(d[i + 2] - fondo[2]) > 30 || d[0 + 3] < 250);
            if (distinto) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        if (x1 >= 0) {
          const ocupa = Math.max((x1 - x0 + 1) / w, (y1 - y0 + 1) / h);
          if (ocupa < 0.7) avisos.push({ nivel: "aviso", texto: "El dibujo del logo ocupa poco de la imagen (hay márgenes grandes): se va a ver más chico de lo que podría. Recórtalo cerca del dibujo." });
        }
      }
    } catch {
      // sin el análisis de fondo; las demás revisiones ya corrieron
    }
  }
  return { url, ancho, alto, avisos };
}

export function SubirLogo({ nombre, color, logoUrl, ancho, alto }: { nombre: string; color: string | null; logoUrl: string | null; ancho: number | null; alto: number | null }) {
  const router = useRouter();
  const envio = useEspera();
  const campo = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [nuevo, setNuevo] = useState<Analisis | null>(null);
  const [res, setRes] = useState<ResultadoPerfil | null>(null);

  useEffect(() => () => { if (nuevo) URL.revokeObjectURL(nuevo.url); }, [nuevo]);

  const bloqueado = nuevo?.avisos.some((a) => a.nivel === "error") ?? false;
  const mostrado = nuevo?.url ?? logoUrl;
  const marca = { logo: mostrado, color: color ?? undefined };

  return (
    <div className="flex flex-col gap-4">
      {logoUrl && !nuevo && (
        <p className="text-sm text-n-600">Logo actual{ancho && alto ? `: ${ancho}×${alto} px` : ""}.</p>
      )}
      <input
        ref={campo}
        type="file"
        accept={TIPOS_LOGO.join(",")}
        aria-label="Archivo del logo"
        className="text-sm text-n-700 file:mr-3 file:min-h-10 file:rounded-md file:border file:border-n-400 file:bg-white file:px-4 file:font-semibold file:text-n-900"
        onChange={async (e) => {
          const f = e.target.files?.[0] ?? null;
          setRes(null);
          setArchivo(f);
          if (!f) return setNuevo(null);
          setNuevo(await analizar(f, URL.createObjectURL(f)));
        }}
      />
      <p className="text-sm text-n-600">PNG, JPG, WebP o SVG, de hasta 2 MB. Lo mejor: PNG o SVG con fondo transparente, recortado cerca del dibujo.</p>

      {nuevo && nuevo.avisos.map((a, i) => (
        <Alert key={i} variante={a.nivel === "error" ? "error" : "advertencia"} titulo={a.nivel === "error" ? "Este archivo no se puede usar" : "Ojo con esto"}>
          {a.texto}
        </Alert>
      ))}
      {nuevo?.ancho && nuevo.alto && <p className="text-sm text-n-600">Tu archivo mide {nuevo.ancho}×{nuevo.alto} px.</p>}

      {mostrado ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-n-900">{nuevo ? "Así se va a ver:" : "Así se ve en cada lugar:"}</p>
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-n-500">Registro de clientes (franja con tu color)</span>
            <div className="max-w-sm">
              <LogoNegocio nombre={nombre} marca={marca} variante="banner" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-n-500">Encabezado de un recibo</span>
            <div className="max-w-sm rounded-lg border border-n-200 bg-white p-4">
              <LogoNegocio nombre={nombre} marca={marca} variante="recibo" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-n-500">Portal de tus clientes</span>
            <div className="max-w-sm rounded-lg border border-n-200 bg-white px-4 py-3">
              <LogoNegocio nombre={nombre} marca={marca} variante="barra" />
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-n-600">Todavía no subes tu logo: mientras tanto se muestra el nombre de tu negocio.</p>
      )}

      <AccionesFormulario error={res?.error} exito={res && !res.error ? res.exito ?? true : null}>
        <Button
          type="button"
          variante="secundario"
          cargando={envio.cargando}
          disabled={!archivo || bloqueado}
          onClick={async () => {
            if (!archivo) return setRes({ error: "Escoge un archivo para el logo." });
            const intento = await envio.correr(async () => {
              const fd = new FormData();
              fd.set("foto", archivo);
              return subirLogo(fd);
            });
            const r: ResultadoPerfil = intento.ok ? intento.valor : { error: intento.error };
            setRes(r);
            if (!r.error) {
              if (campo.current) campo.current.value = "";
              setArchivo(null);
              setNuevo(null);
              router.refresh();
            }
          }}
        >
          {logoUrl ? "Guardar el logo nuevo" : "Guardar logo"}
        </Button>
      </AccionesFormulario>
    </div>
  );
}
