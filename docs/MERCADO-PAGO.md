# Mercado Pago en Ludogteka

Dos vías, las dos alimentando el mismo ledger de cobros de la caja:

- **Terminal Point integrada** (API de Orders, la vigente para Point desde
  2025): recepción manda el monto desde la app, el cliente paga en la
  terminal, y el cobro se registra solo con método `terminal`.
- **Links de pago** (Checkout Pro): la app genera el link, se manda por
  WhatsApp, y cuando el cliente paga el cobro se registra solo con método
  `transferencia` (el dinero cae en la cuenta de Mercado Pago, no en el
  lote de la terminal).

Sin `MERCADOPAGO_ACCESS_TOKEN` la app corre en **simulación**: no pega a
la API real ni mueve dinero. Es lo que corre en desarrollo.

## Lo que hay que hacer en Mercado Pago (una sola vez)

1. **Cuenta y aplicación.** Entra a <https://www.mercadopago.com.mx/developers>
   con la cuenta del negocio (la misma que tiene la terminal). En
   *Tus integraciones → Crear aplicación*: nombre "Ludogteka", tipo
   *Pagos presenciales* con producto **Point**, y activa también
   **Checkout Pro** (pagos en línea) para los links. Si el panel obliga a
   una aplicación por producto, crea dos y usa el access token de la de
   Point para todo (la de Checkout Pro solo necesita existir en la misma
   cuenta); si una sola aplicación permite ambos productos, mejor.
2. **Credencial de producción.** En la aplicación: *Credenciales de
   producción* → copia el **Access Token** (empieza con `APP_USR-`). Es
   la única credencial que usa la app; la public key no hace falta.
   Mercado Pago puede pedir completar datos del negocio antes de
   liberar producción.
3. **Vincular la terminal.** Desde la app de Mercado Pago en el celular
   (cuenta del negocio): *Point → vincular dispositivo* y escanea el QR
   de la terminal. Antes crea una **sucursal** y una **caja** (punto de
   venta) en *Tu negocio → Sucursales*; la terminal se asocia a esa caja.
   Solo puede haber UNA terminal en modo PDV por caja.
4. **Modo PDV.** La terminal tiene que estar en modo **PDV** (integrado);
   en STANDALONE ignora las órdenes de la app. El diagnóstico de `/admin`
   lista las terminales de la cuenta con su modo y tiene el botón
   "Poner en modo PDV" (equivale a `PATCH /terminals/v1/setup`). La
   terminal debe estar encendida y con internet para el cambio.
5. **Webhooks.** En la aplicación: *Webhooks → Configurar notificaciones*
   → modo **Producción** → URL: `https://www.ludogteka.mx/api/mercadopago/webhook`
   → eventos: **Órdenes** (para Point) y **Pagos** (para los links) →
   Guardar. Al guardar se genera la **clave secreta**: cópiala. Con el
   botón *Simular* del mismo panel puedes mandar una notificación de
   prueba (la app la rechaza con 401 si la firma no es válida, y con
   `orden_desconocida` si el id no es de una orden suya: las dos
   respuestas son correctas).
6. **Meses sin intereses** (opcional). En *Tu negocio → Cuotas / Meses sin
   intereses* activa los plazos que quieras ofrecer (3, 6, 9, 12). La
   app manda el plazo elegido en la orden con costo para el vendedor; si
   no están activados en la cuenta, la terminal cobra a un solo pago.

## Variables en Vercel (Production)

| Variable | Valor |
|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | el access token de producción (`APP_USR-…`) |
| `MERCADOPAGO_WEBHOOK_SECRET` | la clave secreta del panel de Webhooks |
| `MERCADOPAGO_TERMINAL_ID` | el id de la terminal, tal cual lo lista el diagnóstico (`NEWLAND_N950__…`) |
| `LUDOGTEKA_URL_PUBLICA` | `https://www.ludogteka.mx` |

Server-side todas, sin `NEXT_PUBLIC_`, nunca en el repo ni en `.env.local`
de producción. Después de capturarlas hay que volver a desplegar (Vercel
no las inyecta en un build ya hecho). Luego: `/admin → Probar conexión con
Mercado Pago` debe salir en verde en las tres pruebas.

## Cómo funciona por dentro

- `mp_ordenes`: un intento de cobro por Mercado Pago sobre una cuenta
  (reserva). Estados: creada → en_terminal → pagada | cancelada |
  expirada | fallida | reembolsada. `cobro_id` apunta al cobro registrado.
- Terminal: `POST /v1/orders` `{type:"point", external_reference:<id de
  la orden nuestra>, expiration_time:"PT3M", transactions.payments[{amount}],
  config.point{terminal_id, print_on_terminal}, config.payment_method
  {default_installments, installments_cost:"seller"}}` con
  `X-Idempotency-Key`. La pantalla consulta `GET /v1/orders/{id}` cada 3 s
  hasta 120 s; el webhook (`type=order`, `action=order.processed`) llega
  por su lado. Los dos caminos terminan en `registrar_pago_mercadopago`,
  que es idempotente: un solo cobro por orden y por pago. Cancelar:
  `POST /v1/orders/{id}/cancel` (solo mientras no está en la pantalla de
  la terminal; si ya está, se cancela en la terminal y la orden nuestra se
  cierra igual).
- Links: `POST /checkout/preferences` con `external_reference`,
  `notification_url` (el webhook), vigencia de 7 días; devuelve
  `init_point`. Al pagar llega `type=payment`; la app lee
  `GET /v1/payments/{id}` (nunca confía en el cuerpo de la notificación),
  toma `external_reference` y registra.
- Firma del webhook: `x-signature: ts=…,v1=…` + `x-request-id`; HMAC-SHA256
  de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con la clave
  secreta. Sin firma válida: 401 y no se toca nada.
- Sin turno abierto (un link pagado de noche): la orden queda `pagada` sin
  cobro; al abrir turno un trigger la registra en ese turno, y la caja la
  muestra como pendiente mientras tanto.
- Corte: los cobros de Mercado Pago llevan `origen` (`mercadopago_point` /
  `mercadopago_link`) y cuentan en el esperado de su método. El turno
  muestra por método cuánto entró "por la app" y cuánto "a mano", para
  cotejar lo primero contra Mercado Pago y lo segundo contra el reporte de
  la terminal.

## Simulación (desarrollo)

- Terminal: la orden se aprueba sola a los 8 s. Centavos `.13` → el
  cliente cancela a los 4 s; centavos `.77` → la terminal nunca contesta
  (para probar el tope de 120 s y la salida manual).
- Link: apunta a `/api/mercadopago/simulacion/<orden>`; abrirlo equivale a
  pagarlo.
- Los cobros simulados quedan marcados "(SIMULADO)" en sus notas.
