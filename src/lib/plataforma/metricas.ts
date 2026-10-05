// Qué negocios cuentan en los totales de la plataforma. Un negocio demo
// (`negocios.plan = 'demo'`, lo marca SOLO plataforma_cambiar_plan) existe y
// se ve en las listas con su etiqueta «Demo», pero nunca suma en un conteo,
// un total o un ingreso. Un negocio suspendido tampoco cuenta como «en
// prueba». Todo conteo de negocios de /plataforma pasa por aquí.

type ConPlan = { plan: string };
type ConPlanYEstado = ConPlan & { activo: boolean };

export const PLAN_DEMO = "demo";

/** El negocio de demostración: visible, con etiqueta, fuera de los totales. */
export const esDemo = (n: ConPlan): boolean => n.plan === PLAN_DEMO;

/** Entra en los totales y las métricas (todo menos el demo). */
export const cuentaEnTotales = (n: ConPlan): boolean => !esDemo(n);

/** «En prueba»: negocio real, en plan prueba y que no está suspendido. */
export const cuentaEnPruebas = (n: ConPlanYEstado): boolean => cuentaEnTotales(n) && n.plan === "prueba" && n.activo;
