# Revertir operaciones: «Deshacer» y «Corregir»

> Cuándo leerlo: al tocar cualquier operación del panel que cambia estado o dinero (check-in, check-out, «no llegó», cancelaciones, finalizar cita, cargos, ventas, cuentas canceladas, devoluciones), el componente `Deshacer`, la bitácora `operaciones_revertidas` o el permiso «Deshacer operaciones». Migración `20261203004300` (5 de noviembre de 2026, rama `fix/revertir-operaciones`).

## La regla

Toda operación tiene «Deshacer» o su acción inversa, con **motivo obligatorio** (5 letras o más), **permiso** («Deshacer operaciones», clave `revertir_operaciones`: admin siempre, recepción solo si se le da; lo que ya tenía su propio permiso lo conserva: anular cobros, devoluciones, editar montos), **bitácora** (`operaciones_revertidas`: quién, cuándo, motivo, cómo estaba antes, cómo quedó y los efectos encadenados; inmutable; la enseña la cuenta en «Operaciones deshechas en esta cuenta» vía `operaciones_revertidas_de_reserva`) y **efectos encadenados** (pase, cupo, cuenta, correcciones de precio, inventario). Lo que ya movió dinero no se borra: un cobro se anula (`anular_cobro`), una devolución se anula con su rastro, una factura va por nota de crédito.

En pantalla: lo hecho hace menos de **24 horas** sale como botón «Deshacer …» en el detalle (`esReciente`, `src/lib/operaciones/reversion.ts`); lo más viejo, dentro del menú **Corregir**, que abre la operación inversa. Componente `src/components/operaciones/deshacer.tsx` (motivo + confirmación; `revertirOperacion` en `src/app/(staff)/operaciones/revertir-actions.ts` devuelve el registro final). Quien no tiene el permiso no ve el botón (`puedeRevertir` lo pasa cada página con `tienePermiso(sesion, "revertir_operaciones")`).

En la base: las funciones `revertir_*` / `reabrir_*` prenden la puerta `app.revertir` para las transiciones de regreso (`transicion_estado_reserva_valida`: en_curso→reservada/cancelada, finalizada→en_curso, no_llego/cancelada→reservada), para que los disparadores de horario y sobrecupo del check-in no vuelvan a preguntar, para reactivar un cargo (`marcar_cargo_cancelado`) y para marcar «reabierta» una cancelación de cuenta (`cuentas_canceladas_inmutable`). Nada más la prende. «No llegó» ahora deja quién y cuándo (`cancelada_por`, `cancelada_at`), como cancelar.

## Inventario: antes y después

| Operación | Antes (main, 5 nov 2026) | Después | Rastro |
| --- | --- | --- | --- |
| Check-in (estancia, walk-in) | Solo se deshacía si usó pase (`deshacer_checkin_estancia`, permiso «Ajustar días de pases»); sin pase, nada | `revertir_checkin_estancia(estancia, motivo, destino)`: vuelve a «reservada» (la reserva sigue con su lugar y su pase) o, si fue un walk-in por error, se cancela (libera el lugar y el día del pase regresa). «Deshacer el check-in» en la reserva y al terminar el check-in | bitácora con el check-in guardado (quién entregó, hora, foto) |
| Check-out | No había | `revertir_checkout_estancia`: vuelve a «en curso», la cuenta se reabre, la corrección «Salida anticipada» se anula. «Deshacer la salida» en la reserva y al terminar la salida | bitácora con quién recogió y la hora |
| «No llegó» (estancia) | No había; no dejaba quién; no devolvía el día del pase y dejaba «saldo a favor» fantasma (migración `20261203004200` arregla el pase y la cuenta) | `reabrir_estancia`: vuelve a «reservada», revisa cupo si la fecha no pasó, vuelve a descontar el día del pase que se devolvió, regresa las correcciones de precio anuladas en automático; el saldo a favor desaparece. Luego check-in tardío normal | `cancelada_por/at` + bitácora |
| Cancelar estancia / reserva | No había (solo quedaba `cancelada_por/at/motivo`) | `reabrir_estancia` (igual que «no llegó») | bitácora |
| Confirmar estancia | No hay regreso a «reservada» (no cambia dinero ni cupo; se deja) | Igual | `registro_ediciones` |
| Mover fechas / extender salida | Se vuelve a mover | Igual | `registro_ediciones` |
| Iniciar cita | `deshacer_inicio_cita` (sin cobro ni consumo) | Igual | `citas_estetica_cambios` |
| Finalizar cita | No había | `revertir_finalizacion_cita`: vuelve a «en curso», el consumo de inventario regresa (ajuste positivo con motivo), lo cobrado sigue cobrado. «Deshacer la finalización» en la cita | bitácora + `citas_estetica_cambios` (`reversion`) + `movimientos_inventario` |
| Cancelar cita / «No se presentó» / Eliminar cita | No había (quedaba el historial) | `reabrir_cita`: vuelve a «reservada» en su hora (si la hora ya la tomó otra cita, la base lo dice); una eliminada se restaura; sus correcciones de precio regresan. «Reabrir la cita» / «Deshacer "no se presentó"» en la cita | bitácora + historial de la cita |
| Reprogramar cita | Se vuelve a reprogramar | Igual | `citas_estetica_cambios` |
| Consulta veterinaria (iniciar / firmar) | `vet_consulta_descartar` (borrador) y `vet_consulta_anular` (firmada, no regresa a borrador) | Igual (no se tocó) | `anulada_*` |
| Hospitalización (ingreso / alta) | No hay inversa | Igual (fuera de esta tanda: se anota) | — |
| Cobro / abono | `anular_cobro` (permiso «Anular cobros»; con turno cerrado, ajuste posterior al corte) | Igual; «des-anular» = registrar de nuevo | `cobro_correcciones`, `anulado_*` |
| Editar monto de cobro | Se vuelve a editar | Igual | `cobro_correcciones` |
| Devolución | No había | `anular_devolucion`: deja de sumar en caja, cuenta y reportes (solo mientras su turno siga abierto; con el corte hecho se corrige con un cobro nuevo). «Anular la devolución» junto a la devolución en la cuenta | `devoluciones.deleted_at` + `anulada_por/motivo` + bitácora; todas las funciones que suman devoluciones filtran `deleted_at` |
| Aplicar pase a estancia / consumir pase | Cancelar el ítem o deshacer check-in | Igual (lo devuelve cancelar o «no llegó»; `reabrir_estancia` lo vuelve a aplicar) | `movimientos_bono` |
| Ajustar días de pase | Otro ajuste | Igual | `bonos_ajustes` |
| Corregir precio | `anular_correccion_precio` | Igual; además una corrección muere con su línea y regresa con ella | `cuenta_ajustes_precio` |
| Aplicar cargo → cancelar cargo | Un cargo cancelado no se reactivaba (había que aplicar otro) | `reactivar_cargo`: vuelve a sumar (si era de un servicio extra, se vuelve a agregar el extra). «Reactivar el cargo» en el cargo cancelado | bitácora |
| Servicio extra | `extra_cancelar` | Igual (se vuelve a agregar) | `cancelado_*` |
| Descuento / cortesía | Se cancela; uno cancelado se vuelve a aplicar | Igual | `cancelado_*` |
| Venta rápida → quitar renglón | No se reactivaba | `reactivar_venta_mostrador`: vuelve a sumar y descuenta el inventario otra vez. «Reactivar el renglón» en la cuenta | bitácora + `movimientos_inventario` |
| Cancelar cuenta | No había (`cuentas_canceladas` inmutable) | `reabrir_cuenta`: vuelve a «por cobrar»; las citas/estancias que se cancelaron con ella se regresan una por una. «Reabrir la cuenta» en el aviso de cuenta cancelada | `cuentas_canceladas.deleted_at` + `reabierta_*` + bitácora; todas las funciones que preguntan «¿está cancelada?» filtran `deleted_at` |
| Retiro de caja / efectivo agregado | `cancelar_retiro` / `cancelar_efectivo_agregado` (turno abierto) | Igual; la inversa de cancelar es registrar otro | `cancelado_*` |
| Cerrar turno | No hay reapertura | Igual, a propósito: el corte ciego no se reabre; una diferencia se anota en el siguiente corte | `cortes_caja` |
| Firmar contrato | `cancelar_contrato` | Igual (se vuelve a generar) | `motivo_cancelacion` |
| Baja de mascota | `perro_reactivar` (solo si quedó inactiva; sin historial se elimina de verdad) | Igual | `perros_bajas` |
| Cobro con terminal / link | Devolución por el proveedor | Igual | eventos |

## Pruebas

- `node scripts/auditoria/reversion-dev.mjs` (Huellitas): hace y deshace cada operación y compara cuenta, cupo, pase, caja y bitácora antes y después; permisos (recepción sin el permiso, estética, anónimo, otro negocio) y bitácora inmutable.
- `node scripts/auditoria/permisos-staff.mjs` incluye `revertir_operaciones`.
- `auditoria_frontera()` vacía después de la migración.

## Operación de Ludogteka que la necesita

`scripts/operacion/b2-saldos-a-favor-post-despliegue.mjs` (después de desplegar): regresa a finalizadas, con check-in tardío, las estancias que el «fresh start» del 4 de noviembre y el cierre del 31 de octubre marcaron «no llegó» aunque sí ocurrieron (Blacky 22/10, Raya y Blacky 26/10, Vincent 20–23/10), y reabre la cuenta cancelada del baño exprés de Bruno (Daniela Reyes) para registrar sus $190. Detalle en docs/OPERACIONES-PRODUCCION.md (5 de noviembre de 2026).
