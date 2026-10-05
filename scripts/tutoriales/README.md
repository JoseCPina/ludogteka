# Serie de videos tutoriales de PeluDesk

55 videos cortos (1–4 min; el 00 es el avance de 30–45 s) que enseñan TODO lo que hace la plataforma, grabados con la app de verdad en el negocio **demo ficticio** (Patitas & Co.), **solo en desarrollo**. Nada de Ludogteka, de un cliente real ni de `/plataforma` en pantalla: el QC lo comprueba.

- Mapa de cobertura: [`docs/TUTORIALES.md`](../../docs/TUTORIALES.md) (generado por `node scripts/tutoriales/cobertura.mjs --escribir`; falla si una pantalla, entrada de menú, módulo, permiso, artículo de ayuda o aviso de «Necesita atención» no está en un video ni excluido con motivo).
- Catálogo (una fuente): `catalogo.mjs`. Guiones: `videos/<NN>-<slug>.mjs` (declarativos: escenas con locución y pasos `["clic", "Guardar perro"]`).

## Producir

```bash
# 1. La app compilada y el demo sembrado (desarrollo)
node scripts/demo/sembrar-demo.mjs --rehacer        # el demo envejece; el corredor desbloquea sus cuentas para grabar acciones reales
npm run build && npm run start -- -p 3001

# 2. El corredor
npm run tutoriales -- --listar                      # estado de cada video
npm run tutoriales -- --video 04 --sin-publicar     # uno solo, sin subir nada
npm run tutoriales -- --prod                        # toda la cola; publica en desarrollo y PRODUCCIÓN, y avisa por Telegram
npm run tutoriales -- --video 04 --regrabar         # vuelve a grabar uno (la app cambió)
npm run tutoriales -- --solo-publicar --prod        # sube lo ya terminado (salida/) sin grabar
```

Fases por video (persistidas en `salida/<NN>/estado.json` y en `tutoriales_progreso`): guion → voz → grabado → render → qc → listo | listo menos voz. Tres intentos; una falla no detiene a los demás (a los 3 errores seguidos se detiene y avisa). `--reanudar` es el comportamiento por omisión: salta lo que ya está listo con el mismo guion.

Salen en `salida/<NN>/`: `master-1080p.mp4` (1920×1080, 30 cps, H.264 CRF 18, ≤ 48 MB), `video-720p.mp4` (< 15 MB), `subtitulos.es-MX.srt` y `.vtt`, `poster.jpg`, `miniatura.jpg` (1280×720), `youtube.txt` (título, descripción con capítulos y etiquetas), `guion.txt` (la locución). `salida/` no se versiona: los videos viven en Storage (`tutoriales` público 720p; `tutoriales-masters` privado) y la plataforma baja el paquete en `/plataforma/tutoriales`.

## La voz

Sin `ELEVENLABS_API_KEY` el video sale **«listo menos voz»**: pista en silencio, subtítulos y la locución en `guion.txt`. Con `ELEVENLABS_API_KEY` y `ELEVENLABS_VOICE_ID` (voz «Regina»), el corredor:

1. pregunta a la API cuántos caracteres quedan; no gasta si quedaría menos del 5 % del plan (ese video queda «listo menos voz»);
2. genera la locución de cada tramo (la guarda en `audio/<NN>/` con el hash de lo pedido y la respalda en Storage: lo ya pagado no se vuelve a pagar);
3. usa la duración REAL de la voz para las escenas (nunca se corta la voz: si no cabe, la escena se alarga);
4. mezcla con música generada UNA vez (3 pistas, `audio/_musica`, reutilizadas) a −16 LUFS.

Para agregar la voz a lo ya grabado: `npm run tutoriales -- --prod` (un «listo menos voz» se vuelve a producir en cuanto hay llave) o `--video NN --solo-voz`.

## Si la app cambia

`node scripts/tutoriales/afectados.mjs [base]` dice qué videos enseñan una pantalla o un artículo que cambió (`npm run desplegar` lo imprime como aviso). Se vuelve a grabar con `--regrabar`. Un defecto de la app que sale en pantalla se anota (`defectos` en el estado), no se parcha desde aquí.

## Piezas

`lib/grabador.mjs` (Playwright + screencast CDP, cursor, resaltado, zoom, tarjetas) · `lib/hud.mjs` · `lib/guion.mjs` · `lib/voz.mjs` · `lib/render.mjs` (audio, master, 720p, subtítulos, miniatura) · `lib/qc.mjs` · `lib/publicar.mjs` · `lib/youtube.mjs` · `lib/estado.mjs` · `explorar.mjs` (lista lo que se ve en una pantalla, para escribir guiones) · `avisar.mjs` (Telegram por la cola `avisos_operador`).
