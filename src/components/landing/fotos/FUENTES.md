# Fotos de la landing

Todas son fotos reales de Ludogteka (clientes y patio), tomadas por el
negocio. Ya no hay fotos de banco.

## `perros/` — recortes sin fondo (WebP con transparencia)

Recortados con rembg (modelo BiRefNet general lite), quedándose con la
silueta más grande (fuera orejas o patas de otros perros), con un poco más
de color y contraste. Los nombres son los de la lona de la camioneta.

| Archivo | Perro | Foto original |
|---|---|---|
| galleta.webp | Galleta | IMG-20260303-WA0064 |
| dasha.webp | Dasha | IMG_3154 |
| rusher.webp | Rusher | 1000257902 |
| zuki.webp | Zuki | IMG-20251211-WA0025 |
| simon.webp | Simón | IMG-20251110-WA0024 |
| malinois.webp | (sin nombre todavía) | IMG-20251111-WA0021 |
| gran-danes.webp | (sin nombre todavía) | PXL_20260224_200232600 |
| miel.webp | (sin nombre todavía) | PXL_20251015_235042470 |
| tricolor.webp | (sin nombre todavía) | PXL_20251015_234136607 |

Los que no traen nombre salen sin hueso amarillo. Para ponérselo, basta
agregar `nombre` en `src/components/landing/perros.ts`.

## `lugar/` — fotos completas (JPG)

Recortadas de encuadre, con un poco más de color, contraste y enfoque.

| Archivo | Dónde sale | Foto original |
|---|---|---|
| recoleccion-coche.jpg | Recolección | PXL_20260319_201143685 |
| patio-letrero.jpg | Así es donde se queda | IMG-20260105-WA0063 |
| patio-sonrisa.jpg | Así es donde se queda | PXL_20251014_172840437 |
| patio-murete.jpg | Así es donde se queda | IMG-20260225-WA0013 |
| patio-pelotas.jpg | Guardería | PXL_20251015_233523266 |
| hotel-camita.jpg | Hotel | IMG-20251023-WA0000 |

La imagen de Open Graph (`src/app/opengraph-image.jpg`, 1200×630) se
compuso con los recortes de Rusher, Galleta y Zuki sobre el fondo de la
lona; si cambian esos recortes, hay que regenerarla.
