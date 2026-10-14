// 33 · Cobra una cuenta (recepción)
export default {
  inicio: "/caja",
  // Recepción no trae «Cancelar cuentas» por omisión: el admin se lo da a quien quiera. Aquí se le da para mostrarlo.
  async preparar({ sb, negocioId }) {
    const { data: ms, error } = await sb.from("membresias").select("profile_id").eq("negocio_id", negocioId).eq("rol", "recepcion").is("deleted_at", null);
    if (error) throw new Error(`recepción de la demo: ${error.message}`);
    for (const m of ms ?? []) {
      const { data: ya } = await sb.from("permisos_staff").select("id").eq("negocio_id", negocioId).eq("profile_id", m.profile_id).eq("permiso", "cancelar_cuentas").is("revocado_at", null).is("deleted_at", null).maybeSingle();
      if (ya) continue;
      const r = await sb.from("permisos_staff").insert({ negocio_id: negocioId, profile_id: m.profile_id, permiso: "cancelar_cuentas", updated_at: new Date().toISOString() });
      if (r.error) throw new Error(`permiso de la demo: ${r.error.message}`);
    }
  },
  gancho: "Cobrar no debería tomarte más de un minuto. Escoges la cuenta, el método de pago y listo: la app suma todo y lleva el saldo por ti.",
  escenas: [
    {
      titulo: "Cuentas abiertas",
      dice: "En «Caja», dentro de «Por cobrar», aparecen las «Cuentas abiertas de hoy», con el cliente, el perro, el servicio y cuánto falta por cobrar. Las citas de días futuros salen aparte, como próximas. Si buscas a otro cliente, usa el buscador. Si una persona tiene varias cuentas, salen juntas y se cobran de una vez; eso lo ves en otro video. Toca la cuenta que vas a cobrar.",
      pasos: [["resaltar", "Por cobrar", 2000], ["resaltar", "Cuentas abiertas de hoy", 2800], ["clic", "css:a[href^='/caja/cobrar/']", { nav: true }]],
    },
    {
      titulo: "La cuenta",
      dice: "Arriba ves todo lo que se está cobrando, con su precio, y el «Saldo». Más abajo están los descuentos y las formas de cobrar.",
      pasos: [["zoom", "Total cuenta", 1.4, 3500]],
    },
    {
      titulo: "Si no se va a cobrar",
      dice: "Si esa cuenta ya no se va a cobrar, por ejemplo porque el cliente no se presentó, aprieta «Cancelar cuenta»; lo ve quien tiene el permiso de cancelar cuentas, que el admin da a quien quiera. El motivo es obligatorio, y aquí escoges «No se presentó». La cuenta no se borra: sale de lo que falta por cobrar y queda en el historial del cliente. Si ya tiene cobros, primero se anulan.",
      pasos: [["clic", "Cancelar cuenta"], ["elegir", "Motivo (obligatorio)", "No se presentó"], ["esperar", 2500], ["clic", "Dejarla"]],
    },
    {
      titulo: "Registrar el cobro",
      dice: "En «Registrar cobro» escoges el «Método»: efectivo, transferencia o «Tarjeta (registro manual)», y el «Monto». Puedes agregar una propina, y si el cliente paga con dos métodos, usa «+ Repartir en otro método».",
      pasos: [["elegir", "Método", "Efectivo"], ["escribir", "Monto", "500"], ["resaltar", "Propina", 2400], ["resaltar", "+ Repartir en otro método", 2400]],
    },
    {
      titulo: "Confirmar",
      dice: "Aprieta «Registrar cobro». El cobro queda en el turno abierto y la cuenta se marca como pagada. Si todavía hay saldo, la cuenta sigue abierta.",
      pasos: [["clic", "css:button:has-text('Registrar cobro') >> nth=-1"], ["esperar", 3500]],
    },
  ],
  resumen: ["«Cuentas abiertas de hoy» lista lo que falta por cobrar.", "Escoges el método, y puedes repartir el pago entre varios.", "El cobro queda en el turno abierto."],
};
