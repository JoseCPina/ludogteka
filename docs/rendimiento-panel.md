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

## Cierre en la laptop (1 de noviembre de 2026)
- **Lo que encontró la primera corrida:** la medición «en verde» de la PC no se podía correr allá (no compila) y en la laptop salió engañosa por tres fallas: (1) el contador vivía en un `Map` del módulo y la build carga el módulo por separado para las páginas y para `/api/medir` (no veía nada; ahora en `globalThis`); (2) la auditoría pedía `127.0.0.1` con encabezado `Host`, que el `fetch` de Node ignora (caía en el negocio por omisión → `/sin-acceso`; ahora pide `huellitas.localhost`); (3) `/admin` y `/recepcion` **tronaban en el servidor** (`TypeError: a.catch is not a function`): el arreglo llamaba `.catch` sobre consultas de Supabase, que son *thenables* perezosos sin `.catch` y que además no salen hasta su `await`. Con la pantalla rota se medían 19–26 consultas y ~500 ms; ahora `arrancarTodas` (`src/lib/supabase/arrancar.ts`) las arranca con `Promise.resolve`.
- **Desarrollo, base en Medium, misma medición (mediana de 4, hasta el final del cuerpo), `main` → esta rama:** /admin (admin) 5.9 s → 3.1 s; /recepcion (admin) 5.0 s → 2.6 s; /recepcion (recepción) 3.6 s → 2.1 s; /hotel 1.5 s → 1.0 s; /estetica 1.2 s → 1.0 s.
- **La meta de 600 ms de servidor NO se cumple en /admin ni en /recepcion** (desarrollo: ~2.0–2.5 s sin la latencia; 54–79 consultas, muchas a la vez contra una base de 2 núcleos). Lo que más pesa: `inventario_clinico_alertas` (~470 ms sola, recalcula existencias por insumo) y `cuentas_abiertas_json` (~330 ms); lo demás es espera por concurrencia. /hotel y /estetica sí quedan en ~300–450 ms.

## Producción, antes y después (1 de noviembre de 2026, medido desde la laptop tras desplegar PR #221)
Tiempo hasta el final del cuerpo, mediana, con la latencia de red de la laptop incluida. «Antes» es producción con `main` previo a la rama `fix/recepcion-hotel-tiempo`; «después», la misma medición con el PR #221 desplegado.

| Negocio · rol · pantalla | Antes | Después |
|---|---|---|
| patitasyco · recepción · /recepcion | 2.5 s | 0.96 s |
| patitasyco · recepción · /hotel | 8.8 s | 0.64 s |
| patitasyco · admin · /admin | 2.2 s | 1.1 s |
| patitasyco · admin · /recepcion | 1.77 s | 0.85 s |
| patitasyco · admin · /hotel | 8.6 s | 0.57 s |
| ludogteka · admin · /admin | 1.95 s | 0.99 s |
| ludogteka · admin · /recepcion | 1.27 s | 0.70 s |
| ludogteka · admin · /hotel | 1.93 s | 0.60 s |
| ludogteka · recepción · /recepcion | 1.25 s | 0.76 s |
| estética (los dos negocios) | ~0.6 s | ~0.6 s |

/hotel era lo más lento (8.6–8.8 s en el demo, por el calendario de 14 días) y quedó abajo de 0.65 s. /admin y /recepcion bajaron a la mitad o menos, pero siguen arriba de la meta de 600 ms (ver «Cierre en la laptop»).

## Topes de la auditoría (`tiempo-panel-dev.mjs`)
- **Servidor, por pantalla** (lo medido en desarrollo más 25 %, freno a regresiones): `/recepcion` 2,400 ms, `/hotel` 650 ms, `/estetica` 400 ms, `/admin` 3,100 ms.
- **Consultas** (lo medido más 2): `/recepcion` 64, `/hotel` 20, `/estetica` 19, `/admin` 81.
- Siguiente paso para acercar /recepcion e /admin a 600 ms: `inventario_clinico_alertas` (existencia por insumo en una pasada) y `cuentas_abiertas_json`, y medir cuántas consultas de «Necesita atención» pueden ir en una sola función.

## Segunda vuelta (1 de noviembre de 2026, rama fix/admin-recepcion-600): /admin y /recepcion seguían arriba de 600 ms

**Medido en producción con `tiempo-panel-prod.mjs` después de la primera vuelta** (TTFB desde la PC, ~100 ms de red incluidos):

| Pantalla | Patitas & Co. (demo) | Ludogteka |
|---|---|---|
| /recepcion | 802 ms (admin) | 699–702 ms |
| /admin | 934 ms hasta encabezados · **1,251 ms** completo | 626 ms hasta encabezados · **1,088 ms** completo |
| /hotel | — | 528–550 ms |
| /estetica | 566–614 ms | 553–557 ms |

**Lo que de verdad cuesta en la base** (5 rondas alternadas, calientes, como admin; el resto de lo que pide el tablero cuesta de 0 a 20 ms cada consulta, `inventario_clinico_alertas` incluida: 13–17 ms):

| Consulta | demo | Ludogteka |
|---|---|---|
| `cuentas_abiertas_json(120)` (saldos de salidas) | 83 ms | 84 ms |
| `veterinaria_atencion` | 91 ms | 11 ms (sin Veterinaria) |
| `tarjetas_manuales_atencion` | 8 ms | 36 ms |

Los índices de todo lo que `cuentas_abiertas` recorre ya existen (se revisaron uno por uno); su costo es la pasada misma (15 CTE materializadas sobre reservas, estancias, citas, cargos, cobros, pases…), y corre en paralelo con lo demás: no es la causa de los 600 ms. La causa es de estructura:

1. **/admin armaba sus propias tandas ANTES de que arrancara el tablero del día**: la página esperaba cobro integrado, ubicación, cuentas, horario, perfil, personal y huecos de tarifa, y solo entonces React empezaba `TableroDia` (otras dos tandas) y `ExtrasTablero`. Por eso el encabezado salía a los 626–934 ms y la página completa a 1.1–1.25 s.
2. **Saldos de salidas en tres viajes**: `cuentas_abiertas_json(120)` (todas las cuentas abiertas, el JSON entero) y después las estancias y las citas de esas reservas para quedarse con las terminadas.
3. **Consultas repetidas en el mismo render**: los videos tutoriales los pedían el layout («¿Cómo se hace?») y la tarjeta «Empieza con estos videos» del inicio, cada uno con su cliente; `resolver_cupo_configuracion` se pedía dos veces en /admin (ubicación y configuración).
4. `inventario_clinico_alertas` llamaba `existencia_actual_insumo` por cada insumo con lotes: barato hoy (pocos insumos), lineal en insumos × movimientos en una clínica real.

**Qué cambió**
- `src/app/(staff)/admin/page.tsx`: la página solo pinta el encabezado y SUS HIJOS en paralelo: `AvanceWeb`, `VideosInicio`, `RecordatorioPagoSiToca` (una consulta propia), `TableroDia`, `ExtrasTablero` y `SeccionesAdmin` (todo lo de configuración, con sus tandas de antes). El tablero arranca en el mismo instante que la página.
- Migración `20261203001500`: `saldos_de_salidas_json(p_dias)` (la misma cuenta y el mismo saldo que Caja, `cuentas_abiertas`, filtrada en la base: saldo > 0, nada pendiente, salida real del último perro) — comprobado en desarrollo contra la lógica anterior: 22/22 y 1/1 cuentas idénticas; `inventario_clinico_alertas` con la existencia de todos los insumos con lotes en un solo recorrido de `movimientos_inventario` (mismo resultado que antes en Huellitas; el día del último movimiento sale en la zona del negocio).
- `src/lib/tablero/saldos-de-salidas.ts`: una consulta en vez de tres.
- `src/lib/tutoriales/de-sesion.ts` (`tutorialesDeSesion`, `cache()` por petición): el layout y `VideosInicio` comparten la lista.
- `tiempo-panel-dev.mjs`: topes de consultas bajados a lo que queda: /recepcion 61 (era 64), /admin 77 (era 81), /hotel 20 y /estetica 19 igual. La primera corrida en la laptop confirma el conteo exacto (si queda abajo, se baja a lo que quedó + 2).

**Esperado después (servidor, producción):** /admin completo ≈ 500–600 ms (el tablero ya no espera a la página: −300–400 ms; menos dos viajes de saldos: −40 ms); /recepcion ≈ 450–550 ms (−2 viajes de saldos, −1 de videos; la tanda principal la sigue limitando `cuentas_abiertas` ~85 ms). Si /recepcion sigue arriba de 600 ms en la laptop o en producción, lo siguiente es `cuentas_abiertas`: acotar la segunda rama de `candidatas` (reservas creadas en la ventana sin estancia ni cita) con un índice parcial por `negocio_id, created_at` que excluya las ya canceladas, o una vista materializada por hora; ninguna de las dos es caché de pantalla.

## Producción después de la segunda vuelta (1 de noviembre de 2026, laptop, PR #225)

Medido con `tiempo-panel-prod.mjs --muestras 6` justo después de desplegar (mediana; TTFB y total desde la laptop, ~90–105 ms de red incluidos). Topes de `tiempo-panel-dev.mjs` confirmados en la laptop: /admin **65** consultas (tope 67), /recepcion **49** (tope 51).

| Negocio · rol · pantalla | Antes (después del PR #221) | Después (PR #225) |
|---|---|---|
| patitasyco · admin · /admin | 934 ms encabezados · **1,251 ms** completo | 790 ms encabezados · **977 ms** completo |
| ludogteka · admin · /admin | 626 ms encabezados · **1,088 ms** completo | 702 ms encabezados · **889 ms** completo |
| patitasyco · admin · /recepcion | 802 ms | 698 ms encabezados · 828 ms completo |
| ludogteka · admin · /recepcion | 699–702 ms | 608 ms encabezados · 987 ms completo |
| patitasyco · recepción · /recepcion | — | 826 ms encabezados · 861 ms completo |
| ludogteka · recepción · /recepcion | — | 711 ms encabezados · 752 ms completo |
| /hotel (los dos) | 528–550 ms | 464–599 ms |
| /estetica (los dos) | 553–614 ms | 508–636 ms |

**Lectura:** /admin completo bajó 200–270 ms en los dos negocios (el tablero ya no espera a la página). Sin la red (~100 ms) /admin queda en ≈ 790–880 ms y /recepcion en ≈ 510–730 ms: **la meta de 600 ms todavía no se cumple en /admin ni en /recepcion**. El encabezado de /admin en Ludogteka no bajó (626 → 702 ms, dentro de la variación entre corridas en frío y caliente); lo que manda ahí es lo que espera el layout antes de pintar. Lo siguiente sigue siendo lo de arriba (`cuentas_abiertas`) y medir qué espera el layout del personal antes del primer byte.
