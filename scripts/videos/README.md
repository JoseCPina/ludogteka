# Videos de producto de PeluDesk

Videos cortos para redes (Reels, TikTok, YouTube) hechos con la app de verdad: el negocio de demostración (Patitas & Co.) grabado con Playwright, dentro de marcos de monitor, tablet y teléfono, editados por escenas con [HyperFrames](https://github.com/heygen-com/hyperframes) (HTML + GSAP → MP4) y renderizados con ffmpeg.

**Nunca datos de Ludogteka ni de un cliente real**: las tomas entran solo por `/demo/entrar/<rol>` a un host `patitasyco.*` (el script se niega a otro).

## Producir un video

```bash
# 1. La app compilada con el demo sembrado (en desarrollo)
node scripts/demo/sembrar-demo.mjs --rehacer     # el demo envejece: lo deja con "hoy"
npm run build && npm run start -- -p 3001

# 2. Grabar, componer y renderizar
node scripts/videos/producir.mjs un-dia-en-tu-guarderia --grabar
```

Salen en `public/peludesk/redes/videos/`:

| Archivo | Para |
| --- | --- |
| `<video>-9x16.mp4` / `-9x16-subtitulos.mp4` | Reels y TikTok |
| `<video>-16x9.mp4` / `-16x9-subtitulos.mp4` | YouTube, LinkedIn, la web |
| `<video>-<formato>.srt` | subtítulos para subir aparte |
| `<video>-<formato>.jpg` | portada |

Se sirven con `X-Robots-Tag: noindex` (`next.config.ts`) y no se enlazan desde el sitio. El guion con tiempos queda en `videos/<video>/GUION.md` (lo genera el script: no se edita a mano).

Opciones: `--tomas estetica,caja` (vuelve a grabar solo esas), `--solo-grabar`, `--solo-voz` (genera y revisa la voz y la música, sin grabar ni renderizar), `--sin-render` (solo arma los proyectos), `--sin-musica`, `--formatos 9x16`, `--calidad draft|standard|high`, `--base <url>`.

Para revisar el encuadre sin renderizar: `--sin-render` y luego, en `.build/<video>/<formato>`, `node ../../../node_modules/hyperframes/bin/hyperframes.mjs snapshot --at 2,5.5,9 --no-end -o <carpeta>` (deja una hoja de contactos).

Para editar a mano en el Studio de HyperFrames: `--sin-render` y luego `cd scripts/videos/.build/<video>/16x9 && npx hyperframes preview`.

## Cómo está armado

```
producir.mjs              grabar → voz → componer → render → audio → public/
lib/grabar.mjs            Playwright + screencast de Chromium (CDP) a 2x, cursor/dedo animado con
                          onda en cada clic, y MARCAS: dónde estaba un elemento, cuándo, su texto y su recorte
lib/dispositivos.mjs      monitor con base, tablet y teléfono (CSS, sin logos) y su geometría:
                          un punto de la app → un punto de la escena
lib/composicion.mjs       proyecto de HyperFrames: index.html (escenas traslapadas + subtítulos)
                          y una sub-composición por escena
lib/movimiento.js         resortes y helpers de GSAP (llegar, cámara, profundidad, sacar de pantalla)
lib/estilo.css            paleta y Outfit del kit, marcos, títulos, subtítulos
lib/subtitulos.mjs        frases cortas repartidas en la ventana de voz de cada escena, y el .srt
lib/voz.mjs               voz y música de ElevenLabs (o pista vacía), caché y mezcla
lib/cortos.mjs            escenas de la serie corta: gancho, pantalla, cierre
audio/<video>/            voz y música generadas (caché versionada: no se vuelven a pagar)
videos/<video>/guion.mjs  orden, duración, texto en pantalla y locución de cada escena
videos/<video>/tomas.mjs  lo que se hace en la app frente a la cámara
```

- **Edición no lineal**: el guion dice orden y duración de cada escena; `tiempos()` calcula los inicios con el traslape de la transición. Mover una escena, alargarla o cambiar su texto es cambiar `guion.mjs`.
- **Si la app cambia**: se vuelve a grabar. La cámara, los recortes que salen de la pantalla y los cortes se calculan con las marcas de cada toma (posición y segundo), no con números a mano. Si una pantalla cambia de forma, se ajusta el selector en `tomas.mjs`.
- **Movimiento**: todo lo que llega, llega con resorte (`PD.resorte`: velocidad inicial cero y un rebote suave); lo que se va, acelera al salir. Una cosa a la vez: llega el dispositivo, luego el texto, luego el detalle.
- **Determinismo**: nada de relojes ni azar en la composición; `filter` siempre con estado inicial explícito (interpolar desde `none` pasa por `brightness(0)` y da cuadros negros).

## La voz y la música

Cada escena lleva su texto y su ventana (`voz.desde` / `voz.hasta`); el `GUION.md` dice qué se lee y en qué segundo. Sin llave, el MP4 lleva una pista de audio en silencio (AAC 48 kHz estéreo) lista para montar la voz en cualquier editor.

Con `ELEVENLABS_API_KEY` y `ELEVENLABS_VOICE_ID` (hoy «Regina», voz mexicana conversacional de la biblioteca de ElevenLabs) `lib/voz.mjs`:

- genera la locución de cada escena con `eleven_multilingual_v2` y timestamps, en tono de plática (estabilidad 0.55, estilo 0: el estilo alto es el que suena a comercial) y con el texto de la escena anterior y la siguiente para que la entonación siga;
- mide dónde termina de verdad el sonido de cada frase (no la última letra de la alineación) y, si no cabe en su ventana, la vuelve a pedir un poco más rápida (máximo 1.05×); si ni así cabe, **se detiene y dice cuánto falta**: se alarga la escena o se acorta el texto, nunca se corta la voz;
- corta cada frase después de su último sonido con un desvanecido de 0.12 s y revisa en la pista que en ese tramo ya no haya voz, que termine antes del final de su escena y que no pise la siguiente (`verificarVoz` en `producir.mjs`); los subtítulos se alinean palabra por palabra a la voz real (aunque el subtítulo diga «15» y la voz «quince»);
- pide la música de fondo a Eleven Music (instrumental, la misma indicación para toda la serie, `MUSICA` en `producir.mjs`, o `guion.musica`) del largo del video, y la mezcla con ganancias fijas: voz a −16 LUFS, música 16 dB abajo y más baja todavía mientras hay voz (sidechain), con entrada y salida suaves y un limitador. Nada de normalizador dinámico: sube la música en los silencios.

Todo lo generado se guarda en `audio/<video>/` con el hash de lo que se pidió (texto, voz, ajustes, velocidad) y va en el repo: volver a producir no gasta créditos mientras no cambie el guion. La caché se queda solo con lo que usa el guion de hoy.

## La serie de videos cortos

Siete videos de 15 a 25 s, un solo mensaje cada uno, en `videos/<nombre>/` con las piezas comunes en `videos/_serie/comun.mjs` y las escenas en `lib/cortos.mjs`:

- `gancho`: la pregunta que nombra el problema desde el primer cuadro, con una libreta de apuntes a mano (dibujada, nada de la app);
- `pantalla`: un dispositivo con una toma de la app; el título se va justo antes del primer zoom o recorte (si no, la pantalla crece por debajo de él), la cámara va a una marca, un recorte sale de la pantalla (`sacar`, con `destino.ancho` en px para renglones anchos) o una tarjeta vectorial con el mismo texto y números de la app nace del lugar exacto del elemento (`tarjeta`), y un trazo o una flecha lo señalan;
- `cierre`: «15 días gratis», sin tarjeta, peludesk.mx.

Cada toma de la serie espera 1.2 s antes de actuar (llegan el dispositivo y el título), y un recorte se marca ANTES de mover el cursor encima (si no, el cursor sale congelado dentro del recorte). El calendario de publicación está en `SERIE.md`.

## Requisitos

- Node 22+, ffmpeg, y `cd scripts/videos && npm ci` (HyperFrames y GSAP viven aquí, con su propio `package.json`, para no cargar el build de Vercel). En la nube los instala `scripts/nube/preparar-entorno.sh`.
- Chromium: en la nube se usa el de Playwright (`/opt/pw-browsers`); en otra máquina, `npx hyperframes browser ensure` o `HYPERFRAMES_BROWSER_PATH`.
- Render: cada formato se renderiza UNA vez completo (sin subtítulos, cuadros de las tomas en JPG); los subtítulos van en una capa transparente aparte (`capas/subtitulos.html` → ProRes 4444, barata porque no tiene video) y ffmpeg la pone encima. Con 8 GB de RAM: ~1.5 min por formato de un video corto, ~5 min del de 48 s. Las tomas se codifican con un keyframe por segundo (`-g 30`): con keyframes cada 9 s HyperFrames fallaba al buscar cuadros y el render se trababa siempre en el mismo punto. La pasada principal va por segmentos (`HF_SEGMENTED_CAPTURE=true`; la capa no, porque arma MP4 y ProRes no cabe) y, si se traba, reintenta reanudando (`--resume`). La salida de HyperFrames va a `render.log` en la carpeta del proyecto, no a un tubo.
- En Windows: ffmpeg con `winget install Gyan.FFmpeg`, el navegador de HyperFrames con `node node_modules/hyperframes/bin/hyperframes.mjs browser ensure`, y HyperFrames se corre con el mismo Node (el `.cmd` de `node_modules/.bin` no lo abre `spawn`). El chrome-headless-shell pinta en inglés los `<input type=file>` («Choose File»): la grabación los oculta.
