// Toda acción del servidor que CAMBIA estado devuelve cómo quedó lo que cambió (QA S41, N140–N142; regla única de
// «la pantalla no se actualiza tras una acción», la cuarta vez que aparece).
//
//   node scripts/auditoria/acciones-registro-final.mjs [--lista] [--json]
//
// Lee cada archivo "use server" de src/ con el compilador de TypeScript y, por cada función exportada:
//   · ¿escribe? (.insert/.update/.upsert/.delete, Storage .upload/.remove, o .rpc de una función que no es de lectura)
//   · ¿cada salida con éxito lleva `registros` (registrosFinales / registrosDe) o navega (`ir` o redirect())?
// Una que escribe y tiene una salida con éxito sin nada de eso NO cumple: la pantalla no tiene con qué pintarse al
// recibir la respuesta y espera a otra carga (router.refresh) o a que alguien recargue.
// Sale con 1 si alguna no cumple. Una excepción real (la acción no cambia nada que se vea: telemetría, una bitácora)
// lleva `// registro-final: <motivo>` en la línea de su `export async function`.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const RAIZ = process.argv.includes("--raiz") ? process.argv[process.argv.indexOf("--raiz") + 1] : "src";
const LISTA = process.argv.includes("--lista");
const JSON_SALIDA = process.argv.includes("--json");

// RPC de solo lectura (no cambian estado): por prefijo o nombre.
const RPC_LECTURA = /^(listar|buscar|cotizar|resolver|obtener|leer|contar|calcular|version|puede|vet_puede|es_|mi_|mis_|cuenta_|cuentas_|resumen|reporte|consulta_|disponib|describir|validar|previsualizar|vista_previa|estado_|minutos_|fecha_|hora_|zona_|negocio_|modulo|modulos|tiene_|precio|sugerir|proponer|ver_|detalle|historial|catalogo|auditoria|razas_|normalizar|perro_faltantes|faltantes|importacion_revisar|importacion_raza|alertas|atencion|veterinaria_atencion|hospitalizacion_censo|inventario_.*_alertas|permisos_establecimiento|wa_uso|conteo|calendario|ocupacion|salida_anticipada_cotizar|cotizar_|existencia|kardex|kpi|totales|desglose|movimientos_turno|turno_actual|turno_abierto)/;
const RPC_LECTURA_EXACTAS = new Set([
  "vet_consulta_detalle", "vet_consulta_cargos", "version_registro_vet", "vet_recetas_puede_leer", "vet_puede_leer", "asistente_preguntas_hoy",
  "borrador_leer", "cita_estetica_choques_texto", "citas_afectadas_por_ausencia", "email_de_login_por_telefono", "email_de_persona_por_telefono",
  "estancia_que_choca", "estilistas_ausentes", "impacto_apagar_modulo", "importacion_progreso", "ordenes_abiertas_de_reservas",
  "pendientes_para_estancia", "plataforma_buscar_personas_por_id", "vet_buscar_diagnosticos", "vet_diagnosticos_nombres",
  "vet_telemedicina_detalle", "exigir_negocio_escribible", "consentimiento_campos", "estancia_cotizar_fechas", "plataforma_resumen_ajustes",
  "teleconsulta_publica", "vet_dictado_estado", "vet_dictado_audio_ruta", "importacion_deshacer_revisar", "prospectos_revisar_clientes",
]);

function archivos(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...archivos(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function esUseServer(sf) {
  const primera = sf.statements[0];
  return primera && ts.isExpressionStatement(primera) && ts.isStringLiteral(primera.expression) && primera.expression.text === "use server";
}

function analizar(fn, sf, texto) {
  const escrituras = [];
  const salidas = [];
  let navega = false;
  const visitar = (n, dentroDeOtraFuncion) => {
    if (ts.isCallExpression(n)) {
      const e = n.expression;
      if (ts.isPropertyAccessExpression(e)) {
        const m = e.name.text;
        if (["insert", "update", "upsert", "delete"].includes(m)) escrituras.push(m);
        if (["upload", "remove"].includes(m) && /storage|\.from\(/.test(e.expression.getText(sf))) escrituras.push(`storage.${m}`);
        if (m === "rpc" && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) {
          const nombre = n.arguments[0].text;
          if (!RPC_LECTURA_EXACTAS.has(nombre) && !RPC_LECTURA.test(nombre)) escrituras.push(`rpc ${nombre}`);
        }
      }
      if (ts.isIdentifier(e) && (e.text === "redirect" || e.text === "permanentRedirect")) navega = true;
    }
    // Las funciones anidadas (callbacks de map, etc.) sí cuentan para escrituras, no para sus `return`.
    if (ts.isReturnStatement(n) && !dentroDeOtraFuncion) salidas.push(n);
    const anidada = n !== fn && (ts.isFunctionLike(n));
    ts.forEachChild(n, (h) => visitar(h, dentroDeOtraFuncion || anidada));
  };
  ts.forEachChild(fn, (h) => visitar(h, false));

  // Una salida con éxito: un objeto sin `error`, o con `error: null`. Las de error no cuentan.
  const exitos = salidas.filter((r) => esExito(r.expression));
  function esExito(x) {
    if (!x) return true;
    while (ts.isParenthesizedExpression(x) || ts.isAwaitExpression(x)) x = x.expression;
    // `return cond ? { conflicto } : { error }`: es salida con éxito si alguna de las dos ramas lo es.
    if (ts.isConditionalExpression(x)) return esExito(x.whenTrue) || esExito(x.whenFalse);
    const obj = ts.isObjectLiteralExpression(x) ? x : null;
    if (!obj) {
      const t = x.getText(sf);
      // return conRegistros(...), return await algo(...) (otra acción): se mira el texto.
      return !/^\{?\s*error:\s*(?!null)/.test(t);
    }
    // Un conflicto de versión (`error: null, conflicto: …`) no guardó nada: no es una salida con éxito.
    const conflicto = obj.properties.find((p) => p.name && p.name.getText(sf) === "conflicto");
    if (conflicto && ts.isPropertyAssignment(conflicto) && conflicto.initializer.kind !== ts.SyntaxKind.NullKeyword) return false;
    // Tampoco una salida que solo pide confirmar antes de guardar (cita de otro día, duplicada, cobro reciente…).
    if (obj.properties.some((p) => p.name && /^(otroDia|duplicada|confirmar|pedirConfirmacion|requiereConfirmacion)$/.test(p.name.getText(sf)))) return false;
    // Ni la de la demo (`error: null, demo: true`): no subió ni guardó nada, la pantalla enseña lo elegido con su aviso.
    const demo = obj.properties.find((p) => p.name && p.name.getText(sf) === "demo");
    if (demo && ts.isPropertyAssignment(demo) && demo.initializer.kind === ts.SyntaxKind.TrueKeyword) return false;
    const err = obj.properties.find((p) => p.name && p.name.getText(sf) === "error");
    if (!err) return true;
    if (ts.isPropertyAssignment(err)) return err.initializer.kind === ts.SyntaxKind.NullKeyword;
    return false;
  }
  const sinRegistro = exitos.filter((r) => {
    const t = r.expression ? r.expression.getText(sf) : "";
    return !/\bregistros\b|\bir\s*:|\bir\b\s*[,}]|registrosFinales|registrosDe|conRegistros/.test(t);
  });
  return { escrituras, navega, exitos: exitos.length, sinRegistro };
}

const resultados = [];
for (const f of archivos(RAIZ)) {
  const texto = fs.readFileSync(f, "utf8");
  if (!texto.startsWith('"use server"') && !texto.startsWith("'use server'")) continue;
  const sf = ts.createSourceFile(f, texto, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (!esUseServer(sf)) continue;
  for (const st of sf.statements) {
    if (!ts.isFunctionDeclaration(st) || !st.name || !st.body) continue;
    if (!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const linea = sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1;
    const lineaTexto = texto.split(/\r?\n/)[linea - 1] ?? "";
    const previa = texto.split(/\r?\n/)[linea - 2] ?? "";
    const excepcion = (lineaTexto.match(/registro-final:\s*(.+)$/) ?? previa.match(/\/\/\s*registro-final:\s*(.+)$/))?.[1] ?? null;
    const a = analizar(st, sf, texto);
    const escribe = a.escrituras.length > 0;
    const cumple = !escribe || a.navega || a.sinRegistro.length === 0 || Boolean(excepcion);
    resultados.push({
      archivo: f.replace(/\\/g, "/"),
      linea,
      nombre: st.name.text,
      escribe,
      escrituras: [...new Set(a.escrituras)],
      cumple,
      excepcion,
      salidasSinRegistro: a.sinRegistro.map((r) => sf.getLineAndCharacterOfPosition(r.getStart(sf)).line + 1),
    });
  }
}

const deEstado = resultados.filter((r) => r.escribe);
const noCumplen = deEstado.filter((r) => !r.cumple);
if (JSON_SALIDA) {
  console.log(JSON.stringify({ total: resultados.length, deEstado: deEstado.length, noCumplen }, null, 1));
} else {
  console.log(`Acciones del servidor: ${resultados.length}; cambian estado: ${deEstado.length}; no devuelven el registro final: ${noCumplen.length}.`);
  if (LISTA || noCumplen.length <= 40) {
    for (const r of noCumplen) console.log(`  ✘ ${r.archivo}:${r.linea} ${r.nombre} (${r.escrituras.join(", ")}) — salida sin registro en la(s) línea(s) ${r.salidasSinRegistro.join(", ")}`);
  }
  const exc = deEstado.filter((r) => r.excepcion);
  if (exc.length) console.log(`Excepciones anotadas: ${exc.length}`);
}
process.exit(noCumplen.length ? 1 : 0);
