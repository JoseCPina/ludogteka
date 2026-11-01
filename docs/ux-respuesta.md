# UX del panel: jerarquía de botones y enlaces, y respuesta inmediata

Tanda del 1 de noviembre de 2026 (rama `ux/respuesta-y-jerarquia`). Dos frentes: que un botón y un enlace se distingan a simple vista, y que todo lo que se toca responda en el instante aunque el servidor tarde. La regla de la tanda: cada problema se reprodujo en desarrollo con Playwright, se corrigió en el componente compartido y quedó una auditoría que lo detecta en todo el panel.

## El sistema

| Qué | Componente | Cómo se ve | Cuándo |
| --- | --- | --- | --- |
| Acción principal | `<Button variante="primario">` | relleno morado | guardar, registrar, cobrar |
| Acción secundaria | `<Button variante="secundario">` | blanco con borde | cancelar, quitar, copiar, abrir un formulario |
| Acción destructiva | `<Button variante="peligro">` | relleno coral oscuro | borrar, anular, cancelar algo |
| Navegar | `<Enlace>` (`src/components/ui/enlace.tsx`) | morado, subrayado al pasar; `enTexto` siempre subrayado | todo lo que lleva a otra pantalla |
| Tarjeta o renglón que navega | `<Enlace forma="bloque">` | la forma la pone la tarjeta | Llegan hoy, agenda, listas |
| Pestaña o filtro que navega | `<EnlacePestana activo>` | píldora (filtro) o subrayado inferior (pestaña) | Día/Semana, estados, vistas |
| Prender, elegir, desplegar en pantalla | `<Alternar>` | la de la opción | selección de fotos, días, plan, sugerencias |
| Botón de un `<form action>` de servidor | `<BotonEnviar>` | un `<Button>` | Salir |

Todos llevan cursor de mano, hover, foco visible (anillo morado) y 44 px de área táctil (48 el botón normal, 44 `tamano="compacto"`; un enlace dentro de una frase está exento, WCAG 2.5.8). Se quitó la variante «éxito» (menta): dos rellenos peleaban por ser la acción principal. El gris secundario `--color-n-500` pasó de `#7b7580` (4.47:1) a `#716b76` (4.5:1 sobre blanco, n-50 y n-100). La paleta y el logo no cambiaron.

### Respuesta inmediata

- **Botones**: `Button cargando` deshabilita, marca `aria-busy` y enseña el giro en el mismo toque; con `textoCargando` cambia el texto («Guardando…»). A los 3 s dice «Sigue trabajando…» (`useLento`, también en `<Alternar cargando>`). `FormularioAccion` y `BotonAccion` dicen «Guardando…» y, si el guardado manda a otra pantalla, siguen ocupados con «Abriendo…» hasta que llega (`useTransition` alrededor del `router.push`). El tope de un solo envío es el de siempre (`useEspera`).
- **Enlaces**: todo enlace interno pasa por `<EnlacePrecarga>`, que mete una marca dentro del `<Link>` (`useLinkStatus`) y pone `data-pendiente="si"` + `aria-busy` en el `<a>`: se atenúa y enseña su giro (`.marca-pendiente`, `globals.css`). En `onNavigate` (solo cuando Next de verdad navega) abre una navegación en `src/lib/ui/navegacion-pendiente.ts`; `<BarraNavegacion>` (en `StaffShell`) pinta una barra morada de 3 px arriba si la navegación pasa de 150 ms. La cierran el enlace cuando su estado pendiente se apaga, el cambio de ruta y un tope de 20 s: nunca se queda colgada.
- **Doble toque**: el enlace ignora un segundo toque mientras navega (`preventDefault` antes de que Next lo vea). El botón ya estaba cubierto por el tope y queda comprobado.
- **Esqueletos**: `loading.tsx` con la forma de su pantalla (`src/components/ui/esqueleto.tsx`) en Recepción, Hotel, Guardería, Estética (agenda), Clientes, Caja y Reportes.

## Lo que se corrigió

Contado contra `main`, en el panel (`src/app/(staff)` y los componentes que usa):

- 75 `<button>` sueltos → `<Button>`, `<Alternar>` o `<BotonEnviar>`.
- 409 `<Link>` y 40 `<a>` sueltos → `<Enlace>` (texto, en texto o bloque) o `<EnlacePestana>`; 22 `<EnlacePrecarga>` usados directo → `<Enlace>`.
- 75 enlaces que envolvían un `<Button>` (HTML inválido y «enlace con forma de botón»): Check-in, Check-out, Nueva reserva, Nueva cita de estética, Agendar, Venta rápida, Turno y arqueo, Conciliación, Reembolsos, Nuevo servicio, Nuevo empleado, Proveedores, etc.
- 35 enlaces con forma de botón y 41 clases que dejaban controles de menos de 44 px.
- Botones que parecían texto («Quitar», «Corregir», «Anular», «+ Otro medicamento», «Usar distancia guardada»…) → `secundario compacto`.

Conversión: un codemod con el compilador de TypeScript (clasifica por la clase de cada enlace en texto, bloque o «era botón») y revisión a mano de 87 casos con clase dinámica (pestañas, filtros, tarjetas condicionales, el menú, el buscador y el selector de raza).

## Medición: toque → primer cambio visible

`node scripts/auditoria/ux-respuesta-dev.mjs --medir` (recepción en Huellitas, `next start` en desarrollo, sin retener nada; mediana y máximo). Antes = `main` sin cambios; después = esta rama.

| Pantalla | Control | Antes (mediana / máx) | Después (mediana / máx) |
| --- | --- | --- | --- |
| /recepcion | 16 enlaces | 1,381 ms / 8,776 ms | 2 ms / 3 ms |
| /recepcion | acciones (Marcar hecho, entregado…) | 21 ms / 25 ms | 26 ms / 26 ms |
| /hotel | 5 enlaces | 1,833 ms / 9,990 ms | 2 ms / 3 ms |

Antes, un enlace no daba ninguna señal hasta que la pantalla siguiente terminaba de cargar (el primer cambio visible ERA la llegada). Además, con los esqueletos la pantalla destino cambia de URL antes: mediana de llegada 1,381 → 471 ms en Recepción y 1,833 → 345 ms en Hotel. Doble toque antes: **2 navegaciones** por cada enlace (16 de 16 en Recepción, 5 de 5 en Hotel); después, 1.

## Auditorías

- `scripts/auditoria/ux-jerarquia-dev.mjs`: con los perfiles de permisos-pantalla (admin, recepción, encargada, estética, médico; todos los módulos prendidos mientras corre) recorre el panel y falla con un `<button>`/`<a>` sin `data-ui`, un botón de envío sin tope, un enlace interno sin estado pendiente, un control de menos de 44 × 44 px o un texto con contraste menor a 4.5:1 (lo decorativo `aria-hidden` y el logotipo están exentos). Resultado final: 350 pantallas, 33,570 controles, 0 hallazgos.
- `scripts/auditoria/ux-respuesta-dev.mjs`: toca dos veces (80 ms entre toques) cada acción primaria y cada enlace de navegación (uno por destino; el menú, tres por rol) con la navegación retenida 1.2 s y la escritura retenida 3.5 s y cortada (nada llega a la base). Falla si no hay estado pendiente o `aria-busy` antes de 100 ms, si el doble toque duplica, si a los 3 s el botón no dice «Sigue trabajando…» o si la barra sigue visible después de llegar. Resultado final: 0 hallazgos (las 30 primeras pantallas de cada rol; dos avisos de pantallas que en desarrollo tardan más de 30 s).
- Hallazgos que se corrigieron en el camino: «Salir» sin tope (`BotonEnviar`), «Instalar la app» y la firma de PeluDesk fuera del sistema, gris secundario a 4.47:1, tarjetas de 42 px, flechas ↑/↓ de 43 px, las opciones de «¿Con qué cobras?» sin «Sigue trabajando…».
- **Despliegue**: `celular-390-dev`, `ux-jerarquia-dev` y `ux-respuesta-dev` dejan, al pasar completas, un sello con la huella de `src/` (`scripts/auditoria/lib/sello-pantalla.mjs`); `npm run desplegar` no sigue si a alguna le falta el sello del `src/` que se despliega.

## Pendiente

- Las pantallas del portal del dueño, la app para dueños (`/app`), `/plataforma` y el sitio público no entraron en esta tanda (sus componentes no se convirtieron).
- `ux-respuesta-dev` prueba las primeras 30 pantallas de cada rol (con el freno por destino y por texto ya no aparece nada nuevo después); `--max` la amplía.
- Los videos tutoriales de las pantallas que cambiaron de aspecto quedan marcados «por actualizar» por `npm run desplegar`.
