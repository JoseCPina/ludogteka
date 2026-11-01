import { sinTitulosVacios } from "@/lib/veterinaria/portal-texto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { Desplegable } from "@/components/formulario-accion";
import { etiquetaEspecie } from "@/lib/veterinaria/buscar";
import { fechaLocalDeInstante, formatearFecha, formatearFechaCalendario, hoyNegocio } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { SECCIONES_CONSULTA, TIPOS_CITA, etiquetaBandera, type DetalleConsulta } from "@/lib/veterinaria/expediente";
import { AccionesFirmada, AnularItem } from "../../expediente/anular-item";
import { CapturarResultado, SubirAdjunto } from "../../expediente/captura";
import { EditorConsulta } from "./editor-consulta";
import { EstadoVivo } from "@/components/concurrencia/estado-vivo";
import { UsoDictado } from "./uso-dictado";
import { CargosConsulta } from "./cargos-consulta";
import { AplicacionesConsulta } from "./aplicaciones-consulta";
import type { CargosConsulta as DatosCargos } from "@/lib/veterinaria/cargos-consulta";
import { vetPuede } from "@/lib/veterinaria/permisos";
import { cargarMedicos, cargarProductosConLotes, miMedico as cargarMiMedico } from "@/lib/veterinaria/lotes";
import { FormularioDesparasitacion, FormularioVacuna } from "../../carnet/[perroId]/formularios";
import type { CarnetCompleto } from "@/lib/veterinaria/carnet";
import { unirFrases } from "@/lib/texto/frases";
import { TablaResponsiva } from "@/components/ui/tabla-responsiva";
import { Enlace } from "@/components/ui/enlace";

// El dictado transcribe y arma el borrador dentro de una acción del servidor: puede tardar más de lo normal.
export const maxDuration = 120;

const VITALES: { clave: string; etiqueta: string; unidad: string }[] = [
  { clave: "peso_kg", etiqueta: "Peso", unidad: "kg" },
  { clave: "temperatura_c", etiqueta: "Temperatura", unidad: "°C" },
  { clave: "frecuencia_cardiaca", etiqueta: "Frec. cardiaca", unidad: "lpm" },
  { clave: "frecuencia_respiratoria", etiqueta: "Frec. respiratoria", unidad: "rpm" },
  { clave: "condicion_corporal", etiqueta: "Condición corporal", unidad: "/9" },
  { clave: "tllc_seg", etiqueta: "TLLC", unidad: "s" },
  { clave: "mucosas", etiqueta: "Mucosas", unidad: "" },
  { clave: "hidratacion", etiqueta: "Hidratación", unidad: "" },
];

function esAdminSesion(sesion: Awaited<ReturnType<typeof obtenerSesionConRol>>): boolean {
  return sesion?.rol === "admin" || (sesion?.permisos ?? []).includes("tarifas");
}

export default async function ConsultaPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  // QA S19 (rendimiento): todo lo que no depende de la consulta se pide A LA VEZ que la consulta (antes iban 5 tandas
  // una tras otra). Los cargos solo los ven quien atiende o un médico (llevan precios); sin permiso, no salen.
  const [sesion, zona, { data, error }, { data: cargosData }, { data: miMedico }, { data: puedeAtender }, { data: puedeEstimar }, { data: puedeRecetar }, puedeRegistrarVacunas, { data: recetasData }] = await Promise.all([
    obtenerSesionConRol(),
    zonaActual(),
    supabase.rpc("vet_consulta_detalle", { p_id: id }),
    supabase.rpc("vet_consulta_cargos", { p_consulta: id }),
    supabase.rpc("vet_mi_medico"),
    supabase.rpc("vet_puede", { p_permiso: "atender_consultas" }),
    supabase.rpc("vet_puede", { p_permiso: "crear_estimados" }),
    supabase.rpc("vet_puede", { p_permiso: "emitir_recetas" }),
    vetPuede(supabase, "registrar_vacunas"),
    // QA S53 (N157): las recetas emitidas DESDE esta consulta (antes la pantalla no las leía y solo decía «Emitir receta»).
    supabase.rpc("vet_recetas_de_consulta", { p_consulta: id }),
  ]);
  const recetas = ((recetasData ?? []) as { id: string; numero: number; estado: string; fecha_emision: string; medico: string; medicamentos: string }[]);
  const recetasVigentes = recetas.filter((r) => r.estado !== "anulada");
  const hoy = hoyNegocio(zona);
  if (error || !data) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <Enlace href="/veterinaria/expediente" className="text-sm">← Expediente clínico</Enlace>
        <Alert variante="advertencia" titulo="No pudimos abrir la consulta">
          {error?.message && error.code === "42501" ? error.message : "No existe o no tienes acceso. Ver el expediente es de un médico veterinario, de admin o de quien tenga «Atender consultas»."}
        </Alert>
      </div>
    );
  }
  const d = data as DetalleConsulta;
  const c = d.consulta;
  const cargos = (cargosData ?? null) as DatosCargos | null;
  const soyElMedico = miMedico === c.medico_id;
  // «Aplicar vacuna» dentro de la consulta: el mismo formulario del carnet (producto y lote del inventario, fecha, médico).
  const conFormularios = c.estado === "borrador" && puedeAtender === true && puedeRegistrarVacunas;
  // Segunda (y última) tanda: el carnet de la mascota y, en un borrador, lo que piden los formularios del carnet.
  const [{ data: carnetCrudo }, { data: ligadasV }, { data: ligadasD }, formularios] = await Promise.all([
    supabase.rpc("carnet_de_mascota", { p_perro_id: c.perro_id }),
    supabase.from("carnet_vacunas").select("id, consulta_id, registrada_en_consulta").eq("perro_id", c.perro_id).not("consulta_id", "is", null), // limite-filas-ok: las de una mascota
    supabase.from("carnet_desparasitaciones").select("id, consulta_id, registrada_en_consulta").eq("perro_id", c.perro_id).not("consulta_id", "is", null), // limite-filas-ok: las de una mascota
    conFormularios
      ? Promise.all([
          cargarProductosConLotes(supabase, "vacuna"),
          cargarMedicos(supabase),
          cargarMiMedico(supabase),
          supabase.from("tipos_requisito_sanitario").select("id, etiqueta").is("deleted_at", null).eq("obligatoria", true).order("orden"),
          cargarProductosConLotes(supabase, "desparasitante"),
        ])
      : Promise.resolve(null),
  ]);
  let aplicarVacuna: React.ReactNode = null;
  let aplicarDesparasitacion: React.ReactNode = null;
  if (formularios) {
    const [productos, medicos, medicoPropio, { data: requisitosCrudo }, desparasitantes] = formularios;
    // QA S17 (N51): también se desparasita desde la consulta, con el mismo formulario del carnet.
    aplicarDesparasitacion = (
      <FormularioDesparasitacion perroId={c.perro_id} consultaId={id} hoy={hoy} productos={desparasitantes} medicos={medicos} medicoPropio={medicoPropio ?? c.medico_id} />
    );
    aplicarVacuna = (
      <FormularioVacuna
        perroId={c.perro_id}
        especie={d.mascota.especie}
        consultaId={id}
        hoy={hoy}
        productos={productos}
        medicos={medicos}
        medicoPropio={medicoPropio ?? c.medico_id}
        requisitos={(requisitosCrudo ?? []).map((r) => ({ id: r.id as string, etiqueta: r.etiqueta as string }))}
      />
    );
  }
  // QA S18 (N93): lo aplicado EN esta consulta (ligado por consulta_id, no por fecha) se ve en la consulta. Lo del
  // carnet de ese día sin consulta lo adopta el borrador al sincronizar sus cargos; mientras no, se muestra igual.
  const fechaConsulta = fechaLocalDeInstante(c.atendida_at, zona);
  const carnet = (carnetCrudo ?? { vacunas: [], desparasitaciones: [] }) as CarnetCompleto;
  const consultaDe = new Map<string, string>([...(ligadasV ?? []), ...(ligadasD ?? [])].map((r) => [r.id as string, r.consulta_id as string]));
  const esDeEstaConsulta = (r: { id: string; fecha_aplicacion: string }) =>
    consultaDe.has(r.id) ? consultaDe.get(r.id) === id : r.fecha_aplicacion === fechaConsulta;
  const vacunasDelDia = (carnet.vacunas ?? []).filter((v) => v.estado !== "anulada" && esDeEstaConsulta(v));
  const desparasitacionesDelDia = (carnet.desparasitaciones ?? []).filter((v) => v.estado !== "anulada" && esDeEstaConsulta(v));
  // QA S19: lo que nació en ESTE borrador se quita desde aquí y se anula al descartarlo; lo registrado desde el carnet, no.
  const nacidas = new Set([...(ligadasV ?? []), ...(ligadasD ?? [])].filter((r) => r.consulta_id === id && r.registrada_en_consulta === true).map((r) => r.id as string));
  const puedeQuitar = c.estado === "borrador" && puedeAtender === true;
  // QA S21 (N105): «Quitar» también para lo registrado en el carnet que esta consulta adoptó (la base pide «Registrar vacunas»).
  const deEsta = new Set([...(ligadasV ?? []), ...(ligadasD ?? [])].filter((r) => r.consulta_id === id).map((r) => r.id as string));
  const seAnulanAlDescartar = [
    ...vacunasDelDia.filter((v) => nacidas.has(v.id)).map((v) => `la vacuna ${v.biologico}`),
    ...desparasitacionesDelDia.filter((v) => nacidas.has(v.id)).map((v) => `la desparasitación ${v.producto}`),
  ];
  const puedeCatalogo = esAdminSesion(sesion);
  const esAdmin = sesion?.rol === "admin";
  const anulada = c.estado === "anulada";
  const rutas = [`/veterinaria/consulta/${id}`, `/veterinaria/expediente/${c.perro_id}`];
  const vitalesConValor = VITALES.filter((v) => { const x = c[v.clave as keyof typeof c]; return x != null && String(x).trim() !== ""; });
  const definitivos = c.diagnosticos.filter((x) => x.tipo === "definitivo");
  const presuntivos = c.diagnosticos.filter((x) => x.tipo === "presuntivo");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Enlace href={`/veterinaria/expediente/${c.perro_id}`} className="text-sm">← Expediente de {d.mascota.nombre}</Enlace>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-n-900">{TIPOS_CITA[c.tipo_clave] ?? c.tipo_clave} · {d.mascota.nombre}</h1>
          {/* QA S41 (N140): al firmar, la insignia cambia con la respuesta (registros), sin esperar a recargar la página. */}
          <EstadoVivo
            t="vet_consultas"
            i={id}
            version={c.updated_at}
            estado={c.estado}
            etiquetas={{ firmada: "Firmada", anulada: "Anulada", borrador: "Borrador" }}
            clases={{ firmada: "bg-menta-suave text-menta-oscuro", anulada: "bg-coral-suave text-coral-oscuro", _: "bg-ambar-suave text-ambar-oscuro" }}
            claseBase="rounded-full px-2.5 py-1 text-xs font-semibold"
          />
          {c.modalidad === "telemedicina" && <span className="rounded-full bg-morado-suave px-2.5 py-1 text-xs font-semibold text-morado">Telemedicina</span>}
        </div>
        <p className="mt-1 text-n-700">
          {etiquetaEspecie(d.mascota.especie)}{d.mascota.raza ? ` · ${d.mascota.raza}` : ""} · de {d.dueno.nombre}{d.dueno.telefono ? ` · ${d.dueno.telefono}` : ""} · {formatearFecha(c.atendida_at, zona)}
        </p>
        <p className="text-sm text-n-600">A cargo de {d.medico.nombre} · cédula {d.medico.cedula}{d.medico.cpa ? ` · CPA ${d.medico.cpa}` : ""}</p>
        {/* QA S53 (N157): con receta emitida desde esta consulta, el botón es «Ver receta»; emitir otra queda como acción secundaria. */}
        {recetasVigentes.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2" data-recetas-consulta>
            {recetasVigentes.map((r) => (
              <Enlace key={r.id} href={`/veterinaria/recetas/${r.id}`} data-ver-receta>
                Ver receta N.º {r.numero}
              </Enlace>
            ))}
            {c.estado === "firmada" && puedeRecetar === true && miMedico != null && (
              <Enlace href={`/veterinaria/recetas/nueva?perro=${c.perro_id}&consulta=${id}`} data-emitir-receta>
                Emitir otra receta
              </Enlace>
            )}
          </div>
        )}
        {recetasVigentes.length === 0 && c.estado === "firmada" && puedeRecetar === true && miMedico != null && (
          <Enlace href={`/veterinaria/recetas/nueva?perro=${c.perro_id}&consulta=${id}`} className="mt-3" data-emitir-receta>
            Emitir receta
          </Enlace>
        )}
        {recetas.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-sm text-n-700" data-lista-recetas-consulta>
            {recetas.map((r) => (
              <li key={r.id}>
                <Enlace href={`/veterinaria/recetas/${r.id}`}>Receta N.º {r.numero}</Enlace>
                {" · "}{formatearFechaCalendario(r.fecha_emision)}{r.medicamentos ? ` · ${r.medicamentos}` : ""}{r.estado === "anulada" ? " · anulada" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      {anulada && (
        <Alert variante="error" titulo="Esta consulta está anulada">
          {unirFrases(`Motivo: ${c.anulada_motivo ?? ""}`, "Su contenido se conserva abajo, sin cambios, como parte del historial.")}
        </Alert>
      )}

      <UsoDictado consultaId={id} />

      <section className="rounded-lg border border-n-200 bg-white p-4" data-vacunas-consulta aria-labelledby="t-vacunas-consulta">
        <h2 id="t-vacunas-consulta" className="font-semibold text-n-900">Vacunas y desparasitación</h2>
        <AplicacionesConsulta
          consultaId={id}
          perroId={c.perro_id}
          vacunas={vacunasDelDia}
          desparasitaciones={desparasitacionesDelDia}
          puedeQuitar={puedeQuitar}
          deEsta={[...deEsta]}
          nacidas={[...nacidas]}
        />
      </section>

      {c.estado === "borrador" && puedeAtender === true ? (
        <EditorConsulta consulta={c} especie={d.mascota.especie} soyElMedico={soyElMedico} nombreMedico={d.medico.nombre} cargosIniciales={cargos} puedeCatalogo={puedeCatalogo} aplicarVacuna={aplicarVacuna} aplicarDesparasitacion={aplicarDesparasitacion} seAnulanAlDescartar={seAnulanAlDescartar} puedeEmitirReceta={puedeRecetar === true && miMedico != null} />
      ) : (
        <article className={`flex flex-col gap-5 rounded-lg border border-n-200 bg-white p-5 ${anulada ? "opacity-80" : ""}`}>
          {c.estado === "borrador" && <Alert variante="info" titulo="Borrador">Solo quien atiende consultas lo edita.</Alert>}
          {SECCIONES_CONSULTA.filter((s) => s.clave === "motivo" || s.clave === "anamnesis").map((s) => (
            <Bloque key={s.clave} etiqueta={s.etiqueta} texto={c[s.clave]} />
          ))}
          {vitalesConValor.length > 0 && (
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-n-600">Signos vitales</h3>
            <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              {vitalesConValor.map((v) => (
                <div key={v.clave}>
                  <dt className="text-n-500">{v.etiqueta}</dt>
                  <dd className="font-semibold text-n-900">{String(c[v.clave as keyof typeof c])} {v.unidad}</dd>
                </div>
              ))}
            </dl>
          </div>
          )}
          {SECCIONES_CONSULTA.filter((s) => s.clave === "examen_fisico" || s.clave === "hallazgos").map((s) => (
            <Bloque key={s.clave} etiqueta={s.etiqueta} texto={c[s.clave]} />
          ))}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-n-600">Diagnósticos</h3>
            {c.diagnosticos.length === 0 ? (
              <p className="text-n-700">Sin diagnósticos.</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {[...definitivos, ...presuntivos].map((x, i) => (
                  <li key={i} className="text-n-900">
                    <strong>{x.nombre}</strong> <span className="text-sm text-n-600">({x.tipo === "definitivo" ? "definitivo" : "presuntivo"}){x.nota ? ` · ${x.nota}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {SECCIONES_CONSULTA.filter((s) => s.clave === "plan" || s.clave === "tratamiento").map((s) => (
            <Bloque key={s.clave} etiqueta={s.etiqueta} texto={c[s.clave]} />
          ))}
          <Bloque etiqueta="Notas internas (el dueño no las ve)" texto={c.notas_internas} />
          {c.firmada_at && (
            <footer className="rounded-md border border-menta bg-menta-suave p-3 text-sm text-n-900">
              Firmada por <strong>{c.firma_nombre}</strong> · cédula profesional {c.firma_cedula}{c.firma_cpa ? ` · CPA ${c.firma_cpa}` : ""} · {formatearFecha(c.firmada_at, zona)}
              <br />
              <span className="text-xs text-n-600">Huella del contenido: {c.firma_hash?.slice(0, 16)}…</span>
            </footer>
          )}
        </article>
      )}

      {c.estado !== "borrador" && cargos && (cargos.lineas.length > 0 || cargos.reserva_id) && (
        <CargosConsulta consultaId={id} inicial={cargos} puedeAgregar={false} />
      )}

      {d.adendas.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Adendas</h2>
          {d.adendas.map((a) => (
            <article key={a.id} className="rounded-md border border-n-200 bg-n-50 p-3">
              <p className="whitespace-pre-wrap text-n-900">{a.texto}</p>
              <p className="mt-1 text-xs text-n-600">{a.firma_nombre} · cédula {a.firma_cedula}{a.firma_cpa ? ` · CPA ${a.firma_cpa}` : ""} · {formatearFecha(a.firmada_at, zona)}</p>
            </article>
          ))}
        </section>
      )}

      {c.estado === "firmada" && (soyElMedico || esAdmin) && (
        <AccionesFirmada id={id} puedeAdenda={miMedico != null} puedeAnular={soyElMedico || esAdmin} />
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Resultados de laboratorio</h2>
        {d.resultados.length === 0 ? (
          <p className="text-n-700">Sin resultados capturados en esta consulta.</p>
        ) : (
          d.resultados.map((r) => (
            <article key={r.id} className={`rounded-md border border-n-200 p-3 ${r.anulada_at ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={`font-semibold text-n-900 ${r.anulada_at ? "line-through" : ""}`}>{r.estudio}{r.laboratorio ? ` · ${r.laboratorio}` : ""} · {r.fecha_estudio}</p>
                {!r.anulada_at && puedeAtender === true && <AnularItem tipo="resultado" id={r.id} rutas={rutas} />}
              </div>
              {r.anulada_at && <p className="text-sm text-coral-oscuro">Anulado: {r.anulada_motivo}</p>}
              <TablaResponsiva className="mt-2 w-full text-sm">
                <thead><tr className="text-left text-n-500"><th className="py-1">Parámetro</th><th>Valor</th><th>Rango</th><th /></tr></thead>
                <tbody>
                  {r.parametros.map((p, i) => (
                    <tr key={i} className="border-t border-n-100">
                      <td className="py-1">{p.nombre}</td>
                      <td className={p.bandera === "alto" || p.bandera === "bajo" ? "font-bold text-ambar-oscuro" : ""}>{p.valor} {p.unidad ?? ""}</td>
                      <td className="text-n-600">{p.rango ?? "—"}</td>
                      <td className={p.bandera === "alto" || p.bandera === "bajo" ? "font-semibold text-ambar-oscuro" : "text-n-500"}>{etiquetaBandera(p.bandera)}</td>
                    </tr>
                  ))}
                </tbody>
              </TablaResponsiva>
              {r.notas && <p className="mt-1 text-sm text-n-700">{r.notas}</p>}
            </article>
          ))
        )}
        {puedeAtender === true && !anulada && <Desplegable texto="Capturar un resultado"><CapturarResultado perroId={c.perro_id} consultaId={id} hoy={hoy} /></Desplegable>}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Archivos</h2>
        {d.adjuntos.length === 0 ? (
          <p className="text-n-700">Sin archivos en esta consulta.</p>
        ) : (
          <ul className="divide-y divide-n-200">
            {d.adjuntos.map((a) => (
              <li key={a.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${a.anulada_at ? "opacity-60" : ""}`}>
                <span>
                  {a.anulada_at ? (
                    <span className="line-through">{a.nombre}</span>
                  ) : (
                    <Enlace href={`/api/veterinaria/adjunto/${a.id}`} target="_blank" rel="noopener">{a.nombre}</Enlace>
                  )}
                  {a.descripcion ? <span className="text-sm text-n-600"> · {a.descripcion}</span> : null}
                  {a.anulada_at ? <span className="text-sm text-coral-oscuro"> · anulado: {a.anulada_motivo}</span> : null}
                </span>
                {!a.anulada_at && puedeAtender === true && <AnularItem tipo="adjunto" id={a.id} rutas={rutas} />}
              </li>
            ))}
          </ul>
        )}
        {puedeAtender === true && !anulada && <Desplegable texto="Adjuntar una foto o PDF"><SubirAdjunto perroId={c.perro_id} consultaId={id} /></Desplegable>}
      </section>

      {puedeEstimar === true && c.estado !== "anulada" && (
        <p className="text-sm">
          <Enlace href={`/veterinaria/estimados/nuevo?perro=${c.perro_id}&consulta=${id}`}>Hacer un estimado de esta consulta →</Enlace>
        </p>
      )}
    </div>
  );
}

function Bloque({ etiqueta, texto: crudo }: { etiqueta: string; texto: string | null }) {
  // QA S22 (N111): las etiquetas de la plantilla sin contenido no se muestran; una sección vacía no sale.
  const texto = crudo ? sinTitulosVacios(crudo) : "";
  if (!texto) return null;
  return (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-wide text-n-600">{etiqueta}</h3>
      <p className="mt-1 whitespace-pre-wrap text-n-900">{texto}</p>
    </div>
  );
}
