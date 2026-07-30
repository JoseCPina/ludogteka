import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { formatearFechaCalendario } from "@/lib/formato";
import { PerroFoto } from "@/app/(staff)/perros/perro-foto";
import { ResumenSanitario, type EstadoRequisitoItem } from "@/app/(staff)/perros/resumen-sanitario";
import { MiPerroForm } from "../../mi-perro-form";
import { RecordatorioSanitario } from "../../recordatorio-sanitario";
import { FirmarContrato } from "./firmar-contrato";

const ESTILO_GRAVEDAD: Record<string, string> = {
  grave: "border-naranja bg-naranja-suave text-naranja-oscuro",
  moderada: "border-amarillo bg-amarillo-suave text-amarillo-oscuro",
  leve: "border-n-300 bg-n-100 text-n-700",
};

export default async function MiPerroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sesion = await obtenerSesionConRol();
  if (!sesion?.clienteId) return null;

  const supabase = await createSupabaseServerClient();

  const [{ data: perro }, { data: estadoSanitario }, { data: alergias }] = await Promise.all([
    supabase
      .from("perros")
      .select(
        "id, nombre, raza, sexo, esterilizado, fecha_nacimiento, fallecido, foto_path, cliente_id, temperamento_notas, contacto_emergencia_nombre, contacto_emergencia_telefono, veterinario_nombre, veterinario_telefono, veterinario_clinica, autorizacion_medica_notas, tope_gasto_autorizado, alimentacion_notas, tamanos_categoria(etiqueta), tipos_pelaje(etiqueta)"
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("perro_requisitos_sanitarios_estado")
      .select(
        "tipo_requisito_id, clave, etiqueta, es_critica, ultima_fecha_aplicacion, fecha_vencimiento, estado"
      )
      .eq("perro_id", id),
    // Alergias sí las ve el dueño; las alertas de manejo (perro_alertas)
    // nunca se consultan aquí — ese es justamente el límite que no debe
    // cruzarse en el portal.
    supabase
      .from("perro_alergias")
      .select("id, alergeno, gravedad, notas")
      .eq("perro_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (!perro) notFound();

  const esPropio = perro.cliente_id === sesion.clienteId;

  // Solo el dueño principal firma — un acceso compartido nunca puede
  // firmar en nombre de otro, aunque vea el resto del expediente.
  const { data: contrato } = esPropio
    ? await supabase
        .from("contratos")
        .select("id, estado, storage_path")
        .eq("perro_id", id)
        .neq("estado", "cancelado")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  let urlFoto: string | null = null;
  if (perro.foto_path) {
    const { data } = await supabase.storage
      .from("perros-archivos")
      .createSignedUrl(perro.foto_path, 60 * 60);
    urlFoto = data?.signedUrl ?? null;
  }

  const tamano = perro.tamanos_categoria as unknown as { etiqueta: string } | null;
  const pelaje = perro.tipos_pelaje as unknown as { etiqueta: string } | null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/portal" className="text-sm font-semibold text-azul hover:underline">
          ← Tus perros
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-n-900">{perro.nombre}</h1>
          {perro.fallecido && (
            <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">
              Falleció
            </span>
          )}
          {!esPropio && (
            <span className="rounded-full bg-turquesa-suave px-2 py-0.5 text-xs font-semibold text-turquesa-oscuro">
              Acceso compartido
            </span>
          )}
        </div>
        {!esPropio && (
          <p className="mt-1 text-sm text-n-600">
            Tienes acceso de solo lectura a este perro — la edición la maneja su dueño principal.
          </p>
        )}
      </div>

      <PerroFoto
        perroId={id}
        urlInicial={urlFoto}
        tieneFotoInicial={Boolean(perro.foto_path)}
        soloLectura
        tamano="grande"
      />

      <div className="grid max-w-lg grid-cols-2 gap-4 rounded-lg border border-n-200 bg-white p-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-n-600">Raza</p>
          <p className="text-n-900">{perro.raza ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-n-600">Sexo</p>
          <p className="text-n-900">
            {perro.sexo === "macho" ? "Macho" : perro.sexo === "hembra" ? "Hembra" : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-n-600">Esterilizado</p>
          <p className="text-n-900">
            {perro.esterilizado === true ? "Sí" : perro.esterilizado === false ? "No" : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-n-600">Nacimiento</p>
          <p className="text-n-900">
            {perro.fecha_nacimiento ? formatearFechaCalendario(perro.fecha_nacimiento) : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-n-600">Tamaño</p>
          <p className="text-n-900">{tamano?.etiqueta ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-n-600">Pelaje</p>
          <p className="text-n-900">{pelaje?.etiqueta ?? "—"}</p>
        </div>
        {perro.temperamento_notas && (
          <div className="col-span-2">
            <p className="text-xs font-bold uppercase tracking-wide text-n-600">Temperamento</p>
            <p className="text-n-900">{perro.temperamento_notas}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Estado de salud</h2>
        <ResumenSanitario items={(estadoSanitario as EstadoRequisitoItem[]) ?? []} tamano="grande" />
        <RecordatorioSanitario items={(estadoSanitario as EstadoRequisitoItem[]) ?? []} />
      </div>

      {esPropio && contrato && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-n-900">Contrato</h2>
          <FirmarContrato contratoId={contrato.id} estado={contrato.estado} storagePath={contrato.storage_path} />
        </div>
      )}

      {alergias && alergias.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-n-900">Alergias</h2>
          <ul className="flex flex-col gap-2">
            {alergias.map((a) => (
              <li
                key={a.id}
                className={`rounded-md border-[1.5px] p-3 ${
                  ESTILO_GRAVEDAD[a.gravedad ?? "leve"] ?? ESTILO_GRAVEDAD.leve
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{a.alergeno}</span>
                  {a.gravedad && (
                    <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-bold uppercase tracking-wide">
                      {a.gravedad}
                    </span>
                  )}
                </div>
                {a.notas && <p className="mt-1 text-sm">{a.notas}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Tus datos</h2>
        {esPropio ? (
          <MiPerroForm
            perroId={id}
            valoresIniciales={{
              contacto_emergencia_nombre: perro.contacto_emergencia_nombre,
              contacto_emergencia_telefono: perro.contacto_emergencia_telefono,
              veterinario_nombre: perro.veterinario_nombre,
              veterinario_telefono: perro.veterinario_telefono,
              veterinario_clinica: perro.veterinario_clinica,
              autorizacion_medica_notas: perro.autorizacion_medica_notas,
              tope_gasto_autorizado: perro.tope_gasto_autorizado,
              alimentacion_notas: perro.alimentacion_notas,
            }}
          />
        ) : (
          <Alert variante="advertencia" titulo="Solo lectura">
            Este perro no es tuyo directamente — solo su dueño principal puede editar estos datos.
          </Alert>
        )}
      </div>
    </div>
  );
}
