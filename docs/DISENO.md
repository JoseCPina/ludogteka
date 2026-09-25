# Sistema visual — PeluDesk

Diseño base de toda la app (25 de septiembre de 2026). Fuente: el kit gráfico de PeluDesk en `marca-peludesk/` (láminas 01 identidad, 02 logo, 03 sistema gráfico, 04 UI kit; carpeta de Drive del dueño). Contexto que manda sobre lo bonito: recepción de un negocio canino, de pie, con prisa, a veces en tablet o en el celular. Legibilidad y botones grandes primero. Un solo tema (claro).

Los tokens viven en `src/app/globals.css` (`@theme`). **Todo par de texto sobre fondo está verificado con la fórmula de WCAG, no supuesto:** `node scripts/diseno/contraste.mjs` (sale con 1 si alguno no llega). Un color nuevo o una combinación nueva de texto sobre fondo se agrega a ese script antes de usarse.

## Qué lleva la marca PeluDesk y qué la del negocio

| Superficie | Marca |
|---|---|
| La plataforma (peludesk.mx, `/plataforma`), la pantalla de un dominio sin negocio (`/negocio-no-encontrado`) | **PeluDesk**: `LogoPeluDesk`, favicons de PeluDesk |
| El diseño base de toda la app (paleta, letra, componentes) | **PeluDesk** |
| "Hecho con PeluDesk", discreto, al pie del menú del staff | **PeluDesk** (el cliente no lo ve) |
| Encabezado del staff, portal de clientes, login, alta por link, sin acceso | **El negocio** (`MarcaDelNegocio`, `EncabezadoNegocio`), encima del diseño base |
| Su landing, su favicon | **El negocio** (`negocios.landing`, `negocios.marca.favicon`) |
| Contratos en PDF | Sin marca (ni de PeluDesk ni del negocio): documento legal, no se tocó |

**El dueño de un perro ve a su guardería, no a PeluDesk.** La landing de Ludogteka con el tema de la camioneta (`src/components/landing/`, Nunito + Fredoka, sus colores `--lp-*`) queda fuera de este sistema y no se toca.

La marca del negocio sale de `negocios.marca` (la edita la plataforma, `/plataforma/negocios/<id>`):
- `logo`: imagen (ruta del sitio o https);
- `logo_texto` + `logo_fuente`: logotipo de palabras con color (el de Ludogteka: "lu·dog·teka", índigo/naranja, Fredoka);
- sin logo: su inicial sobre `color`, y su nombre;
- `favicon`: su ícono; sin él, `/icono-negocio` lo arma con su inicial y su color.

## Logo de PeluDesk

`public/marca/peludesk/isotipo.svg` es **la única fuente** del isotipo (el perrito de perfil con las tres huellas), redibujado en vector a partir de la lámina 02: los PNG del kit son recortes rasterizados de las láminas (orillas crema, cortes) y no sirven a cualquier tamaño. Los favicons (16, 32, 48, 180, 512 y `favicon.ico`) salen de ahí: `node scripts/diseno/favicons-peludesk.mjs`. El nombre va en Outfit: "pelu" en morado, "desk" en `#6FC3A9` (el menta más saturado del logotipo, medido en la lámina; es solo del logo, un logotipo no está sujeto a las reglas de contraste de texto). Sobre fondo morado: "pelu" en crema y "desk" en menta. Nunca estirar, recolorear, rotar ni poner sobre fotos (lámina 02, usos incorrectos).

## Paleta

| Token | Hex | Rol |
|---|---|---|
| `morado` | `#4B3F72` | Deep purple. Primario: botones principales, links, foco, títulos de marca. **Sí lleva texto blanco (9.32:1).** |
| `menta` | `#A7D8C8` | Mint. Secundario: botón de acción positiva (con texto **morado**, 5.90:1), fondos, íconos, ilustración. |
| `coral` | `#F28C82` | Soft coral. Acento: puntos, íconos, decoración. |
| `ambar` | `#F5B85C` | Aviso cálido del kit ("En proceso", "Recuerda"). |
| `crema` / `n-50` | `#FFF8EE` | Cream. Fondo de página. |
| `grafito` / `n-900` | `#2B2A33` | Graphite. Texto principal. |

### Por qué hay variantes oscuras

| Par | Ratio | Veredicto |
|---|---|---|
| Blanco sobre menta | 1.58 | Falla |
| Blanco sobre coral | 2.37 | Falla |
| Blanco sobre ámbar | 1.77 | Falla |
| Menta como texto sobre blanco | 1.58 | Falla |
| Coral como texto sobre blanco | 2.37 | Falla |

**Menta, coral y ámbar no llevan texto encima ni son color de texto.** Para texto, botón sólido con texto blanco o chip, va su variante oscura:

| Token | Hex | Uso | Verificado |
|---|---|---|---|
| `morado-oscuro` | `#3A3059` | Hover del primario | blanco 12.02 |
| `menta-oscuro` | `#1F6B57` | Texto de éxito, botón de éxito sólido | blanco 6.37 · sobre crema 6.04 |
| `menta-hover` | `#8ECBB7` | Hover del botón menta (texto morado) | morado 5.05 |
| `coral-oscuro` | `#B23C31` | Texto de error, botón destructivo | blanco 5.86 · sobre crema 5.56 |
| `coral-hondo` | `#962F26` | Hover del destructivo | blanco 7.69 |
| `ambar-oscuro` | `#8A5400` | Texto de advertencia | sobre crema 5.95 |

### Fondos suaves (chips y alertas)

| Token | Hex | Texto encima |
|---|---|---|
| `menta-suave` | `#E3F3ED` | `menta-oscuro` 5.55 |
| `coral-suave` | `#FDE8E5` | `coral-oscuro` 4.98 |
| `ambar-suave` | `#FDF0D9` | `ambar-oscuro` 5.57 |
| `morado-suave` | `#ECE8F5` | `morado` 7.73 |

El cuerpo de una alerta va en `n-700` sobre cualquiera de estos fondos (≥ 8.1).

## Neutros

Rampa cálida del grafito a la crema (la familia de la marca, no gris de banco). Cada paso tiene un rol fijo; nunca dos pasos vecinos para texto sobre fondo.

| Paso | Hex | Uso | Sobre blanco / crema |
|---|---|---|---|
| 0 | `#FFFFFF` | Superficies (tarjetas, inputs, barras) | — |
| 50 | `#FFF8EE` | Fondo de página (crema) | — |
| 100 | `#F6EFE5` | Superficie alterna, hover de fila, chip neutro | — |
| 200 | `#EBE3D8` | Bordes sutiles y separadores | — |
| 300 | `#D9D1C6` | Bordes de contenedor | — |
| 400 | `#ABA49F` | **Solo decorativo**: placeholder, deshabilitado. Nunca texto. | 2.5 |
| 500 | `#7B7580` | Texto grande, íconos | 4.47 / 4.24 |
| 600 | `#5E5968` | Texto secundario de lectura | 6.76 / 6.41 |
| 700 | `#46424F` | Labels, texto enfatizado | 9.76 / 9.25 |
| 800 | `#35323E` | Headings grandes | — |
| 900 | `#2B2A33` | Texto principal (grafito) | 14.17 / 13.44 |
| `borde` | `#948D98` | Borde de input, select y botón fantasma: el más claro que da 3:1 (WCAG 1.4.11) | 3.22 / 3.05 |

## Tipografía

**Outfit** (la del UI kit), cargada con `next/font/google` en el layout raíz, pesos 400–800. Jerarquía por peso y tamaño, una sola familia.

| Rol | Tamaño | Peso |
|---|---|---|
| H1 | 32px / 40 | 700 |
| H2 | 24px / 32 | 700 |
| H3 | 20px / 28 | 600 |
| Texto | 16–18px / 24 | 400 |
| Label | 14px / 20 | 500 |
| Dato / caption | 13–14px / 20 | 400–500, `tabular-nums` en montos, horas, teléfonos y folios |

La landing de Ludogteka conserva su Nunito y su Fredoka (las carga su propia página).

## Forma

Radios: `sm` 10px · `md` 12px (controles: botones, inputs, chips grandes) · `lg` 18px (tarjetas, alertas). Chips y píldoras: redondo completo. Espaciado en la escala `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`.

## Componentes (como la lámina 04)

### Botones (`src/components/ui/button.tsx`)
- Alto mínimo 48px, texto 16px/600, radio 12px, spinner con `cargando` (nunca un texto quieto).
- **Primario**: morado con texto blanco; hover morado-oscuro.
- **Éxito** (el secundario menta del kit, "Nuevo cliente"): menta con texto **morado**; hover menta-hover.
- **Secundario** (el "ghost" del kit): blanco, borde `borde`, texto grafito.
- **Peligro**: coral-oscuro con texto blanco (el coral del kit no aguanta texto blanco).
- Foco visible siempre: anillo morado de 3px.

### Inputs, selects, textareas
- Label arriba siempre (nunca placeholder como label), 14px/500.
- Alto mínimo 48px, fondo blanco, borde 1.5px `borde`, radio 12px.
- Foco: borde morado + halo morado-suave.
- Error: borde coral-oscuro + fondo coral-suave + mensaje específico debajo.

### Alertas (`src/components/ui/alert.tsx`)
Fondo suave de la familia, borde fino del tono base y un ícono en círculo del tono **oscuro** con el símbolo blanco (en el tono base no llegaría al 3:1 de un gráfico). Variantes: éxito (menta), error (coral), advertencia (ámbar), información (morado).

### Chips de estado (`src/components/ui/chip.tsx`)
Fondo suave + texto oscuro de la misma familia + un punto; el estado lo dice el texto, nunca solo el color. Tonos: éxito/confirmada (menta), pendiente (coral), en proceso (ámbar), información (morado), neutro/cancelada.

### Tablas
Encabezado en `n-100` con texto `n-600` pequeño; filas con separador `n-200` y hover `n-50`; estado con chip; columnas numéricas `tabular-nums` a la derecha; contenedor con su propio `overflow-x: auto`.

### Tarjetas
Blanco sobre crema, borde `n-200`, radio 18px, sombra mínima o ninguna.

### Íconos (`src/components/iconos-nav.tsx`)
Estilo de la iconografía del kit: bicolor morado + menta (coral de acento), formas llenas y redondeadas, 22–24px, siempre junto a su etiqueta (decorativos). En SVG: los PNG del kit son recortes de 400px con el fondo de la lámina.

### Navegación del staff
Barra lateral blanca con íconos; la sección activa en píldora morado-suave con texto morado (como el tablero del kit); "Hecho con PeluDesk" al pie. Arriba, la marca del negocio.

## Modo oscuro

No implementado, por decisión: un solo tema claro, consistente entre turnos y dispositivos.
