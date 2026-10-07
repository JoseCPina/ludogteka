// 56 · Tarjeta (registro manual) (admin)
export default {
  rol: "admin",
  inicio: "/caja",
  gancho: "La terminal se cayó, no hay señal o el cliente pagó en otra terminal. No lo dejes esperando: registra su tarjeta a mano, con el folio del voucher, y después el admin la revisa.",
  escenas: [
    {
      titulo: "Cuándo usarla",
      dice: "Siempre que puedas, cobra con «Cobrar con terminal»: así el pago se confirma solo. «Tarjeta (registro manual)» es para cuando la terminal no se puede usar. Abre la cuenta que vas a cobrar.",
      pasos: [["resaltar", "Cuentas abiertas de hoy", 2600], ["clic", "css:a[href^='/caja/cobrar/']", { nav: true }]],
    },
    {
      titulo: "El método y el folio",
      dice: "En «Registrar cobro» escoge el «Método» «Tarjeta (registro manual)» y escribe el «Monto». Luego captura el «Folio o autorización del voucher», que no se puede repetir, y elige por qué no se usó la terminal.",
      pasos: [
        ["elegir", "Método", "Tarjeta (registro manual)"],
        ["escribir", "Monto", "300"],
        ["escribir", "Folio o autorización del voucher", "TUT-{tel}"],
        ["elegir", "¿Por qué no se cobró con la terminal vinculada?", "Sin señal o sin internet"],
      ],
    },
    {
      titulo: "Datos opcionales",
      dice: "Si quieres, anota los últimos cuatro dígitos y el banco. Nunca captures el número completo de la tarjeta: la app no lo pide ni lo guarda.",
      pasos: [["escribir", "Últimos 4 dígitos (opcional)", "4242"], ["escribir", "Banco (opcional)", "BBVA"], ["resaltar", "Banco (opcional)", 1800]],
    },
    {
      titulo: "Registrar",
      dice: "Aprieta «Registrar cobro». La cuenta cuenta como pagada desde ya, pero el cobro queda marcado como «Sin verificar», porque ningún proveedor lo confirmó.",
      pasos: [["clic", "css:button:has-text('Registrar cobro') >> nth=-1"], ["esperar", 3000], ["resaltar", "Sin verificar", 3000]],
    },
    {
      titulo: "Lo que ve el admin",
      dice: "El admin revisa estos cobros en «Conciliación», en «Tarjetas manuales por revisar», del más viejo al más nuevo. Si el voucher es bueno, aprieta «Revisado con voucher». Si el cobro nunca se recibió, «Marcar como no recibida»: la cuenta vuelve a tener saldo y nada se borra.",
      pasos: [["ir", "/caja/conciliacion"], ["resaltar", "Tarjetas manuales por revisar", 2800], ["resaltar", "Revisado con voucher", 2400], ["resaltar", "Marcar como no recibida", 2400]],
    },
  ],
  resumen: ["La tarjeta manual es para cuando la terminal no se puede usar.", "Lleva el folio del voucher, que no se repite, y el motivo.", "Queda «Sin verificar» hasta que el admin la revisa en Conciliación."],
};
