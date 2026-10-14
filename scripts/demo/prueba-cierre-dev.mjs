// Prueba (solo desarrollo): un script que abre una cuenta del visitante y revienta la deja cerrada.
//   node scripts/demo/prueba-cierre-dev.mjs
import { spawnSync } from "node:child_process";
import { conectar } from "../tutoriales/lib/db.mjs";
import { cuentasDemo, correosDemo } from "./solo-lectura.mjs";

const c = conectar(false).cliente;
const antes = await cuentasDemo(c);
if (antes.filas.some((f) => f.estado.startsWith("ABIERTA"))) throw new Error("Hay cuentas abiertas antes de probar: cierra con solo-lectura.mjs --cerrar");
const correo = correosDemo()[0];
const hijo = `
import { conectar } from "./scripts/tutoriales/lib/db.mjs";
import { cerrarAlFallar, cuentasDemo } from "./scripts/demo/solo-lectura.mjs";
const c = conectar(false).cliente;
cerrarAlFallar(c);
const { data: n } = await c.from("negocios").select("id").eq("slug", "patitasyco").single();
const { data: us } = await c.auth.admin.listUsers({ perPage: 1000 });
const id = us.users.find((u) => u.email === ${JSON.stringify(correo)}).id;
await c.from("membresias").update({ solo_lectura: false }).eq("negocio_id", n.id).eq("profile_id", id);
throw new Error("revienta a propósito");
`;
const r = spawnSync("node", ["--input-type=module", "-e", hijo], { encoding: "utf8" });
const despues = await cuentasDemo(c);
const abiertas = despues.filas.filter((f) => f.estado.startsWith("ABIERTA"));
console.log(`el script salió con código ${r.status} (esperado 1)`);
console.log(`${abiertas.length === 0 && r.status === 1 ? "✔" : "✘"} después de reventar no queda ninguna cuenta abierta (${abiertas.map((f) => f.correo).join(", ") || "ninguna"})`);
process.exit(abiertas.length === 0 && r.status === 1 ? 0 : 1);
