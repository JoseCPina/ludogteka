// acceso_de_sesion() (lo que el middleware pregunta en cada petición, en un solo viaje) devuelve EXACTAMENTE lo mismo
// que las cinco funciones que reemplaza llamadas por separado: current_rol(), modulos_activos(), mis_permisos(),
// acceso_veterinaria() y es_medico_veterinario(). SOLO DESARROLLO:
//
//   node scripts/auditoria/acceso-de-sesion-dev.mjs
//
// Con el JWT real de cada persona de Huellitas y de las de Ludogteka (admin, recepción, estética y clientes), en su
// negocio y suplantando el encabezado del otro (debe salir «anonimo»), más un médico veterinario designado por la
// prueba (se le quita al terminar) y la llave anónima (no la puede llamar).
const { A, B, LUDOGTEKA, datos, rpc, personas, comprobar, seccion, terminar } = await import("./veterinaria-comun-dev.mjs");
const { tokenDe, URL, env } = await import("./sesiones-dev.mjs");

const P = await personas();
const ordenar = (x) => [...(x ?? [])].map(String).sort();

async function comparar(token, negocio, titulo) {
  const [junto, rol, modulos, permisos, vet, medico] = await Promise.all([
    rpc(token, "acceso_de_sesion", {}, negocio),
    rpc(token, "current_rol", {}, negocio),
    rpc(token, "modulos_activos", {}, negocio),
    rpc(token, "mis_permisos", {}, negocio),
    rpc(token, "acceso_veterinaria", {}, negocio),
    rpc(token, "es_medico_veterinario", {}, negocio),
  ]);
  if (!junto.ok) return comprobar(false, `${titulo}: acceso_de_sesion falló (${junto.mensaje})`);
  const j = junto.cuerpo;
  const esperado = {
    rol: rol.cuerpo ?? "anonimo",
    modulos: ordenar(modulos.cuerpo),
    permisos: ordenar(permisos.cuerpo),
    acceso_veterinaria: vet.cuerpo === true,
    es_medico: medico.cuerpo === true,
  };
  const obtenido = { rol: j.rol, modulos: ordenar(j.modulos), permisos: ordenar(j.permisos), acceso_veterinaria: j.acceso_veterinaria === true, es_medico: j.es_medico === true };
  const igual = JSON.stringify(esperado) === JSON.stringify(obtenido);
  comprobar(igual, `${titulo}: rol ${obtenido.rol}, ${obtenido.modulos.length} módulos, ${obtenido.permisos.length} permisos, vet ${obtenido.acceso_veterinaria}, médico ${obtenido.es_medico}${igual ? "" : ` — por separado: ${JSON.stringify(esperado)}; junto: ${JSON.stringify(obtenido)}`}`);
  return obtenido;
}

// Un médico designado por la prueba (la persona de estética de Huellitas), para que es_medico salga verdadero.
const med = await rpc(P.admin, "guardar_medico_veterinario", { p_profile_id: datos.esteticaB, p_cedula: String(Date.now()).slice(-8), p_cpa: null });
try {
  seccion("Huellitas: cada persona, en su negocio y suplantando el de Ludogteka");
  const { data: miembros } = await A.from("membresias").select("profile_id, rol").eq("negocio_id", B).is("deleted_at", null).order("rol").order("created_at").limit(40);
  const porRol = new Map();
  for (const m of miembros ?? []) {
    const n = porRol.get(m.rol) ?? 0;
    if (n >= 4) continue;
    porRol.set(m.rol, n + 1);
    const token = await tokenDe(m.profile_id);
    const r = await comparar(token, B, `${m.rol} ${m.profile_id.slice(0, 8)}`);
    if (r) comprobar(r.rol === m.rol, `  y el rol es el de su membresía (${m.rol})`);
    const fuera = await comparar(token, LUDOGTEKA, `${m.rol} ${m.profile_id.slice(0, 8)} con el encabezado de Ludogteka`);
    if (fuera) comprobar(fuera.rol === "anonimo" || (await A.from("membresias").select("id").eq("negocio_id", LUDOGTEKA).eq("profile_id", m.profile_id).is("deleted_at", null)).data?.length > 0, "  fuera de su negocio: «anonimo» (salvo que también sea de Ludogteka)");
  }
  comprobar(med.ok, `médico de prueba designado${med.ok ? "" : ` (${med.mensaje})`}`);

  seccion("Ludogteka (desarrollo): una o dos personas de cada rol");
  const { data: lud } = await A.from("membresias").select("profile_id, rol").eq("negocio_id", LUDOGTEKA).is("deleted_at", null).order("rol").order("created_at").limit(200);
  const vistos = new Map();
  for (const m of lud ?? []) {
    const n = vistos.get(m.rol) ?? 0;
    if (n >= 2) continue;
    vistos.set(m.rol, n + 1);
    await comparar(await tokenDe(m.profile_id), LUDOGTEKA, `Ludogteka ${m.rol} ${m.profile_id.slice(0, 8)}`);
  }

  seccion("Llave anónima: no la puede llamar");
  const r = await fetch(`${URL}/rest/v1/rpc/acceso_de_sesion`, { method: "POST", headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`, "x-negocio-id": B, "Content-Type": "application/json" }, body: "{}" });
  comprobar(!r.ok, `la llave anónima recibe ${r.status}`);
} finally {
  if (med.ok) await rpc(P.admin, "quitar_medico_veterinario", { p_medico_id: med.cuerpo });
}
terminar();
