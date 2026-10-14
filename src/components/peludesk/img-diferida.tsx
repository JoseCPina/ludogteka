"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

// Una imagen que no se pide hasta que está a ~400 px de la pantalla. El
// `loading="lazy"` del navegador baja las de las dos o tres pantallas
// siguientes de golpe y compite con el primer pintado en una conexión lenta.
// Conserva ancho y alto (sin saltos) y deja un <noscript> con la imagen real.
const VACIA = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "loading" | "src" | "srcSet"> & { src: string; srcSet?: string };

export function ImgDiferida({ src, srcSet, alt = "", ...resto }: Props) {
  const ref = useRef<HTMLImageElement>(null);
  const [cerca, setCerca] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setCerca(true);
        obs.disconnect();
      },
      { rootMargin: "400px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={ref} src={cerca ? src : VACIA} srcSet={cerca ? srcSet : undefined} alt={alt} decoding="async" {...resto} />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} srcSet={srcSet} alt={alt} {...resto} />
      </noscript>
    </>
  );
}
