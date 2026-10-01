# Reglas de realismo para las tomas de IA

Se anexan a TODO prompt de imagen (`reglasImagen` en `ia.mjs`) y se revisan en el control de calidad.

## Encuadre y estilo
- Vertical 9:16. El CLI de OpenArt solo da imágenes 1:1: se compone con el sujeto centrado, con aire arriba y abajo, y `ia.mjs` recorta 9:16 del centro (a 1080x1920) antes de pasarla a Veo.
- Estilo documental, luz natural, lente de 35 mm, profundidad de campo corta. Nada de CGI ni "ilustración".
- Sin texto, letreros ni logos en escena (la IA los inventa mal).
- Un solo perro por toma, salvo la que pide dos (y entonces, separados y claramente distintos). Sin perros de fondo.
- Personas de espaldas o de lado, rostro poco importante. Sin manos en primer plano.
- Collares y correas simples, sin placas ni letras.

## Video
- Clips de 4 a 6 s, un solo movimiento simple (empuje lento, deriva, un parpadeo, una cola). Nada de cortes dentro del clip, cambios de luz ni acciones complejas.
- Siempre 9:16, sin audio útil: Veo siempre devuelve pista de audio; se descarta con ffmpeg (`-an`).
- Prompt de video: describe SOLO el movimiento, no vuelvas a describir la escena.

## Control de calidad (obligatorio, con los ojos)
12 cuadros por clip a resolución completa. Revisar:
1. Número y forma de patas, colas, orejas y ojos (cada perro: 4 patas, 1 cola, 2 orejas, 2 ojos).
2. Manos y dedos.
3. Cuerpos que se fusionan, se duplican o atraviesan.
4. Texto o logos raros.
5. Cambios entre cuadros consecutivos (morphing): el pelaje, la cara o la ropa cambian de un cuadro al siguiente.
6. Suelo, reflejos y sombras coherentes.
7. Collares y correas.

Segundo pase independiente: tira de cuadros consecutivos + SSIM entre cuadros vecinos (caídas bruscas = morphing). Ante la MENOR duda, se rechaza y se regenera: máximo 3 intentos por toma y 24 generaciones de video por video. Si una toma no pasa, se reemplaza por otra o por una escena de código: nunca se deja pasar una con error.
