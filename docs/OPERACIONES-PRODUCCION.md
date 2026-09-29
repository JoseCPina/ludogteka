# Operaciones manuales en producción

Bitácora de toda intervención hecha a mano sobre los datos de producción, fuera de la UI de la app. CLAUDE.md solo tolera esto para un caso operativo puntual, nunca para cambios de esquema, y siempre dejando constancia aquí: qué se hizo, por qué, cómo y cómo se deshace.

## 2026-09-24: baja de registros de prueba

**Por qué.** Los pidió el administrador del sistema: eran registros creados al probar la app, no clientes reales.

**Cómo.** API REST con la llave `service_role`, leída al vuelo del CLI de Supabase.

- Solo baja lógica: `deleted_at`, o `estado = cancelado` con motivo.
- Nada se borró.
- Los contratos firmados se conservan como evidencia, con su PDF en Storage.
- El motivo escrito en cada cancelación: *"Registro de prueba creado al probar la app; dado de baja a petición del administrador del sistema (24 sep 2026)."*

**Antes y después.** Se tomó una foto de los conteos del negocio real (todo lo que no es de estos tres clientes) antes y después.

- Antes: 14 clientes, 15 perros, 2 reservas, 1 contrato pendiente, 5 cuentas de staff.
- Después: lo mismo. La única diferencia es el contrato de Kaia, que pasó de pendiente a cancelado.

### Qué se hizo, por registro

#### Kaia (perro de Aaron Aguilar Canedo, cliente REAL, que no se tocó)

- Contrato general `861674a3`, pendiente de firma desde el 25 de agosto: cancelado con motivo.

#### José Carlos Piña (`3ae8e17d`)

- Perro Lucho: baja.
- Reserva `90b28ac7`, un cargo suelto "Comida especial — Tacos" de $10:
  - el cargo se canceló con motivo;
  - la reserva se dio de baja;
  - la orden de Mercado Pago de ese cargo ya estaba cancelada;
  - no había cobros.
- Contratos:
  - 2 firmados (`0c05d366`, `e6f6cf46`): se conservan;
  - 1 pendiente (`e3f559cf`, guardería): cancelado con motivo.
- 2 invitaciones (ya usadas): baja.
- Requisitos sanitarios de Lucho (1 aplicado y 2 propuestos): baja.
- Expediente del cliente: baja.
- Cuenta del portal (`jpinadev@gmail.com`, perfil `a83de437`): desactivada.

#### José Aguilar (`8a22598c`)

- Perro Emma: baja.
- Reserva `5e33c0bc`, vacía: baja.
- 1 invitación (usada): baja.
- Expediente del cliente: baja.
- Cuenta del portal (`t4444256082@telefono…`, perfil `74ae4f4f`): desactivada.

#### Ronith Navarrete (`0d53afce`): solo el expediente de CLIENTE

- Perro Greta: baja.
- Cita de estética `7e13b85c` (23 sep, $490, sin cobro): cancelada, con el motivo en sus notas, y dada de baja.
- 2 reservas (`9447cd68`, `ecd5bb62`): baja.
- Contrato firmado `49a59f57`: se conserva.
- 2 invitaciones:
  - la de guardería/hotel, que seguía abierta, se canceló;
  - las dos se dieron de baja.
- Requisitos sanitarios de Greta (4 aplicados y 4 propuestos): baja.
- Expediente del cliente: baja.
- Cuenta del portal de cliente (`t5533990976@telefono…`, perfil `f4fa12f5`): desactivada.
- Su cuenta de **admin** (`ronith.navarrete@gmail.com`, perfil `1d24ded5`) **no se tocó**. Se comprobó después: rol admin, sin baja y sin bloqueo.

### Cómo se desactivaron las cuentas del portal

- El perfil queda con `deleted_at`.
- La cuenta de Auth queda bloqueada (`ban_duration` de 100 años).
- Se le cambió el correo a `baja-<id>+<correo original>@baja.ludogteka.mx`. Así el teléfono o el correo quedan libres para un alta real futura.
- El id de la cuenta se conserva: los contratos firmados siguen apuntando a quien los firmó.

### Cómo se deshace

1. Poner `deleted_at = null` en las filas de arriba.
2. En Auth: `ban_duration: "none"` y devolverle a cada cuenta su correo original.

Los correos originales están en esta página.

## 2026-09-29: limpieza de la prueba de cobro con Mercado Pago en Ludogteka

Pedida por escrito por el dueño de PeluDesk (José Carlos Piña). Va como
migración versionada, `supabase/migrations/20260929020143_limpiar_prueba_mercadopago_ludogteka.sql`,
aplicada con `npm run desplegar -- --aplicar`: respaldo, conteos antes y
después y `auditoria_frontera()`. Tiene candados: solo corre donde existe
exactamente esta prueba, no hace nada si ya se limpió y aborta sin tocar nada
si el estado no es el esperado. Se ensayó en desarrollo con una réplica de
los mismos IDs dentro de una transacción que se deshizo, y quedó así:

| | Antes | Después |
|---|---|---|
| Saldo de la cuenta | $350 | $0 |
| Cuentas abiertas | aparece | ya no |
| Inventario | 12 | 14 (regresó lo consumido) |

Correrla dos veces no duplica nada.

### Qué fue la prueba

28 de septiembre de 2026, de 5:43 a 5:50 p.m. hora de San Luis Potosí, con
la cuenta de recepción de Dulce:

- Cliente «jose» (`4fb6ba68`, teléfono del dueño) con el perro «me» (`306f84c2`).
- Reserva `a1f811da` con un «Baño exprés» de $370 (cita `52b8d6f5`) que se
  marcó finalizada.
- Cobros de Mercado Pago en vivo, en el turno `8933562c`:
  - terminal Point: un intento rechazado y uno pagado de $10 (cobro `937907ca`);
  - link de pago de $10, pagado (cobro `e563b3b8`).
- El link generó solo el gasto «Comisión de Mercado Pago» de $5.05 (`56d41636`).

Mercado Pago ya reembolsó los dos cobros y regresó la comisión. Eso lo hizo
el dueño allá; aquí no se reembolsó nada.

### Qué hizo la limpieza

1. **Devoluciones.** Una por cobro, en el turno de los cobros (el único
   abierto de Ludogteka) y con su método: terminal $10 y transferencia $10.
   El esperado del turno en esos métodos vuelve a cero.
   - Autoriza la persona de José Carlos Piña en PeluDesk (`a83de437`), no
     el admin de Ludogteka: ella no autorizó esto, y por eso no se usó
     `registrar_devolucion()`, que pone al admin de la sesión.
2. **Gasto.** El de comisión quedó cancelado con el motivo «cobro de prueba
   devuelto; Mercado Pago regresó la comisión». No tenía retiro de caja.
3. **Cita.** Quedó cancelada, con una nota en la cita y en la reserva.
   - Sale de la cuenta: el saldo queda en 0 y desaparece de cuentas abiertas
     y de «Necesita atención».
   - Sale de la comisión: `comision_de_cita` solo cuenta finalizadas.
     Además, la estilista (Karen) no tiene expediente de empleado ni pagos
     de nómina.
   - Sale de los costos.
   - No había inventario que regresar: el «Baño exprés» no tiene receta. La
     migración igual regresa con un ajuste positivo cualquier consumo ligado
     a la cita.
4. **Bajas.** El cliente «jose» y el perro «me» quedaron dados de baja
   (`deleted_at`).

### Qué NO se tocó

- **Órdenes de Mercado Pago.** Se quedan como las dejó el proveedor; la app
  nunca cambia una orden pagada.
- **El turno abierto.** Lo cierra recepción con el conteo real.
- **Los contratos del expediente viejo «José Carlos Piña».** Los firmados
  quedan como evidencia y el cancelado ya estaba así.

### Cómo queda en los reportes

- **Caja:** cobrado $20 y devuelto $20 en el mismo turno.
- **Financiero:** el mes neto en cero. Por día, el 28 aparecen los cobros y
  el 29 las devoluciones.
- **Gastos:** la comisión ya no cuenta.
- **Utilidad y costos:** la cita cancelada no cuenta.

### Cómo se deshace

Sería volver a meter una prueba que no pasó; no hay motivo. Si hiciera
falta:

1. Dar de baja (`deleted_at`) las dos devoluciones de los cobros `937907ca`
   y `e563b3b8`.
2. Regresar el gasto `56d41636` a `pagado`.
3. Regresar la cita `52b8d6f5` a `finalizada`.
4. Quitar el `deleted_at` del cliente y del perro.
