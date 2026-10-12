// Siembra los datos LIMPIOS de la «Clínica Demo PeluDesk» para enseñar Veterinaria en una demo de ventas.
//   node scripts/clinica-demo/sembrar.mjs           (después de crear.mjs; idempotente por teléfono/nombre)
// Todo con las sesiones del personal de la clínica (admin, recepción, MVZ), como lo haría la app. Sin marcas
// «PRUEBA» ni datos reales, salvo el WhatsApp del dueño de PeluDesk (4441301539) en el cliente de ejemplo.
import { contexto } from "./comun.mjs";
import { tramo as preparar } from "./tramos/00-preparar.mjs";

const hoy = (d = 0) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const c = await contexto();
const NEG = c.e.negocioId, A = c.api.admin, R = c.api.recepcion, M = c.api.mvz, S = c.S;
const ok = (t) => console.log(`  ✔ ${t}`);
const exigir = (r, t) => { if (r.error) throw new Error(`${t}: ${r.error.message}`); ok(t); return r.data; };
try {
  await preparar(c); // tarifas, ajustes de Veterinaria, servicio extra y horario

  // Clientes y mascotas (recepción, como en el mostrador).
  const GENTE = [
    { nombre: "Cliente de ejemplo (WhatsApp de PeluDesk)", telefono: "4441301539", perros: [
      { nombre: "Firulais", especie: "perro", raza: "Labrador", sexo: "macho", nacio: "2021-03-15", talla: "grande", peso: 28.5 },
      { nombre: "Michi", especie: "gato", raza: null, sexo: "hembra", nacio: "2022-06-10", talla: "chico", peso: 4.2 } ] },
    { nombre: "Luis Ortega (ejemplo)", telefono: "4420000101", perros: [{ nombre: "Toby", especie: "perro", raza: "Beagle", sexo: "macho", nacio: "2020-02-02", talla: "mediano", peso: 11 }] },
    { nombre: "Ana Villa (ejemplo)", telefono: "4420000102", perros: [{ nombre: "Nube", especie: "gato", raza: null, sexo: "hembra", nacio: "2023-01-20", talla: "chico", peso: 3.8 }] },
  ];
  const { data: tallas } = await A.from("tamanos_categoria").select("id, clave").is("deleted_at", null);
  const ids = {};
  for (const g of GENTE) {
    let { data: cli } = await S.from("clientes").select("id").eq("negocio_id", NEG).eq("telefono", g.telefono).is("deleted_at", null).maybeSingle();
    if (!cli) cli = exigir(await R.from("clientes").insert({ nombre: g.nombre, telefono: g.telefono }).select("id").single(), `cliente ${g.nombre}`);
    for (const p of g.perros) {
      let { data: pe } = await S.from("perros").select("id").eq("negocio_id", NEG).eq("cliente_id", cli.id).eq("nombre", p.nombre).is("deleted_at", null).maybeSingle();
      if (!pe) {
        const fila = { cliente_id: cli.id, nombre: p.nombre, especie: p.especie, raza: p.raza, sexo: p.sexo, fecha_nacimiento: p.nacio, tamano_id: tallas.find((t) => t.clave === p.talla)?.id ?? null, esterilizado: true };
        pe = exigir(await A.from("perros").insert(fila).select("id").single(), `mascota ${p.nombre} (${p.especie})`);
        await A.from("pesos_registrados").insert({ perro_id: pe.id, peso_kg: p.peso, fecha: hoy(-1) });
      }
      ids[p.nombre] = pe.id;
    }
  }

  // Inventario clínico: tres productos con lote, uno por clasificación.
  const { data: areas } = await A.from("areas_inventario").select("id, nombre").is("deleted_at", null);
  const area = areas.find((a) => /botiqu|cl[ií]nic/i.test(a.nombre)) ?? areas[0];
  const { data: unidades, error: eU } = await S.from("unidades_medida").select("id, etiqueta");
  if (eU) throw new Error(`unidades: ${eU.message}`);
  const unidad = (n) => unidades.find((u) => u.etiqueta.toLowerCase() === n)?.id;
  const { data: principios } = await A.from("principios_activos").select("*").is("deleted_at", null);
  const PRODUCTOS = [
    { nombre: "Ketamina 10 % (anestésico)", p: /^ketamina/i, lote: "KET-2026-01" },
    { nombre: "Enrofloxacina 5 % (antibiótico)", p: /^enrofloxacina/i, lote: "ENR-2026-01" },
    { nombre: "Probiótico oral", p: /probi[óo]ticos/i, lote: "PRO-2026-01" },
  ];
  const prod = {};
  for (const x of PRODUCTOS) {
    const pa = principios.find((q) => x.p.test(q.nombre));
    let { data: ya } = await S.from("insumos").select("id").eq("negocio_id", NEG).eq("nombre", x.nombre).is("deleted_at", null).maybeSingle();
    if (!ya) {
      const id = exigir(await A.rpc("guardar_producto_clinico", { p_id: null, p_nombre: x.nombre, p_area_id: area.id, p_unidad_compra_id: unidad("litro"), p_unidad_consumo_id: unidad("mililitro"), p_stock_minimo: 50, p_dias_aviso_caducidad: 60, p_principio_activo_id: pa?.id ?? null, p_grupo_senasica: pa?.grupo_senasica ?? null, p_clasificacion_lgs: pa?.clasificacion_lgs ?? null, p_es_antimicrobiano: pa?.es_antimicrobiano ?? false, p_clasificacion_por_confirmar: false }), `producto ${x.nombre}`);
      exigir(await A.rpc("registrar_lote_entrada", { p_insumo_id: id, p_codigo: x.lote, p_caducidad: hoy(420), p_cantidad_compra: 0.5 }), `lote ${x.lote} (500 ml)`);
      ya = { id };
    }
    prod[x.lote] = ya.id;
  }

  // Carnet: una vacuna con próxima dosis dentro de un mes (no dispara el recordatorio hoy) y una consulta firmada.
  const medico = c.e.medicoId;
  const { data: yaV } = await S.from("carnet_vacunas").select("id").eq("negocio_id", NEG).eq("perro_id", ids.Firulais).is("anulada_at", null);
  if (!yaV?.length) exigir(await M.rpc("registrar_vacuna", { p_perro_id: ids.Firulais, p_biologico: "Séxtuple canina", p_tipo_requisito_id: null, p_insumo_id: null, p_lote_id: null, p_lote_texto: "SEX-2026-01", p_laboratorio: "Laboratorio de ejemplo", p_fecha: hoy(-335), p_proxima: hoy(30), p_medico_id: medico, p_dosis: "1 mL", p_notas: null, p_descontar: false }), "vacuna en el carnet de Firulais");
  const { data: yaC } = await S.from("vet_consultas").select("id").eq("negocio_id", NEG).eq("perro_id", ids.Firulais).eq("estado", "firmada");
  if (!yaC?.length) {
    const cid = exigir(await M.rpc("vet_consulta_iniciar", { p_perro: ids.Firulais, p_cita: null, p_tipo: "consulta", p_medico: medico }), "consulta iniciada");
    exigir(await M.rpc("vet_consulta_guardar", { p_id: cid, p_datos: { motivo: "Chequeo anual", anamnesis: "Sin molestias. Come y bebe normal.", plan: "Vacuna anual al día. Próximo control en 12 meses.", peso_kg: 28.5, temperatura_c: 38.5, diagnosticos: [{ ref_id: null, origen: "libre", nombre: "Control de rutina", tipo: "definitivo", nota: "" }] } }), "consulta redactada");
    exigir(await M.rpc("vet_consulta_firmar", { p_id: cid }), "consulta firmada");
  }
  console.log("\nListo: la Clínica Demo quedó con 3 clientes, 4 mascotas, 3 productos con lote, una vacuna y una consulta firmada.");
} finally {
  await c.nav.close();
}
