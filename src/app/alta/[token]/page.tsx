import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { formatearFecha } from "@/lib/formato";
import { cargarRazas } from "@/lib/razas";
import { cargarCotizacionEstetica } from "@/lib/estetica/cotizacion";
import { TIPOS_LINK_ALTA, esTipoLinkAlta, type TipoLinkAlta } from "@/lib/alta/tipos-link";
import { AltaForm } from "./alta-form";
import { CompletarForm, type PerroExistente } from "./completar-form";
import {
  RequisitosGuarderiaHotel,
  type RequisitoSanitarioPublico,
  type HorarioDia,
} from "./requisitos-guarderia-hotel";
import { CAMPOS_BASE, CAMPOS_EXPEDIENTE, type CampoPerro } from "@/lib/alta/campos-perro";

// Pantalla pública: no hay sesión todavía (la cuenta se crea al final) y
// por eso NO está en las zonas protegidas del middleware. Lo único que la
// abre es el token del link.
//
// Los catálogos se leen con la secret key porque sus políticas de RLS son
// `to authenticated` y aquí no hay nadie autenticado. Son catálogos
// (razas, tamaños y tipos de pelaje), no datos de nadie: lo que se expone
// es la misma lista que ve cualquier empleado, sin tocar el RLS de las
// tablas que sí traen información de clientes.

// Qué le falta a un perro que ya existe. "Falta" es literalmente estar
// vacío: este formulario público nunca reescribe un dato capturado, así
// que preguntar por algo que ya está sería pedirle a alguien que teclee
// para nada.
function camposFaltantes(
  perro: Record<string, unknown>,
  expedienteCompleto: boolean
): CampoPerro[] {
  const vacio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
  const candidatos: CampoPerro[] = expedienteCompleto
    ? [...CAMPOS_BASE, ...CAMPOS_EXPEDIENTE]
    : [...CAMPOS_BASE];

  return candidatos.filter((campo) => {
    // La raza es el caso especial: un perro capturado antes del catálogo
    // tiene el texto escrito a mano y raza_id vacío. Ese perro cotiza con
    // el grupo por defecto, y su dueño es justamente quien puede
    // arreglarlo — así que se le pregunta aunque el texto esté lleno.
    if (campo === "raza") return vacio(perro.raza_id);
    return vacio(perro[campo]);
  });
}

export default async function AltaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();

  const { data: invitacion } = await admin
    .from("invitaciones_cliente")
    .select(
      "id, nombre_referencia, tipo, cliente_id, expira_at, alta_completada_at, usada_at, cancelada_at"
    )
    .eq("token", token)
    .is("deleted_at", null)
    .maybeSingle();

  // El link vive hasta que el dueño termine TODO lo que le pedía, no se
  // consume en el primer paso. Estados, en orden:
  //
  //   sin fila / cancelado   -> no se abre.
  //   en curso               -> ya guardó sus datos; la base revisa si ya
  //                             no le falta nada (p. ej. firmó desde el
  //                             portal) y en ese caso lo cierra aquí mismo.
  //   usado (todo completo)  -> se le reconoce y se le manda a su portal,
  //                             no "no podemos abrir este link".
  //   vencido sin usarse     -> pide otro. Un link en curso NO vence para
  //                             terminar lo que empezó.
  //   pendiente              -> el formulario que le toque.
  let completo = Boolean(invitacion?.usada_at);
  if (invitacion && !invitacion.cancelada_at && !completo && invitacion.alta_completada_at) {
    const { data: cierre } = await admin.rpc("cerrar_invitacion_si_completa", { p_token: token });
    completo = Boolean((cierre as { completa?: boolean } | null)?.completa);
  }

  if (invitacion && !invitacion.cancelada_at && completo) {
    const tipoCumplido: TipoLinkAlta = esTipoLinkAlta(invitacion.tipo as string) ? (invitacion.tipo as TipoLinkAlta) : "guarderia_hotel";
    return <LinkCumplido clienteId={invitacion.cliente_id as string | null} tipo={tipoCumplido} />;
  }

  const problema = !invitacion
    ? "Este link no existe. Revisa que lo hayas copiado completo, o pídele uno nuevo a recepción."
    : invitacion.cancelada_at
      ? "Este link fue cancelado. Pídele uno nuevo a recepción."
      : new Date(invitacion.expira_at as string) <= new Date() && !invitacion.alta_completada_at
        ? "Este link ya venció. Pídele uno nuevo a recepción."
        : null;

  if (problema) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6">
        <h1 className="text-2xl font-bold text-n-900">Alta en Ludogteka</h1>
        <Alert variante="advertencia" titulo="No podemos abrir este link">
          {problema}
        </Alert>
        <a href="/login" className="text-sm font-semibold text-azul hover:underline">
          Ir a iniciar sesión →
        </a>
      </main>
    );
  }

  const tipo: TipoLinkAlta = esTipoLinkAlta(invitacion!.tipo as string)
    ? (invitacion!.tipo as TipoLinkAlta)
    : "guarderia_hotel";
  const definicion = TIPOS_LINK_ALTA[tipo];

  // El catálogo de razas viaja SIN el grupo de precio: el dueño escoge la
  // raza de su perro, no el cajón en el que el negocio lo cobra. Mandar el
  // grupo aunque no se pinte sería dejarlo servido en el HTML.
  const [razas, { data: tamanos }, { data: pelajes }, { data: requisitosCrudo }, { data: horarioCrudo }] =
    await Promise.all([
      cargarRazas(admin),
      admin.from("tamanos_categoria").select("id, etiqueta").is("deleted_at", null).order("orden"),
      admin.from("tipos_pelaje").select("id, etiqueta").is("deleted_at", null).order("orden"),
      // Lo que se le va a pedir al perro en guardería/hotel, dicho desde
      // el registro: las vacunas y vigencias reales del catálogo, y el
      // horario configurado. Catálogo y configuración, no datos de nadie.
      definicion.llevaContrato
        ? admin
            .from("tipos_requisito_sanitario")
            .select("etiqueta, vigencia_meses")
            .eq("obligatoria", true)
            .is("deleted_at", null)
            .order("orden")
        : Promise.resolve({ data: null }),
      definicion.llevaContrato
        ? admin.rpc("horario_semana_vigente")
        : Promise.resolve({ data: null }),
    ]);

  // El horario vigente lo decide la base (horario_semana_vigente): la
  // misma generación de configuración que usan las reservas.
  const horario: HorarioDia[] = ((horarioCrudo ?? []) as HorarioDia[]).map((h) => ({
    dia_semana: h.dia_semana,
    hora_apertura: h.hora_apertura,
    hora_cierre: h.hora_cierre,
  }));
  const requisitos: RequisitoSanitarioPublico[] = (requisitosCrudo ?? []) as RequisitoSanitarioPublico[];
  const bloqueRequisitos = definicion.llevaContrato ? (
    <RequisitosGuarderiaHotel requisitos={requisitos} horario={horario} />
  ) : null;

  // La cotización solo se carga —y solo viaja— en el flujo que la usa.
  const cotizacion = definicion.muestraPrecioEstetica
    ? await cargarCotizacionEstetica(admin)
    : null;

  // Qué tallas se le ofrecen al dueño en el flujo de estética. La
  // distinción importa y ya viene resuelta en la cotización:
  //
  //   no_aplica  -> el negocio no la ofrece: se oculta.
  //   sin_tarifa -> falta capturar ese precio: SE SIGUE OFRECIENDO. Si se
  //                 ocultara, el dueño no podría escoger el tamaño de su
  //                 perro y el olvido de captura desaparecería de la
  //                 vista — en la matriz un hueco sale alarmante, aquí se
  //                 iría en silencio. El panel de admin lo reporta.
  const tamanosTodos = (tamanos as { id: string; etiqueta: string }[]) ?? [];
  const tamanosOfrecidos = cotizacion
    ? cotizacion.tallas.map((t) => ({ id: t.id, etiqueta: t.etiqueta }))
    : tamanosTodos;

  const catalogos = {
    razas,
    tamanos: tamanosOfrecidos,
    pelajes: (pelajes as { id: string; etiqueta: string }[]) ?? [],
    cotizacion,
  };

  // ───── Complemento: el expediente ya existe ─────
  if (invitacion!.cliente_id) {
    const clienteId = invitacion!.cliente_id as string;

    const [{ data: cliente }, { data: perrosCrudo }, { data: perfil }] = await Promise.all([
      admin.from("clientes").select("id, nombre, telefono, direccion").eq("id", clienteId).single(),
      admin
        .from("perros")
        .select(
          "id, nombre, raza, raza_id, sexo, fecha_nacimiento, tamano_id, pelaje_id, alimentacion_notas, contacto_emergencia_nombre, contacto_emergencia_telefono, veterinario_nombre, veterinario_telefono, veterinario_clinica"
        )
        .eq("cliente_id", clienteId)
        .is("deleted_at", null)
        .order("nombre"),
      admin.from("profiles").select("id").eq("cliente_id", clienteId).limit(1).maybeSingle(),
    ]);

    if (!cliente) {
      return (
        <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6">
          <Alert variante="advertencia" titulo="No podemos abrir este link">
            No encontramos tu expediente. Avísale a recepción.
          </Alert>
        </main>
      );
    }

    const perros: PerroExistente[] = (perrosCrudo ?? []).map((p) => ({
      id: p.id as string,
      nombre: p.nombre as string,
      raza: (p.raza as string | null) ?? "",
      raza_id: (p.raza_id as string | null) ?? null,
      campos: camposFaltantes(p as Record<string, unknown>, definicion.expedienteCompleto),
    }));

    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6">
        <header>
          <h1 className="text-2xl font-bold text-n-900">Hola de nuevo, {cliente.nombre}</h1>
          <p className="mt-1 text-n-600">
            Ya te tenemos registrado. Para {definicion.etiqueta.toLowerCase()} solo te pedimos los
            datos que faltan{definicion.llevaContrato ? " y la firma del contrato" : ""}. Lo que ya
            nos diste no lo vuelves a llenar.
          </p>
          <p className="mt-2 text-sm text-n-500">
            {invitacion!.alta_completada_at
              ? "Este link es tuyo: puedes abrirlo las veces que necesites hasta terminar."
              : `Este link es tuyo. Vence el ${formatearFecha(invitacion!.expira_at as string)}, y si lo dejas a medias puedes volver a abrirlo para terminar.`}
          </p>
        </header>

        {bloqueRequisitos}

        <CompletarForm
          token={token}
          tipo={tipo}
          clienteNombre={cliente.nombre as string}
          clienteTelefono={(cliente.telefono as string | null) ?? ""}
          faltaDireccion={!((cliente.direccion as string | null) ?? "").trim()}
          tieneCuenta={Boolean(perfil)}
          perros={perros}
          {...catalogos}
        />
      </main>
    );
  }

  // ───── Alta nueva ─────
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-n-900">Bienvenido a Ludogteka</h1>
        <p className="mt-1 text-n-600">
          {definicion.muestraPrecioEstetica
            ? "Regístrate y cuéntanos de tu perro. Con su raza te decimos cuánto cuesta su baño."
            : "Regístrate y cuéntanos de tu perro. Toma unos minutos y lo puedes hacer desde el celular."}
        </p>
        <p className="mt-2 text-sm text-n-500">
          Este link es tuyo. Vence el {formatearFecha(invitacion!.expira_at as string)}, y si lo
          dejas a medias puedes volver a abrirlo para terminar.
        </p>
      </header>

      {bloqueRequisitos}

      <AltaForm token={token} tipo={tipo} {...catalogos} />
    </main>
  );
}

// Ya no queda nada por hacer con este link. Se le manda a su portal —
// directo si ya tiene la sesión abierta en este navegador, y si no, al
// login con su teléfono. Si el expediente no tiene cuenta (estética sin
// portal), se le dice que su registro quedó y cómo abrir una.
async function LinkCumplido({ clienteId, tipo }: { clienteId: string | null; tipo: TipoLinkAlta }) {
  const definicion = TIPOS_LINK_ALTA[tipo];
  const admin = createSupabaseAdminClient();
  const { data: perfil } = clienteId
    ? await admin.from("profiles").select("id").eq("cliente_id", clienteId).limit(1).maybeSingle()
    : { data: null };

  let sesionEsDelDueno = false;
  if (perfil) {
    const supabase = await createSupabaseServerClient();
    const { data: sesion } = await supabase.auth.getUser();
    sesionEsDelDueno = sesion.user?.id === perfil.id;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold text-n-900">Ya quedó todo</h1>
      {perfil ? (
        <>
          <Alert variante="exito" titulo="Ya terminaste tu registro">
            No te falta nada por llenar ni por firmar. En tu cuenta ves {definicion.cuentaMuestra}.
          </Alert>
          <a
            href={sesionEsDelDueno ? "/portal" : "/login"}
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-azul px-5 font-bold text-white hover:opacity-90"
          >
            {sesionEsDelDueno ? "Entrar a mi portal →" : "Entrar con mi teléfono →"}
          </a>
          {!sesionEsDelDueno && (
            <p className="text-sm text-n-600">
              Entras con tu teléfono y la contraseña que escogiste. Si no la recuerdas, pídele a
              recepción que te la restablezca por WhatsApp.
            </p>
          )}
        </>
      ) : (
        <>
          <Alert variante="exito" titulo="Ya terminaste tu registro">
            Puedes agendar por WhatsApp o pasando al mostrador.
          </Alert>
          <p className="text-sm text-n-600">
            Si quieres una cuenta para ver {definicion.cuentaMuestra}, pídela en recepción. Entras
            con este mismo teléfono.
          </p>
        </>
      )}
    </main>
  );
}
