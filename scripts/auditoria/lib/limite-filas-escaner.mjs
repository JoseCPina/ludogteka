// Escáner estático del límite de 1,000 filas de la API de Supabase (PostgREST max_rows).
// Encuentra cada consulta `.from("t").select(...)` o `.rpc("f")` de lectura que NO acota
// (sin limit/range/single/maybeSingle/head:true) y dice archivo, línea y tabla/función.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");

const ACOTAN = new Set(["limit", "range", "single", "maybeSingle", "csv", "explain"]);
// Lo que lee con estos ayudantes ya pagina hasta el final (src/lib/supabase/paginar.ts).
const PAGINADORES = new Set(["leerTodo", "leerTodoPorIds"]);

/** ¿Algún ancestro del nodo es una llamada a leerTodo/leerTodoPorIds? */
function dentroDeUnPaginador(nodo) {
  for (let p = nodo.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && PAGINADORES.has(p.expression.text)) return true;
  }
  return false;
}

// Catálogos y tablas que por su naturaleza no pasan de 1,000 filas por negocio (un catálogo, la configuración
// del negocio). Cada entrada es una decisión: si una de estas tablas crece sin tope, sácala de aquí.
export const PEQUENAS = new Set(
  (
    "servicios tamanos_categoria tipos_pelaje servicios_cotizables planes grupos_raza tutoriales integraciones_cobro " +
    "tipos_requisito_sanitario modulos cfdi_catalogos cfdi_clases unidades_medida principios_activos razas razas_grupo " +
    "areas_inventario categorias_gasto catalogo_alertas catalogo_descuentos tipos_contrato plantillas_contrato negocio_fotos " +
    "vet_reglas vet_reglas_clasificacion planes_precios_stripe redes_ajustes resumen_ajustes tarifas_dia_semana " +
    "cfdi_config_negocio seguimiento_pruebas_plantillas servicios_extra servicios_extra_zonas reporte_secciones " +
    "reporte_opciones negocios vet_diagnosticos horario_semana_vigente mis_modulos mis_permisos resolver_cupo_configuracion " +
    "resolver_tope_descuento_recepcion negocio_publico mis_negocios cfdi_leer_llave registrar_negocio_prueba " +
    "tutoriales_progreso consentimientos_plantillas_lista cfdi_insumo_fiscal cfdi_servicio_fiscal medicos_veterinarios " +
    "medico_folios_resumen establecimiento_permisos esquemas_pago membresias permisos_staff empleados comisiones_servicio " +
    "proveedores gastos_recurrentes listar_personal listar_personal_estetica estilistas_asignables cuentas_para_empleado " +
    "permisos_establecimiento_por_vencer cfdi_timbres_mes cfdi_global_periodos cfdi_atencion cfdi_archivos"
  ).split(" ")
);

// Una consulta acotada por la llave de UN registro (un perro, un cliente, una cuenta…) o por un solo día no
// pasa de 1,000 filas en la práctica. Si crece, hay que paginarla.
export const LLAVE_ACOTADA = /(\.(eq|in)\(\s*"(perro_id|cobro_id|orden_id|lote_id|cliente_id|reserva_id|estancia_id|cita_id|serie_id|bono_cliente_id|factura_id|ticket_id|conversacion_id|galeria_id|turno_id|grupo_id|id|empleado_id|perro_medicamento_id|movimiento_id|item_id|servicio_id|ids?)"|p_(reserva_id|cita_id|bono_id|turno_id|cliente_id|perro_ids|reservas|estancia|factura_id|persona_id|negocio_id|cuenta_id))/;
// Funciones y consultas que se acotan por diseño (no por una llave de la consulta): cada una dice por qué.
export const ACOTADAS_POR_DISENO = new Map([
  ["gastos_por_categoria_periodo", "una fila por categoría de gasto"],
  ["reporte_margen_por_servicio_periodo", "una fila por servicio"],
  ["reporte_servicios_extra_periodo", "una fila por servicio extra"],
  ["generar_estancias_serie", "una fila por fecha del horizonte de la serie (semanas)"],
  ["estado_telefono_alta", "una fila: el estado de un teléfono"],
  ["avisos_tomar", "lleva su propio p_limite"],
  ["carnet_recordatorios_para_enviar", "lleva su propio p_limite"],
  ["redes_tomar", "lleva su propio p_limite"],
  ["vet_dictado_audios_vencidos", "lote de audios vencidos de una corrida"],
  ["carnet_negocios_con_recordatorios", "negocios con recordatorios prendidos"],
  ["calendario_ocupacion", "una fila por día y categoría del rango pedido (semanas)"],
  ["razas_sin_grupo", "una fila por raza sin grupo de precio"],
  ["razas_propuestas_sin_grupo", "una fila por propuesta de raza pendiente"],
  ["razas_asignaciones_recientes", "la función entrega solo las recientes"],
  ["razas_asignar_texto", "escribe y devuelve el resultado de una asignación"],
  ["razas_conflicto", "una fila por conflicto de un solo texto"],
  ["plataforma_razas_propuestas", "propuestas de raza pendientes de toda la plataforma"],
  ["wa_fallos_atencion", "mensajes de WhatsApp que fallaron y nadie ha visto"],
  ["plataforma_buscar_personas", "búsqueda por texto: la función limita sus resultados"],
  ["mis_facturas", "solo las facturas de quien llama (RLS)"],
  ["mis_tickets_con_respuesta", "solo los tickets de quien llama con respuesta sin leer"],
  ["contratos_por_atender@app/portal/page.tsx", "portal: la RLS entrega solo los del dueño"],
  ["asistencia_periodo@empleados", "un día, o un empleado en un rango corto (30 días / el rango que se pide)"],
  ["asistencia_periodo@mi-trabajo", "un empleado, últimos 30 días"],
  ["asistencia_correcciones@empleados/[id]", "las correcciones de las asistencias de UN empleado en el rango"],
  ["ausencias@empleados/ausencias", "solicitudes pendientes de aprobar"],
  ["cfdi_facturas@lib/cfdi/servicio.ts", "facturas con cancelación pendiente (máximo 3 días de vida)"],
  ["mp_ordenes@caja/cobro-integrado-actions.ts", "órdenes pagadas sin registrar: pocas por naturaleza"],
  ["mp_ordenes@lib/pagos/reconexion.ts", "órdenes de terminal en cola: pocas por naturaleza"],
  ["tarjetas_manuales@reservas/[id]/cobrar/pantalla-cobro.tsx", "las del cobro (y su grupo) que se está viendo"],
  ["consentimientos@veterinaria/consentimientos", "pendientes de firma"],
  ["insumo_lotes_saldo@veterinaria/inventario/[id]", "los lotes de UN producto"],
  ["perros@app/portal/page.tsx", "portal: la RLS entrega solo los perros del dueño"],
  ["perros@app/alta/[token]/page.tsx", "los perros de UN cliente del expediente del link"],
  ["redes_publicaciones@redes/acciones.ts", "las publicaciones de UN video"],
  ["?", "tabla elegida por nombre: catálogos pequeños de la plataforma"],
  ["seguimiento_candidatos", "negocios reales en prueba (decenas)"],
  ["plataforma_cobros", "paginado con leerTodo en las pantallas; la función sirve a las dos"],
]);
export const UN_DIA = /\.eq\("fecha"|llegadas_hoy|salidas_hoy|quienes_estan_adentro/;
const ESCRIBEN = new Set(["insert", "update", "delete", "upsert"]);

function archivos(dir, salida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivos(p, salida);
    else if (/\.(ts|tsx|mjs|js)$/.test(e.name) && !e.name.endsWith(".d.ts")) salida.push(p);
  }
  return salida;
}

/** Devuelve [{archivo, linea, tipo:'from'|'rpc', nombre, metodos, texto}] de consultas no acotadas. */
export function escanear(raices) {
  const hallazgos = [];
  for (const raiz of raices) {
    const lista = fs.statSync(raiz).isDirectory() ? archivos(raiz) : [raiz];
    for (const f of lista) {
      const src = fs.readFileSync(f, "utf8");
      const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const vistos = new Set();
      const visita = (n) => {
        if (ts.isCallExpression(n)) {
          const padre = n.parent;
          // Solo la llamada más externa de la cadena (la que no es objeto de otro .método()).
          const esInterna = padre && ts.isPropertyAccessExpression(padre) && padre.expression === n;
          if (!esInterna) {
            const metodos = [];
            let cur = n;
            while (cur && ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) {
              metodos.unshift({ nombre: cur.expression.name.text, call: cur });
              cur = cur.expression.expression;
            }
            const primero = metodos[0];
            if (primero && (primero.nombre === "from" || primero.nombre === "rpc")) {
              const arg = primero.call.arguments[0];
              const nombre = arg && ts.isStringLiteralLike(arg) ? arg.text : "?";
              const nombres = metodos.map((m) => m.nombre);
              const soloConteo = metodos.some((m) => m.nombre === "select" && m.call.arguments.some((a) => /head\s*:\s*true/.test(a.getText())));
              const acota = nombres.some((x) => ACOTAN.has(x)) || soloConteo;
              const escribe = nombres.some((x) => ESCRIBEN.has(x));
              const lee = primero.nombre === "rpc" || nombres.includes("select");
              if (lee && !acota && !escribe && !dentroDeUnPaginador(n)) {
                const { line } = sf.getLineAndCharacterOfPosition(n.getStart());
                // Escotilla: `// limite-filas-ok: motivo` en la línea o la anterior (lo acota algo que el escáner no ve).
                const lineas = src.split("\n");
                if ([lineas[line], lineas[line - 1]].some((l) => l && l.includes("limite-filas-ok"))) { ts.forEachChild(n, visita); return; }
                const k = `${f}:${line}`;
                if (!vistos.has(k)) {
                  vistos.add(k);
                  hallazgos.push({ archivo: f, linea: line + 1, tipo: primero.nombre, nombre, metodos: nombres.join("."), texto: n.getText().replace(/\s+/g, " ").slice(0, 900) });
                }
              }
            }
          }
        }
        ts.forEachChild(n, visita);
      };
      visita(sf);
    }
  }
  return hallazgos;
}

if (process.argv[1] && process.argv[1].endsWith("limite-filas-escaner.mjs")) {
  const args = process.argv.slice(2);
  console.log(JSON.stringify(escanear(args.length ? args : ["src"]), null, 1));
}

/**
 * Lo que queda sin acotar y sin justificación: consultas de lista (tabla de crecimiento o función que devuelve
 * filas) que no están dentro de leerTodo ni acotadas por una llave. `funcionesDeFilas`: nombres de las funciones
 * SQL que devuelven varias filas (set-returning); un rpc que devuelve un jsonb o un escalar no se corta.
 */
export function sinAcotar(hallazgos, funcionesDeFilas) {
  return hallazgos.filter((h) => {
    if (h.tipo === "rpc" && funcionesDeFilas && !funcionesDeFilas.has(h.nombre)) return false;
    if (PEQUENAS.has(h.nombre) || ACOTADAS_POR_DISENO.has(h.nombre)) return false;
    for (const clave of ACOTADAS_POR_DISENO.keys()) {
      const [nombre, ruta] = clave.split("@");
      if (ruta && nombre === h.nombre && h.archivo.replace(/\\/g, "/").includes(ruta)) return false;
    }
    if (LLAVE_ACOTADA.test(h.texto) || UN_DIA.test(h.texto)) return false;
    return true;
  });
}
