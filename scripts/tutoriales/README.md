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
npm run tutoriales -- --solo-publicar --prod        # sube SOLO lo que cambió (commit, duración o voz distintos al publicado); --todos fuerza la resubida
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

`node scripts/tutoriales/afectados.mjs [base]` propone qué videos enseñan una pantalla o un artículo que cambió (`npm run desplegar` lo imprime como aviso). Se vuelve a grabar con `--regrabar`. Un defecto de la app que sale en pantalla se anota (`defectos` en el estado), no se parcha desde aquí.

### Qué se marca «por actualizar»: lo que SE VE, no el código que cambió

`afectados.mjs` es solo el primer filtro (barato): propone los videos cuya pantalla o artículo tocó el diff. Un cambio de código que no mueve nada visible (un arreglo de consulta, un tope de filas) marcaba decenas de videos de más. La decisión la toma `verificar-visual.mjs`:

```bash
node scripts/tutoriales/verificar-visual.mjs --marcados [--aplicar]   # los hoy «por actualizar»; --aplicar desmarca los que se ven igual
node scripts/tutoriales/verificar-visual.mjs --desde origin/main      # los que propone afectados.mjs
node scripts/tutoriales/verificar-visual.mjs --videos 01,32,80 [--guardar-todo] [--depurar] [--sensibilidad 1.5]
#   --levantar   compila y levanta la app si no hay servidor   ·   --subir [--prod]   sube las capturas de diferencia   ·   --json -   resultado por stdout
```

Para cada video abre en el demo (cuentas gemelas del corredor, 1920×1080 como la grabación) las pantallas que enseña, **solo leyendo**: sigue el guion en `ir` y en los clics a un *enlace* y se detiene donde habría que escribir o apretar un botón (nunca escribe nada). Cada captura se compara contra los fotogramas del master (el más parecido dentro de las escenas en que sale esa pantalla; si el master no está en `salida/`, lo baja de Storage). Además comprueba que cada botón o texto que el guion nombra en una pantalla limpia siga existiendo.

La comparación (`lib/visual.mjs`) es de **estructura**, no de tinta: por bloques de 24 px mira cuánta «tinta» (borde) y cuánto brillo hay, y un bloque difiere solo si hay tinta en una imagen y ninguna en los vecinos de la otra, o el fondo cambió de brillo. Así ignora el cursor, el resaltado, la etiqueta del paso, la compresión y los datos que cambian solos (una fecha, un contador, un nombre: siguen siendo una línea de texto del mismo tamaño); y marca una mancha grande (un aviso, una tarjeta, una columna, una sección que aparece o desaparece, todo corrido hacia abajo). Umbrales en `UMBRALES` (ajustables por entorno `VIS_*` o `--sensibilidad`); `node scripts/tutoriales/prueba-visual.mjs` los prueba con pantallas sintéticas.

Resultado por video: `cambio` (guarda la captura «grabado | hoy | manchas» en `scripts/tutoriales/diferencias/<NN>/`, y con `--subir` en `tutoriales-masters/<NN>-<slug>/diferencias/`), `igual`, `sin_comparar` (no hubo con qué comparar: no se puede afirmar que sigue igual, se trata como cambio) o `sin_grabar`. Lo corre `npm run desplegar` antes de marcar (si no puede correr, marca todos como antes y lo dice) y se corre a mano igual. **Límite conocido**: no distingue una palabra cambiada dentro de un texto del mismo largo; eso lo cubre la comprobación de los nombres que el guion usa y el QC de la grabación.

## Piezas

`lib/grabador.mjs` (Playwright + screencast CDP, cursor, resaltado, zoom, tarjetas) · `lib/hud.mjs` · `lib/guion.mjs` · `lib/voz.mjs` · `lib/render.mjs` (audio, master, 720p, subtítulos, miniatura) · `lib/qc.mjs` · `lib/publicar.mjs` · `lib/youtube.mjs` · `lib/estado.mjs` · `explorar.mjs` (lista lo que se ve en una pantalla, para escribir guiones) · `avisar.mjs` (Telegram por la cola `avisos_operador`).
