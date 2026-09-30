# Serie de videos cortos de PeluDesk

Siete videos de 15 a 25 s, un mensaje cada uno, con la misma voz y el mismo movimiento que «Un día en tu guardería». El guion con tiempos de cada uno está en `videos/<video>/GUION.md`; los archivos, en `public/peludesk/redes/videos/` (`noindex`, sin enlazar desde el sitio).

PeluDesk tiene hoy Facebook, Instagram y TikTok (`src/components/peludesk/redes.tsx`):

- **9:16 con subtítulos** (`-9x16-subtitulos.mp4`) → Reels de Instagram, TikTok y Reels de Facebook. La mayoría lo ve sin sonido.
- **16:9** (`-16x9.mp4` + `-16x9.srt`) → publicación normal de Facebook, subiendo el `.srt` como subtítulos. Si algún día hay YouTube o LinkedIn, es el mismo archivo.
- Las versiones sin subtítulos (`-9x16.mp4`) son para cuando la red pone los suyos, o para editar encima.

## Calendario (3 por semana: lunes, miércoles y viernes)

Primero lo que más duele en una guardería, después caja y papeleo, luego estética y el dueño, y al final la oferta (la página web gratis), para que quien vio la serie tenga un motivo para abrir la prueba.

| Fecha | Video | Dónde |
| --- | --- | --- |
| Miércoles 30 de septiembre de 2026, 13:40 | Un día en tu guardería (46 s, presentación) | Facebook (16:9) · Reels de Instagram (9:16) · TikTok |
| Miércoles 30 de septiembre de 2026, 13:20 | 1. Ese perro no está vacunado | Reels de Instagram · TikTok · Reels de Facebook |
| Miércoles 30 de septiembre de 2026, 13:00 | 2. Tu corte de caja, sin sorpresas | Reels de Instagram · TikTok · Facebook (16:9) |
| Viernes 9 de octubre | 3. Adiós a la impresora | Reels de Instagram · TikTok · Reels de Facebook |
| Lunes 12 de octubre | 4. Cada raza, su precio | Reels de Instagram · TikTok · Reels de Facebook |
| Miércoles 14 de octubre | 5. Tu cliente ve todo desde su celular | Reels de Instagram · TikTok · Facebook (16:9) |
| Viernes 16 de octubre | 6. ¿Cuánto ganaste de verdad? | Reels de Instagram · Facebook (16:9) · TikTok |
| Lunes 19 de octubre | 7. Tu página web, gratis | Reels de Instagram · TikTok · Reels de Facebook |

Los videos de caja, portal y utilidad van también en 16:9 al muro de Facebook porque ahí sigue el dueño de negocio que decide la compra; los demás, en Reels.

## Publicación automática

El calendario de arriba vive como configuración en `src/lib/redes/serie.ts` (fechas, redes, formato y pie de cada video, a las 13:00 de la Ciudad de México, salvo los tres primeros videos, que salen el 30 de septiembre a las 13:00, 13:20 y 13:40 con sus tres redes a la misma hora). En `/plataforma/redes` se carga con «Cargar el calendario de la serie» y la tarea de Vercel (minutos 3, 23 y 43) lo publica sola: Facebook e Instagram por la Graph API, TikTok como borrador en el buzón de la cuenta (se publica desde la app, con el pie que llega en el aviso de Telegram). Cada video tiene además «Agregar a otra red» (o «Agregar a las que faltan») para crear la publicación de una red que no tenga, con su pie sugerido; si la fecha del calendario ya pasó, sale en la siguiente corrida. Si cambia una fecha o un pie aquí, se cambia también ahí.
