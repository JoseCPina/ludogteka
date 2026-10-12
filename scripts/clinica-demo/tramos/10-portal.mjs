// Tramo 10 · Portal del dueño (Cliente Liga PRUEBA, que sí tiene cuenta): carnet, consultas con la opción prendida, facturas,
// y que NO vea notas internas ni dinero ni nada de otro cliente.
import { BASE, comprobar, seccion, cuerpo, sinDesborde, hoyISO } from "../comun.mjs";
import { sesionDe, comoPersona, servicioSinNegocio } from "../../lib/prod.mjs";

const SECRETO = "NOTA-INTERNA-SECRETA-PRUEBA";
export async function tramo(c) {
  const S = c.S, NEG = c.e.negocioId;
  const rocco = c.e.perroLiga, cli = c.e.clienteLiga;
  seccion("10a. Lo que el MVZ y recepción dejan del perro del cliente de la liga");
  const m = c.api.mvz, rec = c.api.recepcion;
  const { data: yaC } = await S.from("carnet_vacunas").select("id").eq("negocio_id", NEG).eq("perro_id", rocco).is("anulada_at", null);
  if (!yaC?.length) {
    const v = await m.rpc("registrar_vacuna", { p_perro_id: rocco, p_biologico: "Antirrábica PRUEBA", p_tipo_requisito_id: null, p_insumo_id: null, p_lote_id: null, p_lote_texto: "L-ROCCO-1", p_laboratorio: "Lab PRUEBA", p_fecha: hoyISO(-3), p_proxima: hoyISO(360), p_medico_id: c.e.medicoId, p_dosis: "1 mL", p_notas: SECRETO + " (nota del carnet)", p_descontar: false });
    comprobar(!v.error, `vacuna en el carnet de Rocco (${v.error?.message ?? "ok"})`);
  }
  const n1 = await rec.rpc("cliente_notas_guardar", { p_cliente: cli, p_notas: SECRETO + " cliente" });
  const n2 = await m.rpc("perro_notas_clinicas_guardar", { p_perro: rocco, p_notas: SECRETO + " clínica" });
  comprobar(!n1.error && !n2.error, `notas internas puestas (${n1.error?.message ?? ""}${n2.error?.message ?? ""})`);
  const { data: yaCons } = await S.from("vet_consultas").select("id").eq("negocio_id", NEG).eq("perro_id", rocco).eq("estado", "firmada");
  if (!yaCons?.length) {
    const { data: borr } = await S.from("vet_consultas").select("id").eq("negocio_id", NEG).eq("perro_id", rocco).eq("estado", "borrador").maybeSingle();
    const ini = borr ? { data: borr.id, error: null } : await m.rpc("vet_consulta_iniciar", { p_perro: rocco, p_cita: null, p_tipo: "consulta", p_medico: c.e.medicoId });
    const cid = ini.data;
    const g = await m.rpc("vet_consulta_guardar", { p_id: cid, p_datos: { motivo: "Revisión general", anamnesis: "Sin novedades", plan: "Continuar con su rutina. Control en 6 meses.", notas_internas: SECRETO + " consulta", peso_kg: 22, temperatura_c: 38.4, diagnosticos: [{ ref_id: null, origen: "libre", nombre: "Control de rutina", tipo: "definitivo", nota: "" }] } });
    const f = await m.rpc("vet_consulta_firmar", { p_id: cid });
    comprobar(!ini.error && !g.error && !f.error, `consulta firmada de Rocco (${ini.error?.message ?? g.error?.message ?? f.error?.message ?? "ok"})`);
  }

  seccion("10b. El dueño entra a su portal (sesión real de su cuenta)");
  const S0 = servicioSinNegocio();
  const { data: uid } = await S0.rpc("usuario_por_email", { p_email: "t4441300002@telefono.ludogteka.mx" });
  const ses = await sesionDe(uid);
  const q = await c.abrir(null);
  await q.c.addCookies(ses.cookies);
  const p = q.p;
  await p.goto(`${BASE}/portal`, { waitUntil: "networkidle" });
  let t = await cuerpo(p);
  comprobar(/Rocco/.test(t) && /Michi/.test(t), "el portal muestra sus dos mascotas");
  comprobar(!/Firulais|Toby|Cliente Demo \(WhatsApp/.test(t), "y ninguna mascota ni dueño de otro cliente");
  await sinDesborde(p, "portal");
  await p.goto(`${BASE}/portal/perros/${rocco}`, { waitUntil: "networkidle" });
  t = await cuerpo(p);
  await sinDesborde(p, "ficha de Rocco en el portal");
  comprobar(/Antirrábica PRUEBA/.test(t), "ve su carnet de vacunas");
  comprobar(/Revisión general|Control en 6 meses/.test(t), "ve sus consultas firmadas (fecha, diagnóstico y plan) porque la opción está prendida");
  comprobar(!t.includes("NOTA-INTERNA") && !/\$\s?\d/.test(t.replace(/\$\s?0\b/g, "")), "no aparece ninguna nota interna ni cantidad de dinero");
  await p.goto(`${BASE}/portal/facturas`, { waitUntil: "networkidle" });
  comprobar(/factura/i.test(await cuerpo(p)), "«Mis facturas» abre (vacío: no hay llave del PAC)");
  await sinDesborde(p, "facturas del portal");
  await q.c.close();

  seccion("10c. Por la API con la sesión del dueño: nada interno ni ajeno");
  const D = comoPersona(ses.token, NEG);
  const lee = async (tabla, sel = "*") => { const r = await D.from(tabla).select(sel).limit(5); return r.error ? `error:${r.error.code}` : JSON.stringify(r.data); };
  for (const tabla of ["clientes_notas_internas", "perros_notas_clinicas", "vet_consultas", "contratos_internos", "perros_evaluaciones", "cobros", "cargos_aplicados", "vet_estimados", "hospitalizaciones", "vet_dictados"]) {
    const v = await lee(tabla);
    comprobar(v === "[]" || v.startsWith("error:") , `${tabla}: el dueño no lee nada (${v.slice(0, 40)})`);
  }
  const prop = await D.from("perros").select("id, nombre").limit(20);
  comprobar(prop.data?.length === 2 && prop.data.every((x) => /Rocco|Michi/.test(x.nombre)), `solo ve a sus 2 mascotas (${prop.data?.map((x) => x.nombre).join(", ")})`);
  const otro = await D.from("perros").select("id").eq("id", c.e.perroDueno);
  comprobar((otro.data ?? []).length === 0, "ni la mascota de otro cliente por su id");
  const col = await D.from("clientes").select("notas").limit(1);
  comprobar(!!col.error, "la columna clientes.notas ya no existe para el dueño");
  const exp = await D.rpc("mi_expediente", { p_perro: rocco });
  const tx = JSON.stringify(exp.data ?? {});
  comprobar(!exp.error && /Revisión general|Control en 6 meses|Continuar/.test(tx) && !tx.includes("NOTA-INTERNA") && !/notas_internas|tratamiento|firma_hash/.test(tx), "mi_expediente trae fecha, diagnóstico y plan; sin notas internas, tratamiento ni firma");
}
