import { cargarPendientesEstancia } from "@/lib/perros/pendientes-estancia";
import { PendientesEstancia } from "../pendientes-estancia";
import { notFound } from "next/navigation";
import Link from "next/link";
import { describirBono } from "@/lib/bonos/descripcion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cargarRazas } from "@/lib/razas";
import { negocioIdActual, zonaActual } from "@/lib/negocio/actual";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { PerroForm } from "../perro-form";
import { PerroFoto } from "../perro-foto";
import { actualizarPerro } from "../actions";
import { ResumenSanitario, type EstadoRequisitoItem } from "../resumen-sanitario";
import { RequisitoForm, type TipoRequisitoOpcion } from "../requisito-form";
import { RequisitosHistorial, type RequisitoAplicadoFila } from "../requisitos-historial";
import { PesoForm } from "../peso-form";
import { PesoResumen, type PesoFila } from "../peso-resumen";
import { AlertaCriticaBanner } from "../alerta-critica-banner";
import { AlertasManejo, type CatalogoAlertaOpcion, type AlertaActivaFila } from "../alertas-manejo";
import { AlergiasSeccion, type AlergiaFila } from "../alergias-seccion";
import { formatearDiasSemana } from "@/app/(staff)/reservas/series/dias-semana";
import { ContratoSeccion, type ContratoFila, type TipoContratoFila } from "../contrato-seccion";
import { BitacoraSeccion, type EntradaBitacora } from "../bitacora-seccion";
import { MedicamentosSeccion, type MedicamentoFila } from "../medicamentos-seccion";
import { RequisitosEstancia } from "../requisitos-estancia";
import { NotaSoloEstetica } from "../nota-solo-estetica";
import { hoyNegocio, formatearFechaCalendario } from "@/lib/formato";

export default async function PerroPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creado?: string }>;
}) {
  const zona = await zonaActual();
  const { id } = await params;
  const { creado } = await searchParams;

  const sesion = await obtenerSesionConRol();
  if (!sesion) return null;

  const supabase = await createSupabaseServerClient();
  const [
    { data: perro },
    razas,
    { data: tamanos },
    { data: pelajes },
    { data: estadoSanitario },
    { data: tiposRequisito },
    { data: historialCrudo },
    { data: pesos },
    { data: catalogoAlertas },
    { data: alertasCrudo },
    { data: alergias },
    { data: propuestasPendientes },
    { data: usaGuarderiaHotel },
  ] = await Promise.all([
    supabase
      .from("perros")
      .select(
        "id, nombre, raza, raza_id, sexo, esterilizado, fecha_nacimiento, tamano_id, pelaje_id, alimentacion_notas, temperamento_notas, contacto_emergencia_nombre, contacto_emergencia_telefono, veterinario_nombre, veterinario_telefono, veterinario_clinica, fallecido, foto_path, cliente_id, en_celo, gestante, evaluacion_comportamiento_fecha, evaluacion_comportamiento_por, evaluacion_comportamiento_notas, clientes(nombre)"
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    cargarRazas(supabase, await negocioIdActual(), { conGrupo: true }),
    supabase
      .from("tamanos_categoria")
      .select("id, etiqueta")
      .is("deleted_at", null)
      .order("orden"),
    supabase.from("tipos_pelaje").select("id, etiqueta").is("deleted_at", null).order("orden"),
    supabase
      .from("perro_requisitos_sanitarios_estado")
      .select("tipo_requisito_id, clave, etiqueta, es_critica, ultima_fecha_aplicacion, fecha_vencimiento, estado")
      .eq("perro_id", id),
    supabase
      .from("tipos_requisito_sanitario")
      .select("id, clave, etiqueta, categoria")
      .is("deleted_at", null)
      .order("orden"),
    supabase
      .from("requisitos_sanitarios_aplicados")
      .select(
        "id, fecha_aplicacion, fecha_vencimiento, detalle, notas, comprobante_path, tipos_requisito_sanitario(etiqueta)"
      )
      .eq("perro_id", id)
      .is("deleted_at", null)
      .order("fecha_aplicacion", { ascending: false }),
    supabase
      .from("pesos_registrados")
      .select("id, peso_kg, fecha, notas")
      .eq("perro_id", id)
      .is("deleted_at", null)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("catalogo_alertas").select("id, etiqueta, bloquea_estancia").is("deleted_at", null).order("orden"),
    supabase
      .from("perro_alertas")
      .select("id, alerta_id, notas, activa, catalogo_alertas(etiqueta)")
      .eq("perro_id", id)
      .eq("activa", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("perro_alergias")
      .select("id, alergeno, gravedad, notas")
      .eq("perro_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("requisitos_sanitarios_propuestos")
      .select("id, fecha_aplicacion, created_at, tipos_requisito_sanitario(etiqueta)")
      .eq("perro_id", id)
      .eq("estado", "pendiente")
      .is("deleted_at", null)
      .order("created_at"),
    supabase.from("perros_con_guarderia_hotel").select("perro_id").eq("perro_id", id).maybeSingle(),
  ]);
  const aplicanRequisitos = Boolean(usaGuarderiaHotel);
  // Qué le falta para guardería y hotel, aunque hoy solo use estética: es
  // justo el perro que llega a pedir guardería por primera vez.
  const pendientesEstancia = (await cargarPendientesEstancia(supabase, [id])).get(id) ?? [];
  const tiposContratoPendientes = new Set(
    pendientesEstancia.filter((p) => p.tipoContratoId).map((p) => p.tipoContratoId as string)
  );

  const { data: seriesActivas } = await supabase
    .from("series_recurrentes")
    .select("id, dias_semana, servicios(nombre)")
    .eq("perro_id", id)
    .is("deleted_at", null);

  // El nombre y la versión vienen de la plantilla con la que se firmó,
  // no del tipo "de ahora": si el contrato se renombró después, el
  // historial sigue diciendo con cuál se firmó en su momento.
  const { data: contratosCrudo } = await supabase
    .from("contratos")
    .select(
      "id, estado, storage_path, fecha_firma, created_at, motivo_cancelacion, regenerar_motivo, plantillas_contrato(version, tipo_contrato_id, tipos_contrato(nombre)), bonos_clientes(servicios(nombre))"
    )
    .eq("perro_id", id)
    .order("created_at", { ascending: false });

  // Tipos que se le pueden generar (los que tienen versión publicada y no
  // están archivados) y en qué estado va este perro con cada uno.
  const [{ data: tiposCrudo }, { data: estadoPorTipo }] = await Promise.all([
    supabase
      .from("tipos_contrato")
      .select("id, nombre, plantillas_contrato!inner(id)")
      .is("deleted_at", null)
      .eq("plantillas_contrato.activa", true)
      .order("orden")
      .order("nombre"),
    supabase
      .from("perros_contrato_estado")
      .select("tipo_contrato_id, estado")
      .eq("perro_id", id),
  ]);

  const { data: bitacoraCrudo } = await supabase
    .from("bitacora_entradas")
    .select("id, tipo, nota, foto_path, created_at, notificado_whatsapp_at")
    .eq("perro_id", id)
    .order("created_at", { ascending: false });

  const { data: medicamentosCrudo } = await supabase
    .from("perro_medicamentos")
    .select("id, medicamento, dosis, horario, fecha_inicio, fecha_fin, activo, notas")
    .eq("perro_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const idsMedicamentos = (medicamentosCrudo ?? []).map((m) => m.id);
  const { data: dosisCrudo } = idsMedicamentos.length
    ? await supabase
        .from("medicamentos_administrados")
        .select("id, perro_medicamento_id, administrado_at, omitida, notas")
        .in("perro_medicamento_id", idsMedicamentos)
        .order("administrado_at", { ascending: false })
    : { data: [] as { id: string; perro_medicamento_id: string; administrado_at: string; omitida: boolean; notas: string | null }[] };

  if (!perro) notFound();

  let urlFoto: string | null = null;
  if (perro.foto_path) {
    const { data } = await supabase.storage
      .from("perros-archivos")
      .createSignedUrl(perro.foto_path, 60 * 60);
    urlFoto = data?.signedUrl ?? null;
  }

  const historial: RequisitoAplicadoFila[] = await Promise.all(
    (historialCrudo ?? []).map(async (fila) => {
      let comprobante_url: string | null = null;
      if (fila.comprobante_path) {
        const { data } = await supabase.storage
          .from("perros-archivos")
          .createSignedUrl(fila.comprobante_path, 60 * 60);
        comprobante_url = data?.signedUrl ?? null;
      }
      const tipo = fila.tipos_requisito_sanitario as unknown as { etiqueta: string } | null;
      return {
        id: fila.id,
        fecha_aplicacion: fila.fecha_aplicacion,
        fecha_vencimiento: fila.fecha_vencimiento,
        detalle: fila.detalle,
        notas: fila.notas,
        tipo_etiqueta: tipo?.etiqueta ?? "—",
        comprobante_url,
      };
    })
  );

  const alertasActivas: AlertaActivaFila[] = (alertasCrudo ?? []).map((fila) => {
    const catalogo = fila.catalogo_alertas as unknown as { etiqueta: string } | null;
    return {
      id: fila.id,
      alerta_id: fila.alerta_id,
      etiqueta: catalogo?.etiqueta ?? "—",
      notas: fila.notas,
    };
  });
  const alergiasFilas = (alergias as AlergiaFila[]) ?? [];
  const alergiasGraves = alergiasFilas.filter((a) => a.gravedad === "grave");

  const cliente = perro.clientes as unknown as { nombre: string } | null;
  const actualizarConId = actualizarPerro.bind(null, id);
  const soloLectura = sesion.rol === "estetica";

  // Los paquetes de ESTE perro (el paquete es por perro: solo él lo usa).
  // Estética no ve saldos ni vende: es información de caja.
  const { data: paquetesCrudo } = soloLectura
    ? { data: [] as never[] }
    : await supabase
        .from("bonos_clientes_estado")
        .select(
          "id, servicio_nombre, cantidad_total, cantidad_disponible, fecha_compra, fecha_vencimiento, estado, ilimitado"
        )
        .eq("perro_id", id)
        .in("estado", ["activo", "agotado", "vencido"])
        .order("fecha_compra", { ascending: false })
        .limit(10);
  const paquetes = (paquetesCrudo ?? []) as {
    id: string;
    servicio_nombre: string;
    cantidad_total: number;
    cantidad_disponible: number;
    fecha_compra: string;
    fecha_vencimiento: string | null;
    estado: string;
    ilimitado: boolean;
  }[];

  // Requisitos de estancia: quién registró la evaluación (nombre, no
  // uuid) y qué alertas activas bloquean guardería/hotel según el
  // catálogo — la misma regla que aplica el trigger de estancias.
  const evaluadoPorId = perro.evaluacion_comportamiento_por as string | null;
  const { data: evaluador } = evaluadoPorId
    ? await supabase.from("profiles").select("nombre_completo").eq("id", evaluadoPorId).maybeSingle()
    : { data: null };
  const bloqueaPorAlertaId = new Map(
    (catalogoAlertas ?? []).map((c) => [c.id as string, Boolean(c.bloquea_estancia)])
  );
  const alertasBloqueantes = (alertasCrudo ?? [])
    .filter((a) => bloqueaPorAlertaId.get(a.alerta_id as string))
    .map((a) => {
      const catalogo = a.catalogo_alertas as unknown as { etiqueta: string } | null;
      return catalogo?.etiqueta ?? "—";
    });

  // El paquete (day pass o mensualidad) del que salió el contrato, si salió
  // de una compra.
  function nombrePaquete(b: unknown): string | null {
    const bono = (Array.isArray(b) ? b[0] : b) as { servicios: { nombre: string } | { nombre: string }[] | null } | null;
    const s = Array.isArray(bono?.servicios) ? bono?.servicios[0] : bono?.servicios;
    return s?.nombre ?? null;
  }

  const contratos: ContratoFila[] = (contratosCrudo ?? []).map((c) => {
    const plantilla = (Array.isArray(c.plantillas_contrato)
      ? c.plantillas_contrato[0]
      : c.plantillas_contrato) as unknown as
      | { version: number; tipo_contrato_id: string; tipos_contrato: { nombre: string } | { nombre: string }[] | null }
      | null;
    const tipo = Array.isArray(plantilla?.tipos_contrato)
      ? plantilla?.tipos_contrato[0]
      : plantilla?.tipos_contrato;
    return {
      id: c.id,
      estado: c.estado,
      storagePath: c.storage_path,
      fechaFirma: c.fecha_firma,
      createdAt: c.created_at,
      motivoCancelacion: c.motivo_cancelacion,
      tipoContratoId: plantilla?.tipo_contrato_id ?? null,
      tipoNombre: tipo?.nombre ?? "Contrato",
      version: plantilla?.version ?? null,
      regenerarMotivo: (c.regenerar_motivo as string | null) ?? null,
      paqueteNombre: nombrePaquete(c.bonos_clientes),
    };
  });

  const estadoContratoPorTipo = new Map(
    (estadoPorTipo ?? []).map((e) => [e.tipo_contrato_id as string, e.estado as string])
  );
  const tiposContrato: TipoContratoFila[] = (tiposCrudo ?? []).map((t) => ({
    id: t.id,
    nombre: t.nombre,
    // Aparecer en perros_contrato_estado ES la definición de "a este
    // perro se le pide": la vista ya filtró por las categorías de
    // servicio que el perro de verdad usa.
    // O que le falta para guardería y hotel: el perro que viene de
    // estética todavía no "usa" guardería, pero es el contrato que va a
    // firmar en el mostrador.
    aplica: estadoContratoPorTipo.has(t.id) || tiposContratoPendientes.has(t.id),
    estado: (estadoContratoPorTipo.get(t.id) ?? null) as TipoContratoFila["estado"],
  }));

  const entradasBitacora: EntradaBitacora[] = await Promise.all(
    (bitacoraCrudo ?? []).map(async (e) => {
      let foto_url: string | null = null;
      if (e.foto_path) {
        const { data } = await supabase.storage.from("perros-archivos").createSignedUrl(e.foto_path, 60 * 60);
        foto_url = data?.signedUrl ?? null;
      }
      return {
        id: e.id,
        tipo: e.tipo,
        nota: e.nota,
        foto_url,
        created_at: e.created_at,
        notificado_whatsapp_at: e.notificado_whatsapp_at,
      };
    })
  );

  const medicamentos: MedicamentoFila[] = (medicamentosCrudo ?? []).map((m) => ({
    id: m.id,
    medicamento: m.medicamento,
    dosis: m.dosis,
    horario: m.horario,
    fecha_inicio: m.fecha_inicio,
    fecha_fin: m.fecha_fin,
    activo: m.activo,
    notas: m.notas,
    dosisRegistradas: (dosisCrudo ?? [])
      .filter((d) => d.perro_medicamento_id === m.id)
      .map((d) => ({ id: d.id, administrado_at: d.administrado_at, omitida: d.omitida, notas: d.notas })),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        {perro.cliente_id && cliente && (
          <Link
            href={`/clientes/${perro.cliente_id}`}
            className="text-sm font-semibold text-morado hover:underline"
          >
            ← {cliente.nombre}
          </Link>
        )}
        <h1 className="mt-1 text-2xl font-bold text-n-900">{perro.nombre}</h1>
        <p className="mt-1 text-n-600">Expediente del perro.</p>
      </div>

      <AlertaCriticaBanner alertas={alertasActivas} alergiasGraves={alergiasGraves} tamano="grande" />

      {seriesActivas && seriesActivas.length > 0 && (
        <div className="flex flex-col gap-2">
          {seriesActivas.map((s) => {
            const servicio = Array.isArray(s.servicios) ? s.servicios[0] : s.servicios;
            return (
              <Link
                key={s.id}
                href={`/reservas/series/${s.id}`}
                className="flex items-center gap-2 rounded-md border-l-4 border-morado bg-morado-suave px-4 py-2.5 text-sm font-semibold text-morado hover:underline"
              >
                Serie recurrente activa: {servicio?.nombre ?? "—"} — {formatearDiasSemana(s.dias_semana as number[])}
              </Link>
            );
          })}
        </div>
      )}

      {aplicanRequisitos ? (
        <ResumenSanitario items={(estadoSanitario as EstadoRequisitoItem[]) ?? []} tamano="grande" />
      ) : (
        <NotaSoloEstetica />
      )}

      {!perro.fallecido && (
        <PendientesEstancia
          perroId={id}
          perroNombre={perro.nombre}
          clienteId={perro.cliente_id ?? null}
          pendientes={pendientesEstancia}
          catalogos={{ razas, tamanos: tamanos ?? [], pelajes: pelajes ?? [] }}
          enSuExpediente
          puedeEscribir={!soloLectura}
        />
      )}

      {perro.fallecido && (
        <Alert variante="advertencia" titulo="Este perro falleció">
          El expediente se conserva como parte del historial del cliente.
        </Alert>
      )}

      {creado === "1" && <Alert variante="exito" titulo="Perro creado correctamente" />}

      <PerroFoto
        perroId={id}
        urlInicial={urlFoto}
        tieneFotoInicial={Boolean(perro.foto_path)}
        soloLectura={soloLectura}
        tamano="grande"
      />

      <PerroForm
        action={actualizarConId}
        razas={razas}
        tamanos={tamanos ?? []}
        pelajes={pelajes ?? []}
        valoresIniciales={{
          nombre: perro.nombre,
          raza: perro.raza,
          raza_id: perro.raza_id,
          sexo: perro.sexo,
          esterilizado: perro.esterilizado,
          fecha_nacimiento: perro.fecha_nacimiento,
          tamano_id: perro.tamano_id,
          pelaje_id: perro.pelaje_id,
          alimentacion_notas: perro.alimentacion_notas,
          temperamento_notas: perro.temperamento_notas,
          contacto_emergencia_nombre: perro.contacto_emergencia_nombre,
          contacto_emergencia_telefono: perro.contacto_emergencia_telefono,
          veterinario_nombre: perro.veterinario_nombre,
          veterinario_telefono: perro.veterinario_telefono,
          veterinario_clinica: perro.veterinario_clinica,
        }}
        textoBoton="Guardar cambios"
        soloLectura={soloLectura}
      />

      <div id="requisitos-estancia" className="flex scroll-mt-6 flex-col gap-4 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Requisitos para guardería y hotel</h2>
        <RequisitosEstancia
          perroId={id}
          clienteId={perro.cliente_id ?? null}
          hoy={hoyNegocio(zona)}
          aplica={aplicanRequisitos}
          datos={{
            sexo: perro.sexo,
            en_celo: Boolean(perro.en_celo),
            gestante: Boolean(perro.gestante),
            evaluacion_comportamiento_fecha: perro.evaluacion_comportamiento_fecha,
            evaluacion_comportamiento_notas: perro.evaluacion_comportamiento_notas,
            evaluadoPorNombre: evaluador?.nombre_completo ?? null,
            alertasBloqueantes,
          }}
          soloLectura={soloLectura}
          esAdmin={sesion.rol === "admin"}
        />
      </div>

      <div id="sanitarios" className="flex scroll-mt-6 flex-col gap-4 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Requisitos sanitarios</h2>

        {propuestasPendientes && propuestasPendientes.length > 0 && (
          <Alert variante="advertencia" titulo="El dueño mandó comprobantes desde su portal">
            {propuestasPendientes.map((p) => {
              const tipo = (Array.isArray(p.tipos_requisito_sanitario)
                ? p.tipos_requisito_sanitario[0]
                : p.tipos_requisito_sanitario) as unknown as { etiqueta: string } | null;
              return (
                <span key={p.id as string} className="block">
                  {tipo?.etiqueta ?? "Requisito"} · aplicación del {formatearFechaCalendario(p.fecha_aplicacion as string)}
                </span>
              );
            })}
            <Link href="/recepcion/comprobantes" className="mt-1 block font-semibold text-morado hover:underline">
              Revisarlos en la bandeja de comprobantes →
            </Link>
          </Alert>
        )}

        {!soloLectura && (
          <RequisitoForm
            perroId={id}
            clienteId={perro.cliente_id}
            tipos={(tiposRequisito as TipoRequisitoOpcion[]) ?? []}
          />
        )}

        <RequisitosHistorial filas={historial} />
      </div>

      <div className="flex flex-col gap-4 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Peso</h2>
        <PesoForm perroId={id} />
        <PesoResumen historial={(pesos as PesoFila[]) ?? []} />
      </div>

      <div className="flex flex-col gap-4 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Alertas de manejo</h2>
        <AlertasManejo
          perroId={id}
          catalogo={(catalogoAlertas as CatalogoAlertaOpcion[]) ?? []}
          activas={alertasActivas}
        />
      </div>

      <div className="flex flex-col gap-4 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Alergias</h2>
        <AlergiasSeccion perroId={id} alergias={alergiasFilas} />
      </div>

      {!soloLectura && perro.cliente_id && (
        <div id="contrato" className="flex scroll-mt-6 flex-col gap-4 border-t border-n-200 pt-6">
          <h2 className="text-lg font-bold text-n-900">Contrato</h2>
          <ContratoSeccion
            perroId={id}
            clienteId={perro.cliente_id}
            tipos={tiposContrato}
            contratos={contratos}
          />
        </div>
      )}

      {!soloLectura && perro.cliente_id && (
        <div className="flex flex-col gap-3 border-t border-n-200 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-n-900">Day pass y mensualidad</h2>
            {!perro.fallecido && (
              <Link
                href={`/guarderia/pases?cliente=${perro.cliente_id}&perro=${id}`}
                className="text-sm font-semibold text-morado hover:underline"
              >
                Vender paquete para {perro.nombre}
              </Link>
            )}
          </div>
          {paquetes.length === 0 ? (
            <p className="text-n-600">
              {perro.nombre} no tiene paquetes. Los paquetes son por perro: el de otro perro del mismo
              dueño no le sirve.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {paquetes.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-n-200 bg-white px-4 py-3">
                  <span>
                    <span className="font-semibold text-n-900">{b.servicio_nombre}</span>
                    <span className="block text-sm text-n-700">{describirBono(b)}</span>
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      b.estado === "activo" ? "bg-menta-suave text-menta-oscuro" : b.estado === "vencido" ? "bg-coral-suave text-coral-oscuro" : "bg-n-100 text-n-600"
                    }`}
                  >
                    {b.estado === "activo" ? "Activo" : b.estado === "vencido" ? "Vencido" : "Agotado"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Bitácora</h2>
        <p className="-mt-2 text-sm text-n-600">
          Fotos y notas del día a día — el dueño las ve en su portal.
        </p>
        <BitacoraSeccion perroId={id} entradas={entradasBitacora} />
      </div>

      <div className="flex flex-col gap-4 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Medicamentos</h2>
        <p className="-mt-2 text-sm text-n-600">
          Régimen prescrito y cada dosis administrada — el dueño también lo ve.
        </p>
        <MedicamentosSeccion perroId={id} medicamentos={medicamentos} puedeEscribir={!soloLectura} />
      </div>
    </div>
  );
}
