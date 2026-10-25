// Pura (sin base): la regla de todos los buscadores de clientes (N124, src/lib/clientes/filtro.ts).
//   node --experimental-strip-types scripts/auditoria/busqueda-clientes.mjs
// La búsqueda se parte en términos y todos deben coincidir; cada uno contra el dueño, algún perro o, si es
// numérico, el teléfono. En pantalla (Caja, «¿A quién le cobras?»): scripts/auditoria/buscadores-ui-dev.mjs, paso 6.
import { coincidenciaDeCliente, terminosDeBusqueda } from "../../src/lib/clientes/filtro.ts";
let mal = 0;
const ok = (c, t) => { if (c) console.log(`  ✔ ${t}`); else { mal++; console.log(`  ✘ ${t}`); } };
const S32 = { nombre: "Qa S32 Est", telefono: "4441112233", perros: [{ id: "p1", nombre: "Firulais" }] };
const R23 = { nombre: "QA R23c Cliente Est", telefono: "4443200011", perros: [{ id: "p2", nombre: "Bolita" }] };
const JOSE = { nombre: "José Pérez", telefono: "444-123-4567", perros: [{ id: "p3", nombre: "Motita" }, { id: "p4", nombre: "Canela" }] };
const busca = (c, q) => coincidenciaDeCliente(c, terminosDeBusqueda(q));

ok(busca(S32, "S32 Est") !== null, "«S32 Est» encuentra a «Qa S32 Est»");
ok(busca(R23, "S32 Est") === null, "«S32 Est» NO trae a «QA R23c Cliente Est» (su teléfono tiene 32, pero «S32» no es número)");
ok(busca(R23, "32") !== null, "un término numérico sí busca en el teléfono («32»)");
ok(busca(R23, "Est Cliente") !== null && busca(R23, "Cliente Nadie") === null, "todos los términos deben coincidir, en cualquier orden (Y, no O)");
ok(busca(JOSE, "jose motita")?.map((p) => p.id).join() === "p3", "dueño + perro: «jose motita» coincide y resalta a Motita");
ok(busca(JOSE, "motita canela")?.length === 2, "dos perros del mismo dueño, uno por término");
ok(busca(JOSE, "Perez 4567") !== null && busca(JOSE, "Perez 9999") === null, "nombre + teléfono, y un número que no está deja fuera");
ok(busca(JOSE, "444-123") !== null && busca(JOSE, "4441234567") !== null, "teléfono con guiones o seguido");
ok(busca(JOSE, "  MOTITA  ") !== null && busca(JOSE, "Pérez") !== null, "sin mayúsculas ni acentos, espacios de sobra no cuentan");
ok(busca({ ...JOSE, telefono: null }, "444") === null, "sin teléfono, un número no truena ni coincide");
ok(terminosDeBusqueda("   ").length === 0, "una búsqueda vacía no tiene términos (la lista sale completa)");
console.log(mal ? `\n${mal} HALLAZGO(S)` : "\nSin hallazgos.");
process.exit(mal ? 1 : 0);
