// El título del recuadro de error dice «Falta información» cuando el mensaje es de validación.
//   node --experimental-strip-types scripts/auditoria/validacion-titulo.mjs
import { tituloDeError, esMensajeDeValidacion } from "../../src/lib/validacion.ts";
let fallos = 0;
const ok = (c, t) => { console.log(`  ${c ? "✔" : "✘"} ${t}`); if (!c) fallos++; };
const G = "No se pudo completar la acción";
for (const m of [
  "Escribe quién recoge al perro.", "Indica si quien recoge es el dueño registrado o una persona autorizada.", "Escoge el motivo.",
  "Con «Otro», escribe el motivo.", "Falta el precio de un cargo.", "El campo es obligatorio.", "Este perro no tiene talla registrada y el precio depende de ella. Captúrala en /perros/x",
  "Registra quién entrega al perro.", "La salida tiene que ser después de la entrada.", "Selecciona un servicio.",
]) ok(tituloDeError(G, m) === "Falta información", `«${m.slice(0, 55)}» → Falta información`);
console.log("── Lo que NO es de validación conserva su título");
for (const m of ["No pudimos guardar esto. Intenta de nuevo.", "Este negocio está en solo lectura.", "Esta cuenta ya tiene cobros ($350).", "Hubo un problema de conexión.", "No hay cupo disponible (diurno) para el 2026-10-16."])
  ok(tituloDeError(G, m) === G, `«${m.slice(0, 55)}» → ${G}`);
ok(tituloDeError("No pudimos cargar la caja", "Escribe algo") === "No pudimos cargar la caja", "un título de carga («No pudimos cargar…») no se toca");
ok(tituloDeError("No se pudo guardar", "Escribe el nombre.") === "Falta información", "«No se pudo guardar» + validación → Falta información");
ok(tituloDeError("Falta información", "x") === "Falta información" && !esMensajeDeValidacion(undefined) && !esMensajeDeValidacion(null), "sin mensaje o con otro tipo no se rompe");
console.log(fallos ? `\nHALLAZGOS: ${fallos}` : "\n✔ Sin hallazgos.");
process.exit(fallos ? 1 : 0);
