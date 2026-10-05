"use client";

import { useRef, useState } from "react";
import { urlArchivoTutorial, type Tutorial } from "@/lib/tutoriales";

const VELOCIDADES = [0.75, 1, 1.25, 1.5, 2];

/**
 * El reproductor de un video tutorial. Con id de YouTube, el reproductor de
 * youtube-nocookie.com; si no, el MP4 de 720p con sus subtítulos (VTT es-MX),
 * control de velocidad y póster. Cabe en un celular (16:9 al ancho).
 */
export function ReproductorTutorial({ t }: { t: Pick<Tutorial, "titulo" | "video_path" | "poster_path" | "vtt_path" | "youtube_id"> }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [velocidad, setVelocidad] = useState(1);

  if (t.youtube_id) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg border border-n-200 bg-black">
        <iframe
          title={t.titulo}
          src={`https://www.youtube-nocookie.com/embed/${t.youtube_id}?rel=0&cc_lang_pref=es&cc_load_policy=1`}
          allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
          className="h-full w-full"
        />
      </div>
    );
  }
  const src = urlArchivoTutorial(t.video_path);
  if (!src) return null;
  const vtt = urlArchivoTutorial(t.vtt_path);
  return (
    <div className="flex flex-col gap-2" data-reproductor-tutorial>
      <div className="aspect-video w-full overflow-hidden rounded-lg border border-n-200 bg-black">
        <video
          ref={ref}
          controls
          playsInline
          preload="metadata"
          poster={urlArchivoTutorial(t.poster_path) ?? undefined}
          className="h-full w-full"
          crossOrigin="anonymous"
        >
          <source src={src} type="video/mp4" />
          {vtt && <track kind="subtitles" srcLang="es-MX" label="Español (México)" src={vtt} default />}
          Tu navegador no puede reproducir el video.
        </video>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Velocidad del video">
        <span className="text-n-600">Velocidad:</span>
        {VELOCIDADES.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={velocidad === v}
            onClick={() => {
              setVelocidad(v);
              if (ref.current) ref.current.playbackRate = v;
            }}
            className={`min-h-9 rounded-full border-[1.5px] px-3 font-semibold ${velocidad === v ? "border-morado bg-morado-suave text-morado" : "border-n-300 text-n-700 hover:border-morado"}`}
          >
            {v}×
          </button>
        ))}
      </div>
    </div>
  );
}
