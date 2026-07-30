import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
import { ContratoSeccion, type ContratoFila } from "../contrato-seccion";
import { BitacoraSeccion, type EntradaBitacora } from "../bitacora-seccion";
import { MedicamentosSeccion, type MedicamentoFila } from "../medicamentos-seccion";

export default async function PerroPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creado?: string }>;
}) {
  const { id } = await params;
  const { creado } = await searchParams;

  const sesion = await obtenerSesionConRol();
  if (!sesion) return null;

  const supabase = await createSupabaseServerClient();
  const [
    { data: perro },
    { data: tamanos },
    { data: pelajes },
    { data: estadoSanitario },
    { data: tiposRequisito },
    { data: historialCrudo },
    { data: pesos },
    { data: catalogoAlertas },
    { data: alertasCrudo },
    { data: alergias },
  ] = await Promise.all([
    supabase
      .from("perros")
      .select(
        "id, nombre, raza, sexo, esterilizado, fecha_nacimiento, tamano_id, pelaje_id, alimentacion_notas, temperamento_notas, fallecido, foto_path, cliente_id, clientes(nombre)"
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
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
    supabase.from("catalogo_alertas").select("id, etiqueta").is("deleted_at", null).order("orden"),
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
  ]);

  const { data: seriesActivas } = await supabase
    .from("series_recurrentes")
    .select("id, dias_semana, servicios(nombre)")
    .eq("perro_id", id)
    .is("deleted_at", null);

  const { data: contratosCrudo } = await supabase
    .from("contratos")
    .select("id, estado, storage_path, fecha_firma, created_at, motivo_cancelacion")
    .eq("perro_id", id)
    .order("created_at", { ascending: false });

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

  const contratos: ContratoFila[] = (contratosCrudo ?? []).map((c) => ({
    id: c.id,
    estado: c.estado,
    storagePath: c.storage_path,
    fechaFirma: c.fecha_firma,
    createdAt: c.created_at,
    motivoCancelacion: c.motivo_cancelacion,
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
            className="text-sm font-semibold text-azul hover:underline"
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
                className="flex items-center gap-2 rounded-md border-l-4 border-azul bg-azul-suave px-4 py-2.5 text-sm font-semibold text-azul hover:underline"
              >
                Serie recurrente activa: {servicio?.nombre ?? "—"} — {formatearDiasSemana(s.dias_semana as number[])}
              </Link>
            );
          })}
        </div>
      )}

      <ResumenSanitario items={(estadoSanitario as EstadoRequisitoItem[]) ?? []} tamano="grande" />

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
        tamanos={tamanos ?? []}
        pelajes={pelajes ?? []}
        valoresIniciales={{
          nombre: perro.nombre,
          raza: perro.raza,
          sexo: perro.sexo,
          esterilizado: perro.esterilizado,
          fecha_nacimiento: perro.fecha_nacimiento,
          tamano_id: perro.tamano_id,
          pelaje_id: perro.pelaje_id,
          alimentacion_notas: perro.alimentacion_notas,
          temperamento_notas: perro.temperamento_notas,
        }}
        textoBoton="Guardar cambios"
        soloLectura={soloLectura}
      />

      <div className="flex flex-col gap-4 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Requisitos sanitarios</h2>

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
        <div className="flex flex-col gap-4 border-t border-n-200 pt-6">
          <h2 className="text-lg font-bold text-n-900">Contrato</h2>
          <ContratoSeccion perroId={id} clienteId={perro.cliente_id} contratos={contratos} />
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
