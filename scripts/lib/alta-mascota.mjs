// QA S39 (N137): con Veterinaria prendida, el alta de mascota del mostrador pregunta primero la especie y el campo
// del nombre aparece hasta escogerla («Nombre del perro» con Perro). Las pruebas que dan de alta un perro usan esto en
// lugar de `getByLabel("Nombre del perro")`: escoge «Perro» si se pregunta y devuelve el campo del nombre.
export async function campoNombreDelPerro(p) {
  const especie = p.getByLabel("Especie", { exact: true });
  const nombre = p.getByLabel("Nombre del perro");
  await especie.or(nombre).first().waitFor({ timeout: 45000 });
  if ((await especie.count()) && !(await nombre.count())) await especie.selectOption("perro");
  await nombre.waitFor({ timeout: 45000 });
  return nombre;
}
