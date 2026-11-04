# PeluDesk · Sistema de diseño

**Regla:** todo lo visual sigue este documento. Antes de construir o rediseñar una pantalla se parte de un **bloque de la biblioteca** (`C:\ui-library\INDICE.md`, shadcn/studio) y de una **referencia de Mobbin** (`C:\ui-library\mobbin\INDICE.md`); nunca desde cero. El logo y el nombre no cambian (`docs/DISENO.md` → «Logo de PeluDesk»; la marca del negocio, `negocios.marca`).

Fecha: 1 de noviembre de 2026 (remodelación completa). `docs/DISENO.md` sigue valiendo para la marca, el contraste verificado y la regla «la marca del negocio arriba, PeluDesk al pie»; lo que contradiga a este documento, manda este.

---

## 1. Base técnica

| Pieza | Qué es | Dónde |
|---|---|---|
| Tailwind | v4 (`@tailwindcss/postcss`), tokens en CSS | `src/app/globals.css` |
| shadcn/ui | estilo `new-york` (Radix), `components.json` en la raíz, alias `ui` → `@/components/shadcn` | `src/components/shadcn/*` (primitivas sin tocar: `button`, `input`, `select`, `card`, `badge`, `table`, `dialog`, `sheet`, `dropdown-menu`, `tabs`, `tooltip`, `separator`, `avatar`, `skeleton`, `alert`, `switch`, `checkbox`, `popover`, `scroll-area`, `collapsible`, `breadcrumb`, `radio-group`, `label`, `textarea`) |
| Componentes del sistema | Los de siempre (`Button`, `Enlace`, `Field`, `Select`, `Textarea`, `TablaResponsiva`, `Alert`, `Chip`, `Esqueleto`, `FormularioAccion`, `BotonAccion`, `AccionesFormulario`, `CampoCopiable`…) reconstruidos **encima** de las primitivas y tokens de shadcn | `src/components/ui/*` |
| Iconos | `lucide-react`, trazo 1.75 (menú) o 2 (avisos). Única excepción: el logo de WhatsApp (`IconoWhatsApp`, lucide no trae marcas) | `src/components/iconos-nav.tsx`, `src/components/iconos/` |
| Utilidad | `cn()` (clsx + tailwind-merge) | `src/lib/utils.ts` |
| Registros de shadcn/studio | `@ss-components`, `@ss-blocks`, `@ss-themes` en `components.json`; las credenciales viven en `.env` (nunca en el repo) | `components.json` |

**Las pantallas usan `src/components/ui`, no `src/components/shadcn` directo**, salvo primitivas sin comportamiento de servidor (`Card`, `Badge`, `Separator`, `Tabs` de solo lectura, `Tooltip`, `Avatar`, `Skeleton`). Todo lo que guarda pasa por `Button cargando` / `FormularioAccion` / `BotonAccion` / `useControlVersion`: el tope de envío, «Sigue trabajando…», el registro final, el bloqueo de escritura y los permisos por pantalla viven ahí y no se duplican.

## 2. Tokens

Tres capas en `globals.css`: **marca** (no cambia) → **semánticos de shadcn** (`:root`) → **lenguaje** (`[data-lenguaje="calido"]` sobrescribe los del panel).

### 2.1 Color — marca (compartida)

| Token | Hex | Rol |
|---|---|---|
| `morado` | `#4B3F72` | Primario: botón principal, enlace, foco, activo del menú. Texto blanco 9.32:1 |
| `morado-oscuro` | `#3A3059` | Hover del primario; texto sobre `morado-suave` (9.98:1) |
| `morado-suave` | `#ECE8F5` | Activo del menú, `secondary`/`accent`, chip de información |
| `menta` / `menta-oscuro` / `menta-suave` | `#A7D8C8` / `#1F6B57` / `#E3F3ED` | Éxito. Menta solo decorativo; texto en `menta-oscuro` |
| `coral` / `coral-oscuro` / `coral-hondo` / `coral-suave` | `#F28C82` / `#B23C31` / `#962F26` / `#FDE8E5` | Error y destructivo. Botón `peligro` en `coral-oscuro` |
| `ambar` / `ambar-oscuro` / `ambar-suave` | `#F5B85C` / `#8A5400` / `#FDF0D9` | Advertencia |
| `crema` (`n-50`) | `#FFF8EE` | Fondo del lenguaje cálido |
| `grafito` (`n-900`) | `#2B2A33` | Texto principal |
| `n-0 … n-900` | rampa cálida (`docs/DISENO.md`) | `n-500` (4.5:1) es el gris de texto más claro permitido |
| `borde` | `#948D98` | Borde de control (3:1 sobre blanco, crema y lienzo) |
| **`lienzo`** (nuevo) | `#F9F8F6` | Fondo de página del panel |
| **`lienzo-suave`** (nuevo) | `#F3F1ED` | `muted`: fila bajo el puntero, bloque secundario, fondo de tabla |
| **`linea`** (nuevo) | `#E4DFD8` | `border`: tarjeta, separador, barra lateral (decorativo) |

### 2.2 Color — semánticos (shadcn)

| Semántico | Panel (`:root`) | Cálido |
|---|---|---|
| `background` | `lienzo` | `crema` |
| `foreground` | `n-900` | = |
| `card`, `popover` | `#FFFFFF` | = |
| `primary` / `-foreground` | `morado` / blanco | = |
| `secondary`, `accent` / `-foreground` | `morado-suave` / `morado-oscuro` | = |
| `muted` / `-foreground` | `lienzo-suave` / `n-600` | `n-100` / `n-600` |
| `destructive` / `-foreground` | `coral-oscuro` / blanco | = |
| `success` / `warning` | `menta-oscuro` / `ambar-oscuro` | = |
| `border` | `linea` | `n-200` |
| `input` | `borde` | = |
| `ring` | `morado` | = |
| `sidebar*` | blanco, texto `n-700`, activo `morado-suave`/`morado-oscuro` | — |
| `chart-1…5` | morado, menta-oscuro, coral, ámbar, menta | = |

Todo par de texto sobre fondo nuevo se agrega a `scripts/diseno/contraste.mjs` **antes** de usarse (sale con 1 si alguno no llega).

### 2.3 Tipografía

Una familia: **Outfit** (`--font-outfit`, la del logotipo), pesos 400/500/600/700. Números de tabla y montos con `tabular-nums`.

| Uso | Panel | Cálido |
|---|---|---|
| Título de pantalla (`h1`) | 24/32, 700 (`text-2xl font-bold`) | 28/36, 700 |
| Título de sección (`h2`) | 18/28, 600 | 20/28, 600 |
| Título de tarjeta | 15/22, 600 | 17/24, 600 |
| Cuerpo | 15/22 (`text-[0.9375rem]`) | 16/24 |
| Secundario | 14/20, `muted-foreground` | 15/22 |
| Etiqueta de campo | 14/20, 500, `n-800` | = |
| Grupo de menú, encabezado de tabla | 11–12/16, 600, mayúsculas con 0.06em (menú) o 0.02em (tabla), `n-500` / `muted-foreground` | — |
| Cifra de tablero (KPI) | 28/32, 700, `tabular-nums` | — |

### 2.4 Radios

`--radius` por lenguaje; los demás salen de ahí (`@theme inline`).

| Token | Panel (`--radius: 10px`) | Cálido (`--radius: 16px`) | Uso |
|---|---|---|---|
| `rounded-sm` | 6 | 12 | chip cuadrado, casilla |
| `rounded-md` | 8 | 14 | botón, campo, entrada de menú |
| `rounded-lg` | 10 | 16 | tarjeta, alerta, tabla |
| `rounded-xl` | 14 | 20 | panel destacado, diálogo |
| `rounded-2xl` | 18 | 24 | tarjeta de héroe (cálido) |
| `rounded-full` | — | — | chip de estado, avatar, «?» |

### 2.5 Espacio

Escala de Tailwind (4 px). Panel denso: **gap 12–16 entre tarjetas, padding de tarjeta 16 (20 en escritorio), 24–28 entre secciones**; página `px-4` (celular) / `px-8` (escritorio), `pt-5`/`pt-7`. Cálido: padding de tarjeta 20–24, 32–48 entre secciones. Área táctil mínima: **44 × 44 px** en todo control (lo exige `ux-jerarquia-dev`).

### 2.6 Sombras

| Token | Valor | Uso |
|---|---|---|
| `shadow-xs` | Tailwind | botón relleno, campo |
| `shadow-tarjeta` | panel: `0 1px 2px rgb(43 42 51/.06), 0 0 0 1px rgb(43 42 51/.02)`; cálido: `0 1px 3px rgb(75 63 114/.08), 0 8px 24px -12px rgb(75 63 114/.16)` | tarjeta |
| `shadow-flotante` | `0 12px 32px -8px rgb(43 42 51/.18), 0 2px 6px rgb(43 42 51/.06)` | menú en celular, diálogo, popover |

## 3. Dos lenguajes, una base

| | **Panel del negocio** (herramienta de trabajo diario) | **App de dueños, portal y lo público** (consumo, cálida) |
|---|---|---|
| Se activa | por omisión (`:root`) | `data-lenguaje="calido"` en el contenedor raíz del área |
| Fondo | `lienzo` neutro, superficies blancas | `crema`, tarjetas blancas con sombra suave |
| Densidad | alta: tablas de 44 px por fila, cifras a la derecha, conteos en los títulos | baja: una columna, tarjetas grandes con foto o avatar |
| Radio | 8–10 px | 14–24 px |
| Letra | 15 px de cuerpo | 16 px de cuerpo, títulos más grandes |
| Acción | barra de acciones arriba a la derecha + la principal fija abajo en formularios largos | un botón principal por pantalla, ancho completo en celular |
| Tono | dice el estado y qué falta («3 por cobrar», «Falta la talla») | cercano y en relativo («en 1 hora», «Ya casi»), sin montos en el portal |
| Referencias | Fresha, Jobber, Square, Attio, HubSpot, Shopify | Fi, Fresha (reservar), Warby Parker, Citizen/Nextdoor, Careem |

## 4. Componentes y reglas

### Botón (`src/components/ui/button.tsx`, encima de `buttonVariants` de shadcn)
- `primario` = `default` (relleno morado), `secundario` = `outline` (borde de control 1.5 px, superficie de tarjeta), `peligro` = `destructive` (coral oscuro). No hay más variantes: un enlace no se disfraza de botón.
- Alto mínimo 44 px (`normal`: 15 px de letra, `compacto`: 14 px). Ícono a la izquierda, `1.1em`.
- **Hover**: primario → `morado-oscuro`; secundario → borde morado + fondo `accent`; peligro → `coral-hondo`. **Foco**: anillo de 3 px `ring` con separación de 2 px. **Cargando**: giro + `aria-busy` desde el toque, a los 3 s «Sigue trabajando…», sin doble envío. **Deshabilitado**: `n-100` / `n-600` (no opacidad: tiene que seguir pasando AA). **Bloqueado** (prueba vencida): `aria-disabled` + aviso al tocar (`[data-bloqueado]`).
- Base de biblioteca: `components/button/button-01…` (formas), `button-group-*` para barras de acciones.

### Enlace (`enlace.tsx`)
- Morado, 600, subrayado al pasar (siempre dentro de una frase: `enTexto`). Suelto: 44 px de área. `forma="bloque"` para tarjetas y renglones que navegan. Interno siempre por `<EnlacePrecarga>` (pendiente, barra de arriba, doble toque ignorado).

### Campo (`campo-base.ts` → `Field`, `Select`, `Textarea`)
- Del `Input` de shadcn: 44 px, borde `input` de 1.5 px, superficie `card`, `rounded-md`, 15 px. Etiqueta arriba (14/500), ayuda abajo en `muted-foreground`, error abajo en `destructive` 600 + borde y fondo coral suave + `aria-invalid`. Foco: borde `ring` + anillo 3 px `morado-suave`. Deshabilitado: `n-100`/`n-600`.
- Base de biblioteca: `components/input/input-*`, `form-layout-01…09`.

### Tabla (`TablaResponsiva`)
- Desde 640 px: tabla de shadcn — encabezado 12 px 600 `muted-foreground`, renglones con línea `border`, fila bajo el puntero en `muted`, números a la derecha con `tabular-nums`, la primera columna es el enlace al detalle. Menos de 640 px: cada fila es una tarjeta (QA N154), sin desplazamiento horizontal escondido.
- Base: `components/data-table/data-table-*`, `components/table/table-*`; referencia Mobbin `panel-clientes-mascotas` (Attio, Stripe), `panel-inventario` (Shopify).

### Tarjeta
- `rounded-lg border border-border bg-card shadow-tarjeta`, padding 16/20. Encabezado: título de tarjeta + acción secundaria a la derecha. Una tarjeta = un tema. Base: `Card` de shadcn, `statistics-component-*` (cifras), `widget-component-*`.

### Navegación del panel (`src/components/chrome/staff-shell.tsx`)
- **Escritorio**: barra lateral de 256 px, blanca (`sidebar`), con la marca del negocio arriba, **Inicio** y los **grupos titulados** (Día a día · Clientes · Dinero · Equipo e inventario · Ajustes · Ayuda; `GRUPOS_NAV` en `src/lib/nav/config.ts`). Entrada activa en `sidebar-accent` con ícono morado. Al fondo: «Tus negocios», «Instalar la app», la persona (iniciales, nombre, rol) con **Salir**, y «Hecho con PeluDesk». Encabezado de 64 px, pegado arriba y translúcido: «Grupo / Sección», «¿Cómo se hace?» y «?».
- **Celular**: encabezado con la marca y el «?»; **barra inferior fija** con Inicio + las 3 pantallas principales del rol (`pantallasPrincipales`) + **«Más»**, que abre el menú completo agrupado (`#menu-lateral-staff`, con «Cerrar»). El contenido deja 112 px abajo para que nada fijo tape un control.
- Base: bloque `dashboard-shell-01` (barra lateral con grupos y migas) y `application-shell-06` (cajón en celular). Referencias: Mobbin `panel-navegacion` (Square: grupos con título y la cuenta al fondo; Jobber iOS: barra inferior de cinco; Air NZ: «Más» como lista agrupada).

### Estados
| Estado | Regla |
|---|---|
| Hover | cambio de fondo a `muted`/`accent` o de borde a `primary`; nunca solo color de texto en controles grandes |
| Foco | anillo de 3 px `ring` (+ separación de 2 px en botones); visible siempre con teclado |
| Cargando | botón: giro + `aria-busy`; pantalla: `loading.tsx` con la forma de la pantalla (`esqueleto.tsx`, `Skeleton` de shadcn) |
| Deshabilitado | `n-100` / `n-600`, cursor no permitido; bloqueado por plan: `aria-disabled` + aviso |
| Vacío | tarjeta con ícono de lucide en círculo `muted`, una frase de qué es y **una** acción (`empty-state-01…08`; Mobbin `app-cartilla`, `panel-reportes`) |
| Error | `<Alert variante="error">` arriba y `AccionesFormulario` junto al botón (los dos); el mensaje dice qué falta y enlaza a donde se resuelve |
| Éxito | `AccionesFormulario exito` junto al botón; el registro se repinta con lo que devolvió la acción (`useRegistroVivo`) |

### Chips de estado (`Chip`, `insignias.ts`)
- Fondo suave + texto oscuro de la familia + punto. **Un solo código de color por estado en toda la app** (agenda, lista y detalle; `ETIQUETA_ESTADO`/`ESTILO_ESTADO`).

### Alerta (`Alert`)
- `rounded-lg`, borde de la familia, fondo suave, ícono de lucide (CircleCheck, CircleX, TriangleAlert, Info) en el tono oscuro. Base: `components/alert/alert-*`.

## 5. Patrón por pantalla (bloque base + referencia)

| Pantalla | Bloque de shadcn/studio | Referencia Mobbin |
|---|---|---|
| Armazón del panel | `dashboard-shell-01`, `application-shell-06` | `panel-navegacion` |
| Recepción / tablero del día | `statistics-component-*`, `widget-component-*`, `dashboard-shell-01` | `panel-recepcion-tablero-del-dia` (Jobber, Fresha) |
| Agenda de estética | `user-schedule-01/02`, `card-nav-*` | `panel-agenda`, `panel-estetica` (Fresha) |
| Hotel y guardería | `timeline-component-*`, `statistics-component-*` | `panel-hotel-guarderia` (Turo, Workable) |
| Veterinaria y expediente | `account-settings-*` (columnas), `dashboard-dialog-*` | `panel-veterinaria-expediente` (Heidi) |
| Clientes y mascotas | `data-table-*`, `category-filter-*` | `panel-clientes-mascotas` (Attio, HubSpot, Stripe) |
| Caja y cobros | `checkout-page-*`, `order-summary-*` | `panel-caja-cobros` (Fresha, Square) |
| Contratos | `file-upload-*`, `form-layout-*` | `panel-contratos` (Contractbook, Dropbox) |
| Inventario | `data-table-*`, `product-list-*` | `panel-inventario` (Shopify, Square) |
| Reportes | `chart-component-*`, `statistics-component-*` | `panel-reportes` (Fresha, HoneyBook) |
| Ajustes | `account-settings-*` | `panel-ajustes` (Stripe, Whop) |
| Equipo y permisos | `data-table-*`, `dashboard-dialog-*` | `panel-equipo-permisos` (Bonsai, Shopify) |
| Alta y bienvenida | `multi-step-form-*`, `onboarding-feed-*`, `register-*` | `panel-alta-bienvenida` (Jobber, HoneyBook) |
| App de dueños | `card-nav-*`, `empty-state-*`, `gift-card-*` (QR) | `app-*` (Fi, Fresha, Citizen, Careem) |
| Portal | `card-nav-*`, `timeline-component-*` | `portal-cliente` |
| Landing | `hero-section-*`, `features-section-*`, `testimonials-component-*`, `faq-component-*`, `footer-component-*` | `landing` (Square, Podia) |
| Planes y precios | `pricing-component-*` | `planes-precios` |
| Herramientas públicas | `form-layout-*`, `statistics-component-*` | `herramientas-publicas` |
| Ayuda | `faq-component-*`, `blog-component-*` | `ayuda` (Intercom, Navan) |

## 6. Lo que no cambia con el diseño

Datos, reglas de negocio, permisos por pantalla (`ZONAS`, `puedeAbrir`), pintar desde el registro final, botones con tope, bloqueo de escritura, `TablaResponsiva` en celular, el español de México, «cotización»/«link» solo en la landing, y las auditorías (`celular-390-dev`, `ux-jerarquia-dev`, `ux-respuesta-dev`, `permisos-pantalla-dev`, `acciones-pantalla-dev`, `tiempo-panel-dev`). Una auditoría se ajusta solo cuando un cambio de diseño legítimo la rompe (y se dice en el commit), nunca para tapar un error.

## 7. App nativa para dueños (apps/duenos-movil, 3 de noviembre de 2026)

La app de PeluDesk para dueños es nativa (Expo SDK 58, React Native, expo-router). No usa Tailwind ni shadcn: tiene sus tokens en `apps/duenos-movil/src/tema/tokens.ts` y sus componentes en `apps/duenos-movil/src/componentes/`. La marca es la misma (morado, menta, coral, crema y Outfit); el lenguaje es el de una app de consumo, no el del panel.

### 7.1 Reglas que no se rompen
- **Patrones de cada plataforma**: barra de pestañas inferior nativa (`NativeTabs`: Liquid Glass en iOS, Material en Android), pila con gesto de regreso (y el gesto predictivo de Android), hojas inferiores, cámara, galería, ubicación y notificaciones con los permisos del sistema, selector de fecha del sistema, hoja de acciones en iOS y diálogo en Android, y háptica (selección en chips y pestañas, impacto en botones, éxito o error al guardar).
- **Prohibido**: etiquetas en mayúsculas con letras separadas, títulos de pantalla gigantes (el título lo pone la barra nativa a 17, seminegrita), y pantallas hechas de tarjetas iguales de puro texto. Cada pantalla mezcla foto o mapa, una lista nativa y, cuando hace falta, una cifra que manda.
- **Iconos nativos de cada sistema**: SF Symbols en iOS y Material Symbols en Android, por pares (`ICONOS` en `componentes/icono.tsx`, `expo-symbols`). Nunca un ícono dibujado a mano.
- Una pantalla nueva parte de una referencia de Mobbin de apps nativas de consumo (iOS) y, si existe, de la nota de `C:\ui-library\mobbin\peludesk\app-*`.

### 7.2 Tokens (claro / oscuro)
| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `fondo` | `#FAF7F2` | `#131117` | Fondo de pantalla (cálido) |
| `superficie` | `#FFFFFF` | `#1D1A22` | Listas agrupadas, tarjetas, hoja |
| `superficieAlta` | `#F2EEE7` | `#29252F` | Segmentos, esqueletos, botón de ícono |
| `texto` / `textoSuave` / `textoTenue` | `#221F2B` / `#625C6B` / `#857E8D` | `#F4F1F8` / `#B5AFBE` / `#8F8999` | Texto principal, secundario, pie |
| `linea` | `#E7E1D8` | `#35303D` | Separadores (hairline) |
| `primario` / `primarioSuave` / `sobrePrimario` | `#4B3F72` / `#ECE8F5` / `#FFFFFF` | `#B9ABF0` / `#2E2748` / `#1B1530` | Acción principal, selección |
| `exito`, `peligro`, `aviso` (+ `…Suave`) | `#1F6B57`, `#B23C31`, `#8A5400` | `#7FD1B5`, `#F4978E`, `#F5B85C` | Estados |
| `coloresLugar` | veterinaria `#D2483E`, urgencias `#B0161F`, estética `#8C5AD6`, guardería `#E0861A`, hotel `#2B7A99`, pet friendly `#2E8B57`, tienda `#7A5A48`, PeluDesk `#4B3F72` | = | Pines del mapa y chips |

Espacio: 4, 8, 12, 16, 20, 24, 32. Radios: control 12, tarjeta 18, hoja 28, pastilla. Sombra difusa (14 de radio, 12 % de opacidad; elevación 4 en Android).

### 7.3 Tipografía (Outfit, `@expo-google-fonts/outfit`)
| Estilo | Tamaño | Peso | Uso |
|---|---|---|---|
| `titulo` | 22/28 | 600 | Nombre de la mascota, título de un resultado |
| `encabezado` | 17/22 | 600 | Título de grupo o de hoja (igual que la barra nativa) |
| `cuerpo` / `cuerpoFuerte` | 16/22 | 400 / 500 | Texto y título de fila |
| `secundario` | 14/20 | 400 | Detalle de fila, ayudas |
| `pie` | 12/16 | 500 | Insignias, atribuciones (sin mayúsculas forzadas) |
| `cifra` | 28/32 | 600, números tabulares | Peso, saldo, pases |

El texto respeta el tamaño de letra del sistema hasta 1.6×.

### 7.4 Componentes (`apps/duenos-movil/src/componentes`)
| Componente | Qué es |
|---|---|
| `Pantalla` | Desplazable con «jalar para actualizar», esqueleto de la primera carga, error con «Reintentar» y barra fija de acción (`pie`) |
| `Grupo` + `Fila` | Lista agrupada nativa (Ajustes de iOS, listas de Material): ícono o foto, título, detalle, insignia y chevrón |
| `Boton` | Pastilla de 52 (40 compacta); primario, secundario, texto, peligro; háptica y «Un momento…» con spinner |
| `BotonIcono`, `Chip`, `Segmentos`, `Insignia` | Botón redondo, filtro con ícono, selector de 2–3 opciones, estado |
| `AvatarMascota` | Foto redondeada o inicial sobre un color que sale de su nombre |
| `Mensaje`, `Vacio`, `Esqueleto` | Aviso en línea, estado vacío con ícono y una acción, forma de la pantalla mientras carga |
| `Campo`, `CampoFecha` | Texto y fecha con el selector del sistema |
| `HojaInferior` | Hoja deslizable sobre el mapa (asomada, media, casi completa), con gesto nativo y resorte |
| `Mapa` + `Pin` | Apple Maps en iOS, Google Maps en Android; pin de color por tipo, el de PeluDesk con anillo, el elegido crece |
| `PadFirma` | Firma con el dedo (SVG) que se entrega como PNG |
| `TarjetaAlerta` | Foto grande, tipo con su color, estado, distancia y hace cuánto |

### 7.5 Referencias por pantalla
| Pantalla | Referencia de Mobbin |
|---|---|
| Entrar | X y Cash App (teléfono con lada grande, un botón ancho); nota `app-entrada-whatsapp` |
| Mis mascotas | Fi (mascota arriba, resumen en mosaicos) y Finch (perfil de mascota) |
| Cartilla y leer con cámara | Bevel (registro médico), Fi (cartilla); nota `app-cartilla` |
| Pedir cita y reservar | Fresha (tira de días, horas grandes), nota `app-reservar-fecha-cupo` |
| Por pagar | BlaBlaCar (el monto en el botón), nota `app-pagar` |
| Placa con QR | nota `app-perfil-publico-qr` |
| Mascota perdida y Alertas | Citizen y Nextdoor (nota `app-mascota-perdida`); Yubo y Agoda (reportar con foto) |
| Cerca de mí | TikTok «Places in this area» y Fresha (chips sobre el mapa, hoja con la lista), Apple Maps (ficha) |
| Ajustar el pin de una alerta | Waymo «Adjust drop-off» (pin fijo al centro, se mueve el mapa) |
