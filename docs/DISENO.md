# Identidad visual — Ludogteka

Aprobado en Fase 1. Contexto de uso que determina cada decisión de aquí: recepción de un negocio canino, de pie, con prisa, a veces en tablet. Legibilidad y botones grandes por encima de lo bonito. Un solo tema (claro) — es una herramienta operativa de mostrador, no una app de consumo con horarios variables de uso; se prioriza consistencia entre turnos sobre personalización.

## Paleta de marca

Los 5 colores de marca (logo del negocio) van como acento sobre una base de neutros — nunca como relleno de áreas grandes.

| Nombre | Hex | Rol |
|---|---|---|
| Azul | `#3148DD` | Primario. Botones principales, links, foco. |
| Turquesa | `#00CDC4` | Acento secundario. Nunca como texto ni fondo de botón sólido. |
| Naranja | `#EF5025` | Destructivo / peligro. Nunca como texto ni fondo de botón sólido. |
| Amarillo | `#FFC73A` | Advertencia. Nunca como texto ni fondo de botón sólido. |
| Verde | `#2AC862` | Éxito / confirmación. Nunca como texto ni fondo de botón sólido. |
| Blanco | `#FFFFFF` | — |

Variantes brillantes — **solo para gráficas y reportes** (Fase 8+), nunca en la UI base:

| Nombre | Hex |
|---|---|
| Azul brillante | `#0B6AF8` |
| Amarillo brillante | `#F8DB1A` |
| Naranja brillante | `#FF5D02` |

### Por qué hay variantes "-oscuro"

Verificado con la fórmula de luminancia relativa de WCAG (no supuesto):

| Par | Ratio | Veredicto |
|---|---|---|
| Blanco sobre Azul | 6.77 | Pasa AA |
| Blanco sobre Naranja | 3.59 | Falla texto normal (solo texto grande ≥18.67px/negrita) |
| Blanco sobre Turquesa | 1.99 | Falla |
| Blanco sobre Amarillo | 1.56 | Falla |
| Blanco sobre Verde | 2.20 | Falla (no reportado por el cliente, encontrado al verificar) |

Turquesa, amarillo, verde y naranja **no admiten texto blanco encima ni sirven como color de texto en su tono base**. Para texto, botón sólido con texto blanco, o badge, se usa una variante oscurecida de la misma familia — todas verificadas ≥5.3:1 con blanco:

| Nombre | Hex | Uso |
|---|---|---|
| Naranja oscuro | `#A6330F` | Texto/ícono de naranja, botón destructivo sólido, badge de error |
| Amarillo oscuro | `#8A6300` | Texto/ícono de amarillo, badge de advertencia |
| Turquesa oscuro | `#0B6E68` | Texto/ícono de turquesa, badge de acento secundario |
| Verde oscuro | `#1B7A42` | Texto/ícono de verde, botón de éxito sólido, badge de confirmación |
| Azul oscuro | `#26379E` | Hover/pressed del botón primario (azul base ya pasa AA directo) |

Regla: los 5 colores base sin sufijo se reservan para fondos grandes, íconos, puntos de estado (chip dot) y bordes — nunca para texto de lectura ni fondo de botón con texto encima.

### Fondos suaves (badges, alertas)

| Nombre | Hex | Uso |
|---|---|---|
| Azul suave | `#E3E7FC` | Fondo de badge/alerta de azul (texto: azul base, 5.5:1) |
| Turquesa suave | `#DFF9F7` | Fondo de badge/alerta de turquesa (texto: turquesa oscuro) |
| Naranja suave | `#FCE4DC` | Fondo de badge/alerta de naranja (texto: naranja oscuro, 5.6:1) |
| Amarillo suave | `#FFF3D6` | Fondo de badge/alerta de amarillo (texto: amarillo oscuro) |
| Verde suave | `#E2F7E9` | Fondo de badge/alerta de verde (texto: verde oscuro, 8.2:1) |

## Neutros

Rampa de 10 pasos con sesgo azul (la misma familia del primario) — no gris de banco. "Nada de gris sobre gris" se resuelve así: cada paso tiene un rol fijo, nunca se usan dos pasos adyacentes para texto-sobre-fondo.

| Paso | Hex | Uso | Contraste vs blanco |
|---|---|---|---|
| 0 | `#FFFFFF` | Blanco puro | — |
| 50 | `#F5F6FA` | Fondo de página | — |
| 100 | `#EBEDF5` | Superficie alterna, hover de fila/tarjeta | — |
| 200 | `#DDE1ED` | Bordes y líneas sutiles (dividers, tabla) | — |
| 300 | `#C6CBDC` | Bordes de contenedor/tarjeta | — |
| 400 | `#9BA3BD` | **Solo decorativo** — placeholder, fondo deshabilitado. Nunca texto (2.51:1, falla incluso el mínimo de 3:1). | 2.51 |
| 500 | `#747C99` | Texto grande/ícono/borde de input activo (no para texto de lectura normal) | 4.13 |
| 600 | `#5C6480` | Texto secundario de lectura — pasa AA | 5.85 |
| 700 | `#454C63` | Labels fuertes, texto secundario enfatizado | 8.51 |
| 800 | `#2B2F3D` | Texto sobre superficie oscura, headings grandes | — |
| 900 | `#14161F` | Texto principal | 18.04 |

## Tipografía

Una sola familia variable: **Nunito** (redondeada, cálida, buenos números tabulares), cargada vía `next/font/google`. Jerarquía por peso/tamaño, no por segunda familia — en una herramienta de mostrador usada todo el día, un segundo font es una decisión que hay que justificar en cada pantalla nueva, y no se paga sola aquí.

| Rol | Tamaño | Peso | Otros |
|---|---|---|---|
| Título / h1 | 2.25rem (36px) | 800 | letter-spacing -0.01em, line-height 1.15 |
| Subtítulo / h2 | 1.75rem (28px) | 700 | |
| Sección / h3 | 1.25rem (20px) | 700 | |
| Texto / body | 1.125rem (18px) | 400 | tamaño base de la app — más grande que el default web de 16px, por legibilidad en tablet |
| Label | 0.875rem (14px) | 600 | uppercase, letter-spacing 0.04em |
| Meta / dato | 0.8125rem (13px) | 500 | `font-variant-numeric: tabular-nums` |

Cualquier columna con dígitos (montos, teléfonos, folios, horas) lleva `font-variant-numeric: tabular-nums`.

## Espaciado

8 pasos, sin valores sueltos fuera de esta escala:

`4px · 8px · 12px · 16px · 24px · 32px · 48px · 64px`

## Componentes

### Botones
- Alto mínimo 48px (dedo en tablet), texto 16px/600, radio 10px (`--radio-md`).
- Primario: fondo azul, texto blanco. Hover: azul oscuro.
- Secundario: fondo blanco, borde neutro-400, texto neutro-900.
- Destructivo: fondo naranja-oscuro, texto blanco.
- Éxito: fondo verde-oscuro, texto blanco.
- Deshabilitado: fondo neutro-100, texto neutro-400, `cursor: not-allowed`.
- Foco visible siempre: anillo azul de 3px, offset 2px — nunca solo cambio sutil de color.

### Inputs
- Label siempre visible arriba (nunca placeholder-como-label).
- Alto mínimo 48px, borde 1.5px neutro-400, radio 10px.
- Foco: borde azul + halo azul-suave (`box-shadow` 3px).
- Error: borde naranja-oscuro + fondo naranja-suave + mensaje específico debajo del campo (nunca solo un borde rojo sin texto).

### Tablas
- Encabezado: fondo neutro-100, texto neutro-600 uppercase pequeño.
- Fila: hover neutro-50, separador neutro-200 (línea, no grid pesado).
- Estado por chip de color (fondo suave + texto oscuro de la misma familia), nunca solo texto plano — se lee de un vistazo.
- Columnas numéricas: `tabular-nums`, alineadas a la derecha.
- Contenedor con `overflow-x: auto` propio — la página nunca scrollea horizontal.

### Estado vacío
- Ícono simple en círculo azul-suave, mensaje corto en tono cercano ("Aún no hay dueños registrados", nunca "No data found"), botón de acción primaria si aplica.

### Estados de aviso
- Error: fondo naranja-suave, borde izquierdo naranja de 4px, texto naranja-oscuro + neutro-700. Mensaje dice qué pasó y qué hacer, nunca un error técnico crudo.
- Advertencia: mismo patrón con amarillo (p. ej. vacuna por vencer).
- Éxito: mismo patrón con verde (p. ej. cliente vinculado).
- Errores de campo van pegados al input específico, no solo en un banner genérico arriba del formulario.

## Modo oscuro

No implementado por decisión — un solo tema claro, consistente entre turnos y dispositivos. Se puede agregar después si se pide explícitamente.
