/**
 * Las cuentas del negocio de demostración (scripts/demo/sembrar-demo.mjs)
 * con las que entra un prospecto desde "Ver demo", sin registrarse.
 *
 * La ruta /demo/entrar/<rol> solo abre sesión con una de ESTAS cuentas, y
 * solo si el negocio del dominio tiene plan 'demo' y la membresía de la
 * cuenta ahí es de solo lectura: el prospecto explora, la base no le deja
 * escribir nada.
 */
export const CUENTAS_DEMO = {
  recepcion: { email: "demo.recepcion@peludesk.mx", nombre: "Recepción", destino: "/recepcion" },
  estetica: { email: "demo.estetica@peludesk.mx", nombre: "Estética", destino: "/estetica" },
  admin: { email: "demo.admin@peludesk.mx", nombre: "Dueña del negocio", destino: "/admin" },
  cliente: { email: "t4420000201@telefono.ludogteka.mx", nombre: "Dueña de un perro", destino: "/portal" },
} as const;

export type RolDemo = keyof typeof CUENTAS_DEMO;

export function esRolDemo(valor: string): valor is RolDemo {
  return Object.prototype.hasOwnProperty.call(CUENTAS_DEMO, valor);
}
