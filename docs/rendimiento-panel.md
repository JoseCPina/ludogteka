# Tiempo del panel: Recepción, Hotel, Agenda de estética e Inicio

Cuándo leerlo: al tocar la carga de datos de una pantalla del personal (tableros, agenda, inicio), `obtenerSesionConRol`, `calendario_ocupacion` / `ocupacion_del_dia`, o al mover el tope de `tiempo-panel-dev.mjs`. Meta: **menos de 600 ms de servidor en producción** por pantalla.

## Cómo se mide
- **Producción, solo lectura:** `node scripts/auditoria/tiempo-panel-prod.mjs [--negocios patitasyco,ludogteka] [--sin-consultas]`. GET a cada pantalla con la sesión de admin y de recepción (enlace mágico), tiempo hasta los encabezados (TTFB: lo que tarda el servidor en armarla, más ~100 ms de red desde la PC) y hasta el final del cuerpo, mediana de 3; después cada consulta de la pantalla una por una con el JWT de la persona, restando la ida y vuelta mínima desde la PC.
- **Desarrollo, con la app compilada:** `npm run build`, `PELUDESK_MEDIR=1 npm run start -- -p 3001` y `node scripts/auditoria/tiempo-panel-dev.mjs` (Huellitas): tiempo medido, tiempo sin la latencia de la base de desarrollo (está en Canadá: cada viaje cuesta 70–100 ms más que en producción; se descuenta por tanda) y el **número exacto de consultas** de cada pantalla (`src/lib/medicion/consultas.ts`: con `PELUDESK_MEDIR=1` el cliente de Supabase del servidor anota cada petición de la que trae `x-peludesk-medir`, y `GET /api/medir?id=` lo devuelve). Falla arriba de 600 ms o del tope de consultas por pantalla; deja `<temp>/tiempo-panel-dev.json` y **`npm run desplegar` exige ese resultado en verde y de menos de 24 h** (`--sin-tiempo-panel` lo salta).

## Antes (producción, 31 de octubre de 2026, medido desde la PC)
Vercel `iad1` y Supabase `us-east-1` (misma región: una ida y vuelta Vercel→base ≈ 5–15 ms). TTFB mediana de 3 muestras, incluye ~100 ms de red PC→Vercel.

| Pantalla | Patitas & Co. (demo) | Ludogteka |
|---|---|---|
| /recepcion (recepción) | 1,559–1,829 ms | 1,051–1,110 ms |
| /recepcion (admin) | 1,523–1,611 ms | 976–1,038 ms |
| /hotel | (Hotel apagado en la demo) | 1,059–1,089 ms |
| /estetica | (Estética apagada en la demo) | 516–524 ms |
| /admin (inicio) | 570–671 ms hasta encabezados, **1,885–2,033 ms** hasta el final (el tablero del día va adentro) | 514–523 ms hasta encabezados, **1,382–1,387 ms** hasta el final |

Desglose (tiempo de cada consulta sin la ida y vuelta, demo / Ludogteka):
- `calendario_ocupacion` de UN día: **400 / 120 ms**; de 3 días 1,860 / 205 ms; de 14 días (lo que pide Hotel): **tiempo de espera agotado / 560–940 ms**. Por cada día llamaba dos veces a `ocupacion_del_dia` (recorre todas las estancias y resuelve `fecha_negocio()`/`zona_negocio()` cada vez) y una a `resolver_cupo_configuracion`.
- Tablero del día (Recepción e Inicio): 30–35 consultas, suma 350–1,270 ms; además de la tanda inicial de 15 hacía **14 viajes más uno tras otro** (bajas pendientes, evaluación exigida, saldos de salidas → 3 viajes, razas sin grupo, gastos, Veterinaria → 3, fallos de WhatsApp, recordatorios, reembolsos, conciliación, tarjetas manuales, ajustes, estado del cobro, CFDI) más `fecha_negocio` al principio. Las más caras: `calendario_ocupacion` (hoy) 400 ms, `veterinaria_atencion` 90–115 ms, `cuentas_abiertas_json` 70–100 ms, y una cola de consultas de 50–90 ms cada una que, en serie, suman.
- Hotel: `fecha_negocio` → tanda de 4 (con el calendario de 14 días) → llegadas atrasadas aparte.
- Agenda de estética: `fecha_negocio` → tanda de 3 → `citas_en_ausencia` aparte → recordatorios de las citas.
- Inicio (admin): cobro integrado ∥ ubicación → `mi_cobro` → tanda de 5 → `negocio_perfil` → `listar_personal` → huecos de tarifa (5 consultas) → y adentro el tablero del día completo.
- Sesión (`obtenerSesionConRol`, en cada pantalla): Auth → tanda de 4 (`current_rol`, `mi_cliente_id`, `nombre_de_persona`, `modulos_activos`) → `mis_permisos` → `acceso_veterinaria` ∥ `es_medico_veterinario`: 4 tandas, 60–100 ms, cuando el middleware ya había pedido todo eso en una (`acceso_de_sesion`).
- Las funciones de identidad (`current_rol`, `is_staff`, `es_miembro`, `negocio_actual`, `zona_negocio`, `fecha_negocio`) cuestan 0–10 ms cada una: no son la causa.

## Causa raíz
1. **`calendario_ocupacion` recalculaba la ocupación día por día** (2 × `ocupacion_del_dia` por día, cada una recorriendo todas las estancias): lineal en días × estancias. Es la mayor parte de Hotel (14 días) y 250–400 ms de Recepción (1 día).
2. **Consultas en serie que podían ir en paralelo:** el tablero del día esperaba 14 viajes uno tras otro después de su tanda; Hotel, Estética e Inicio tenían 2–5 viajes sueltos cada uno; la sesión pedía en cuatro tandas lo que `acceso_de_sesion` ya trae en una.
3. **`fecha_negocio` como viaje aparte** al principio de cada pantalla, cuando `hoyNegocio(zona)` da la misma fecha con la zona del negocio.

## Qué cambió (rama fix/recepcion-hotel-tiempo)
- Migración `20261203001200_calendario_ocupacion_una_pasada.sql`: `calendario_ocupacion` en UNA pasada (lee una vez las estancias vivas que tocan el rango, las cruza con los días y cuenta con la misma regla de `ocupacion_del_dia`; `ocupacion_del_dia` no cambia, la sigue usando `validar_estancia`). Comprobado en desarrollo día por día contra la función anterior en 154 días de rangos pasados, presentes y futuros (Huellitas y Ludogteka de desarrollo): idéntico. Tiempo en desarrollo: 31 días de 4.3–5.8 s a 130–215 ms (con ~120 ms de ida y vuelta). Índice `estancias_negocio_salida_idx`.
- `src/app/(staff)/tablero-dia.tsx`: `hoy = hoyNegocio(zona)` y un objeto `previas` que arranca A LA VEZ las 14 consultas de «Necesita atención» (cada bloque espera solo la suya); quedan dos tandas: la principal y lo que depende de las llegadas próximas.
- `src/app/(staff)/reservas/modulo/tablero.tsx` (Hotel/Guardería): sin `fecha_negocio`; las llegadas atrasadas van en la tanda.
- `src/app/(staff)/estetica/page.tsx`: sin `fecha_negocio`; `citas_en_ausencia` va en la tanda.
- `src/app/(staff)/admin/page.tsx`: `mi_cobro`, `negocio_perfil`, `listar_personal` y los huecos de tarifa arrancan a la vez con la primera tanda.
- `src/lib/auth/sesion.ts`: `acceso_de_sesion` ∥ `mi_cliente_id` ∥ `nombre_de_persona` (una tanda en vez de cuatro), misma fuente que el middleware.
- La regla de pintar desde el registro final sigue intacta: nada de esto es caché; cada petición lee la base.

## Tiempo esperado después (producción; la laptop lo confirma con `tiempo-panel-prod.mjs` tras desplegar)
Viaje Vercel→base ≈ 10 ms; TTFB desde la PC suma ~100 ms de red.

| Pantalla | Antes (servidor) | Tandas antes → después | Esperado después (servidor) |
|---|---|---|---|
| /recepcion | 0.9–1.7 s | ~20 → 6 (middleware, Auth, sesión, tanda principal, dependientes, render) | **≈ 300–400 ms** (la tanda principal la limitan `veterinaria_atencion` ~110 ms y `cuentas_abiertas_json` ~100 ms) |
| /hotel | ~1.0 s | 7 → 5 | **≈ 200–250 ms** (el calendario de 14 días baja de 560–940 ms a ~30–60 ms) |
| /estetica | ~0.42 s | 7 → 6 | **≈ 200–250 ms** |
| /admin (completo, con el tablero) | 1.3–1.9 s | ~25 → 8 | **≈ 400–500 ms** |

Si después del despliegue Recepción o Inicio siguen arriba de 600 ms, lo siguiente a medir son `veterinaria_atencion` y `cuentas_abiertas_json` (las dos más caras que quedan en la tanda principal) y el tiempo de render del tablero (HTML de 95–145 KB).

## Topes de la auditoría (`tiempo-panel-dev.mjs`)
- Servidor: 600 ms (descontando la latencia de desarrollo por tanda).
- Consultas por pantalla (layout incluido, middleware no): `/recepcion` 48, `/hotel` 22, `/estetica` 16, `/admin` 70. Son los conteos del diseño después del arreglo; la primera corrida en la laptop los confirma (si una pantalla queda abajo, se baja el tope a lo que quedó + 2). Subirlos es una decisión que se explica en el commit.
