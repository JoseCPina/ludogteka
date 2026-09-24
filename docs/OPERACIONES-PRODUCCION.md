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
