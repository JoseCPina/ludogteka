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

Opciones: `--tomas estetica,caja` (vuelve a grabar solo esas), `--solo-grabar`, `--sin-render` (solo arma los proyectos), `--formatos 9x16`, `--calidad draft|standard|high`, `--base <url>`.

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
lib/voz.mjs               pista vacía o voz de ElevenLabs
videos/<video>/guion.mjs  orden, duración, texto en pantalla y locución de cada escena
videos/<video>/tomas.mjs  lo que se hace en la app frente a la cámara
```

- **Edición no lineal**: el guion dice orden y duración de cada escena; `tiempos()` calcula los inicios con el traslape de la transición. Mover una escena, alargarla o cambiar su texto es cambiar `guion.mjs`.
- **Si la app cambia**: se vuelve a grabar. La cámara, los recortes que salen de la pantalla y los cortes se calculan con las marcas de cada toma (posición y segundo), no con números a mano. Si una pantalla cambia de forma, se ajusta el selector en `tomas.mjs`.
- **Movimiento**: todo lo que llega, llega con resorte (`PD.resorte`: velocidad inicial cero y un rebote suave); lo que se va, acelera al salir. Una cosa a la vez: llega el dispositivo, luego el texto, luego el detalle.
- **Determinismo**: nada de relojes ni azar en la composición; `filter` siempre con estado inicial explícito (interpolar desde `none` pasa por `brightness(0)` y da cuadros negros).

## La voz

Cada escena lleva su texto y su ventana (`voz.desde` / `voz.hasta`); el `GUION.md` dice qué se lee y en qué segundo. Sin llave, el MP4 lleva una pista de audio en silencio (AAC 48 kHz estéreo) lista para montar la voz en cualquier editor.

Con `ELEVENLABS_API_KEY` y `ELEVENLABS_VOICE_ID` en el entorno, `producir.mjs` genera la locución de cada escena (modelo multilingüe, con timestamps), la coloca en su segundo y los subtítulos se alinean a la voz real.

## Requisitos

- Node 22+, ffmpeg, y `cd scripts/videos && npm ci` (HyperFrames y GSAP viven aquí, con su propio `package.json`, para no cargar el build de Vercel). En la nube los instala `scripts/nube/preparar-entorno.sh`.
- Chromium: en la nube se usa el de Playwright (`/opt/pw-browsers`); en otra máquina, `npx hyperframes browser ensure` o `HYPERFRAMES_BROWSER_PATH`.
- Render de ~46 s en 1080p: unos 2.5 min por variante con 4 núcleos.
