"use client";

import { useModulos } from "@/components/modulos-contexto";
import { faltantesAltaPerro } from "@/lib/perros/alta-requisitos";
import { tallaYPelajeAlElegirRaza } from "@/lib/perros/talla-sugerida";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CampoVersion, conForzar } from "@/components/concurrencia/campo-version";
import { versionMasReciente } from "@/lib/concurrencia/tipos";
import { AvisoConflicto } from "@/components/concurrencia/aviso-conflicto";
import { useAccionConTope } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";
import { BorradorFormulario } from "@/lib/borradores/borrador-formulario";
import { SelectorRaza, type RazaOpcion } from "@/components/selector-raza";
import type { EstadoPerroForm } from "./actions";
import { proponerRazaDesdeFormulario } from "./raza-propuesta-actions";
import type { PropuestaRazaVista } from "@/lib/razas-propuesta";
import { ESPECIES, ETIQUETA_ESPECIE, type Especie } from "@/lib/perros/ficha-clinica";
import { vocabularioMascota } from "@/lib/perros/vocabulario";

const ESTADO_INICIAL: EstadoPerroForm = { error: null };

export type CategoriaOpcion = { id: string; etiqueta: string };

export function PerroForm({
  action,
  razas,
  tamanos,
  pelajes,
  valoresIniciales,
  textoBoton,
  soloLectura = false,
  perroId = null,
  version = null,
  grupos = [],
  puedeAsignarGrupo = false,
  propuestaInicial = null,
  corta = false,
  clinico = false,
  clinicoIniciales,
  borrador,
  alta,
  especieInicial,
}: {
  action: (estadoPrevio: EstadoPerroForm, formData: FormData) => Promise<EstadoPerroForm>;
  razas: RazaOpcion[];
  tamanos: CategoriaOpcion[];
  pelajes: CategoriaOpcion[];
  valoresIniciales?: {
    nombre: string;
    raza: string | null;
    raza_id: string | null;
    sexo: string | null;
    esterilizado: boolean | null;
    fecha_nacimiento: string | null;
    tamano_id: string | null;
    pelaje_id: string | null;
    alimentacion_notas: string | null;
    temperamento_notas: string | null;
    contacto_emergencia_nombre?: string | null;
    contacto_emergencia_telefono?: string | null;
    veterinario_nombre?: string | null;
    veterinario_telefono?: string | null;
    veterinario_clinica?: string | null;
  };
  textoBoton: string;
  soloLectura?: boolean;
  // El perro que se edita: con él, «agregar esta raza» lo liga en el momento.
  perroId?: string | null;
  /** updated_at del perro al cargar la pantalla (QA N43). */
  version?: string | null;
  // Solo con «Precios y tarifas»: sin él no llegan ni los nombres de los grupos.
  grupos?: { id: string; nombre: string }[];
  puedeAsignarGrupo?: boolean;
  propuestaInicial?: PropuestaRazaVista | null;
  // Alta corta de estética: nombre, raza, tamaño y pelaje. Lo demás se
  // captura después en el expediente.
  corta?: boolean;
  // Campos de ficha clínica (especie, microchip, folio, notas): el padre solo
  // lo prende con Veterinaria activa Y el permiso «Editar ficha clínica».
  clinico?: boolean;
  clinicoIniciales?: {
    especie: Especie;
    especie_detalle: string | null;
    microchip: string | null;
    folio_registro: string | null;
    notas_clinicas: string | null;
  };
  // Autoguardado del alta: el formulario y el registro (el dueño al que se le agrega la mascota).
  borrador?: { formulario: string; clave?: string };
  /**
   * QA S39 (N137): es un alta (con el nombre del dueño): el formulario pinta su título. Con Veterinaria pregunta primero
   * la especie y todo se adapta a ella (título, razas, campos de perro). `textoBoton` puede llevar «{mascota}».
   */
  alta?: { clienteNombre: string };
  /** La especie de la mascota que se edita (la cambia la ficha clínica): las palabras y los campos que aplican. */
  especieInicial?: Especie;
}) {
  // Con Estética, guardería u hotel la raza es obligatoria (si es mestizo, se escoge «Mestizo»): lo exige también el servidor.
  const modulos = useModulos();
  const pideRazaNegocio = modulos.tiene("estetica") || modulos.tiene("guarderia") || modulos.tiene("hotel");
  const [estado, formAction, enviando] = useActionState(useAccionConTope(action), ESTADO_INICIAL);
  const ultimo = useRef<FormData | null>(null);
  // La cabecera del expediente y los bloques de arriba se ponen al día al guardar (QA S14).
  const router = useRouter();
  useEffect(() => {
    if (estado.ok && perroId) router.refresh();
  }, [estado, perroId, router]);
  const deshabilitado = enviando || soloLectura;
  // QA S39 (N137): con Veterinaria, el alta pregunta primero la especie (sin escoger, nada más se pide eso) y las
  // palabras, las razas y los campos se adaptan a ella. Sin Veterinaria todo es de perro.
  const conVet = modulos.tiene("veterinaria");
  const preguntaEspecie = conVet && Boolean(alta);
  const [especie, setEspecie] = useState<Especie | "">(clinicoIniciales?.especie ?? especieInicial ?? (preguntaEspecie ? "" : "perro"));
  const v = vocabularioMascota({ conVet, especie: especie || null });
  const esPerro = !conVet || especie === "perro";
  const listo = !preguntaEspecie || especie !== "";

  // Un mestizo (o una raza que este negocio no mete en ningún grupo de precio)
  // se cobra por talla Y pelaje: sin los dos, no hay precio de estética.
  const [razaElegida, setRazaElegida] = useState<{ raza_id: string | null; raza: string; propuesta?: boolean }>({
    raza_id: valoresIniciales?.raza_id ?? null,
    raza: valoresIniciales?.raza ?? "",
  });
  const razaCatalogo = razas.find((r) => r.id === razaElegida.raza_id) ?? null;
  // Tamaño y pelaje: la raza del catálogo los sugiere (Labrador: grande, corto) cuando aún están vacíos; nunca borra lo capturado (N126).
  const [tamanoId, setTamanoId] = useState(valoresIniciales?.tamano_id ?? "");
  const [pelajeId, setPelajeId] = useState(valoresIniciales?.pelaje_id ?? "");
  // El aviso del último intento de guardar se esconde en cuanto se cambia lo que decía que faltaba.
  const [errorDescartado, setErrorDescartado] = useState<string | null>(null);
  // QA S16 (N80): la raza vacía se avisa junto al campo, antes de ir al servidor.
  const [faltaRaza, setFaltaRaza] = useState(false);
  function alElegirRaza(v: { raza_id: string | null; raza: string; propuesta?: boolean }) {
    setErrorDescartado(estado.error ?? null);
    if (v.raza_id || v.raza.trim()) setFaltaRaza(false);
    setRazaElegida(v);
    const sugerido = tallaYPelajeAlElegirRaza(razas.find((x) => x.id === v.raza_id), { tamanoId, pelajeId });
    setTamanoId(sugerido.tamanoId);
    setPelajeId(sugerido.pelajeId);
  }
  // Una raza nueva en revisión no es un mestizo: su precio sale del grupo que se le dé.
  const conPropuesta = Boolean(razaElegida.propuesta) || (Boolean(propuestaInicial) && razaElegida.raza_id === null);
  // La MISMA regla que valida al guardar (faltantesAltaPerro, gemela de perro_faltantes_alta): con Estética, tamaño y
  // pelaje cuando la raza no fija el precio sola; con solo guardería u hotel, únicamente la raza.
  const modulosActivos = ["estetica", "guarderia", "hotel"].filter((m) => modulos.tiene(m));
  // QA S16 (N64): «recomendado» es para hotel y guardería; sin ellas, esos datos son opcionales y una clínica no
  // pregunta por «su veterinario».
  const conEstanciasForm = modulos.tiene("guarderia") || modulos.tiene("hotel");
  const rec = conEstanciasForm ? "(recomendado)" : "(opcional)";
  const pideVeterinarioExterno = conEstanciasForm || !modulos.tiene("veterinaria");
  // Raza, tamaño y pelaje obligatorios son para el precio de estética y las estancias de un perro.
  const pideRaza = pideRazaNegocio && esPerro;
  const pideTallaYPelaje = esPerro && faltantesAltaPerro(
    { raza: razaElegida.raza, raza_id: razaElegida.raza_id, raza_propuesta: conPropuesta },
    modulosActivos,
    razas
  ).includes("tamaño");
  const errorVisible = estado.error && estado.error !== errorDescartado ? estado.error : null;
  // Una raza con nombre propio (Labrador) cuyo precio sale de la matriz de tamaño y pelaje: no es «mestizo», solo se cobra así.
  const razaPorMatriz = Boolean(razaCatalogo && !razaCatalogo.es_desconocida && !/mestiz|criollo/i.test(razaCatalogo.nombre) && razaCatalogo.grupo_depende_pelaje);

  return (
    // Se envía con onSubmit (no con action=): React 19 vacía los campos sin estado después de una acción del
    // formulario, y un error de validación del servidor (falta la raza) borraba lo que ya se había escrito.
    <form
      method="post"
      onSubmit={(e) => {
        e.preventDefault();
        if (pideRaza && !razaElegida.raza_id && !razaElegida.raza.trim()) {
          setFaltaRaza(true);
          e.currentTarget.querySelector<HTMLElement>("[data-selector-raza] input")?.focus();
          return;
        }
        const datos = new FormData(e.currentTarget);
        ultimo.current = datos;
        setErrorDescartado(null);
        startTransition(() => formAction(datos));
      }}
      className="flex max-w-lg flex-col gap-4"
    >
      {alta && (
        <div>
          <h1 className="text-2xl font-bold text-n-900" data-titulo-alta>{v.nuevo}</h1>
          <p className="mt-1 text-n-600">
            Se va a registrar como {v.nombre} de {alta.clienteNombre}.
          </p>
        </div>
      )}
      {!alta && conVet && especie && <input type="hidden" name="especie_vigente" value={especie} />}
      {perroId && <CampoVersion versiones={[{ t: "perros", i: perroId, v: versionMasReciente(estado.version, version) }]} registros={estado.registros} />}
      {estado.conflicto && (
        <AvisoConflicto
          conflicto={estado.conflicto}
          registro="esta mascota"
          cargando={enviando}
          onRecargar={() => window.location.reload()}
          onGuardarEncima={() => {
            if (ultimo.current) {
              const fd = conForzar(ultimo.current);
              startTransition(() => formAction(fd));
            }
          }}
        />
      )}
      {borrador && !soloLectura && <BorradorFormulario formulario={borrador.formulario} clave={borrador.clave} />}
      {errorVisible && (
        <Alert variante="error" titulo="No se pudo guardar">
          {estado.error}
        </Alert>
      )}
      {estado.ok && <Alert variante="exito" titulo="Cambios guardados" />}
      {soloLectura && (
        <Alert variante="advertencia" titulo="Solo lectura">
          Solo admin o recepción pueden editar los datos base {v.del}.
        </Alert>
      )}

      {preguntaEspecie && (
        <div className="grid gap-4 sm:grid-cols-2" data-pregunta-especie>
          <Select
            label="Especie"
            name="especie"
            required
            disabled={deshabilitado}
            value={especie}
            onChange={(e) => {
              setEspecie(e.target.value as Especie | "");
              setRazaElegida({ raza_id: null, raza: "" });
              setTamanoId("");
              setPelajeId("");
            }}
          >
            <option value="">Elige la especie</option>
            {ESPECIES.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESPECIE[e]}
              </option>
            ))}
          </Select>
          {especie === "otro" && (
            <Field label="¿Cuál?" name="especie_detalle" required disabled={deshabilitado} placeholder="ej. Conejo, hurón" />
          )}
        </div>
      )}

      {listo && (<>
      <Field
        label={`Nombre ${v.del}`}
        name="nombre"
        required
        disabled={deshabilitado}
        defaultValue={valoresIniciales?.nombre}
      />
      {especie !== "otro" && (
      <SelectorRaza
        key={especie}
        razas={razas}
        especie={especie === "gato" ? "gato" : "perro"}
        label={pideRaza ? "Raza (obligatoria)" : "Raza"}
        disabled={deshabilitado}
        mostrarGrupo={modulos.tiene("estetica") && esPerro}
        valorId={valoresIniciales?.raza_id ?? null}
        valorTexto={valoresIniciales?.raza ?? ""}
        onElegida={alElegirRaza}
        // QA S27: el precio de estética solo se menciona si el negocio tiene Estética (un hotel no la tiene).
        ayuda={esPerro ? `${modulos.tiene("estetica") ? "De aquí sale el precio de estética. " : ""}Si no está en la lista, usa «No la encuentro: agregar esta raza».` : "Si no sabes cuál es, escoge «Mestizo» o «Doméstico de pelo corto»."}
        // Agregar una raza nueva al catálogo (con su grupo de precio) es del catálogo de perros.
        propuestas={esPerro ? {
          modo: "personal",
          tamanos,
          pelajes,
          grupos,
          puedeAsignarGrupo,
          propuestaInicial,
          proponer: perroId ? (datos) => proponerRazaDesdeFormulario({ ...datos, perroId }) : undefined,
        } : undefined}
      />
      )}
      {faltaRaza && (
        <p role="alert" data-falta-raza className="-mt-2 text-sm font-semibold text-coral-oscuro">
          Escribe la raza {v.del}. Si no sabes cuál es, escoge «Mestizo».
        </p>
      )}

      {!corta && (
        <>
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Sexo"
          name="sexo"
          disabled={deshabilitado}
          defaultValue={valoresIniciales?.sexo ?? ""}
        >
          <option value="">No especificado</option>
          <option value="macho">Macho</option>
          <option value="hembra">Hembra</option>
        </Select>
        <Select
          label="Esterilizado"
          name="esterilizado"
          disabled={deshabilitado}
          defaultValue={
            valoresIniciales?.esterilizado === true
              ? "si"
              : valoresIniciales?.esterilizado === false
                ? "no"
                : ""
          }
        >
          <option value="">No especificado</option>
          <option value="si">Sí</option>
          <option value="no">No</option>
        </Select>
      </div>

      <Field
        label="Fecha de nacimiento (recomendado)"
        name="fecha_nacimiento"
        type="date"
        disabled={deshabilitado}
        defaultValue={valoresIniciales?.fecha_nacimiento ?? ""}
      />

        </>
      )}

      {pideTallaYPelaje && (
        <p data-pide-talla-pelaje className="-mb-2 rounded-md border-l-4 border-ambar bg-ambar-suave px-3 py-2 text-sm text-n-800">
          {razaPorMatriz && razaCatalogo ? (
            <>
              {razaCatalogo.nombre} no tiene un precio propio en la lista: su precio de estética sale de su <strong>tamaño</strong> y su <strong>pelaje</strong> (corto, medio o largo).
              {razaCatalogo.tamano_tipico_id || razaCatalogo.pelaje_tipico_id ? " Ya van sugeridos los típicos de la raza: confírmalos o cámbialos." : ""} Sin los dos no se puede agendar.
            </>
          ) : (
            <>
              Es mestizo o sin raza de catálogo: su precio de estética sale de su <strong>tamaño</strong> y su <strong>pelaje</strong> (corto, medio o largo). Sin los dos no se
              puede agendar.
            </>
          )}
        </p>
      )}
      {esPerro && (
      <div className="grid grid-cols-2 gap-4" data-talla-pelaje>
        <Select
          label={pideTallaYPelaje ? "Tamaño (obligatorio)" : "Tamaño"}
          name="tamano_id"
          required={pideTallaYPelaje}
          disabled={deshabilitado}
          value={tamanoId}
          onChange={(e) => {
            setErrorDescartado(estado.error ?? null);
            setTamanoId(e.target.value);
          }}
        >
          <option value="">{pideTallaYPelaje ? "Elige el tamaño" : "No especificado"}</option>
          {tamanos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.etiqueta}
            </option>
          ))}
        </Select>
        <Select
          label={pideTallaYPelaje ? "Pelaje (obligatorio)" : "Pelaje"}
          name="pelaje_id"
          required={pideTallaYPelaje}
          disabled={deshabilitado}
          value={pelajeId}
          onChange={(e) => {
            setErrorDescartado(estado.error ?? null);
            setPelajeId(e.target.value);
          }}
        >
          <option value="">{pideTallaYPelaje ? "Elige el pelaje" : "No especificado"}</option>
          {pelajes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.etiqueta}
            </option>
          ))}
        </Select>
      </div>
      )}

      {!corta && (
        <>
      <Textarea
        label={`Notas de alimentación ${rec}`}
        name="alimentacion_notas"
        disabled={deshabilitado}
        defaultValue={valoresIniciales?.alimentacion_notas ?? ""}
        ayuda="El dueño también puede editar esto desde su portal."
      />
      <Textarea
        label="Temperamento"
        name="temperamento_notas"
        disabled={deshabilitado}
        defaultValue={valoresIniciales?.temperamento_notas ?? ""}
        ayuda="Descripción general. Las alertas de manejo (muerde, se escapa, etc.) van aparte."
      />

      {/* Los pide el alta de guardería y hotel. Antes solo entraban por el
          link del dueño: recepción no tenía dónde capturarlos. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={`Contacto de emergencia ${rec}`}
          name="contacto_emergencia_nombre"
          disabled={deshabilitado}
          defaultValue={valoresIniciales?.contacto_emergencia_nombre ?? ""}
        />
        <Field
          label={`Teléfono de emergencia ${rec}`}
          name="contacto_emergencia_telefono"
          inputMode="tel"
          disabled={deshabilitado}
          defaultValue={valoresIniciales?.contacto_emergencia_telefono ?? ""}
        />
        {pideVeterinarioExterno && (<>
        <Field
          label={`Veterinario ${rec}`}
          name="veterinario_nombre"
          disabled={deshabilitado}
          defaultValue={valoresIniciales?.veterinario_nombre ?? ""}
        />
        <Field
          label={`Teléfono del veterinario ${rec}`}
          name="veterinario_telefono"
          inputMode="tel"
          disabled={deshabilitado}
          defaultValue={valoresIniciales?.veterinario_telefono ?? ""}
        />
        </>)}
      </div>
      {pideVeterinarioExterno && (
      <Field
        label={`Clínica del veterinario ${rec}`}
        name="veterinario_clinica"
        disabled={deshabilitado}
        defaultValue={valoresIniciales?.veterinario_clinica ?? ""}
      />
      )}

        </>
      )}

      {clinico && !corta && (
        <>
          <input type="hidden" name="clinico" value="1" />
          <div className="grid gap-4 sm:grid-cols-2">
            {/* En el alta la especie ya se preguntó arriba. */}
            {!preguntaEspecie && (
            <Select
              label="Especie"
              name="especie"
              disabled={deshabilitado}
              value={especie}
              onChange={(e) => setEspecie(e.target.value as Especie)}
            >
              {ESPECIES.map((e) => (
                <option key={e} value={e}>
                  {ETIQUETA_ESPECIE[e]}
                </option>
              ))}
            </Select>
            )}
            {!preguntaEspecie && especie === "otro" && (
              <Field
                label="¿Cuál?"
                name="especie_detalle"
                required
                disabled={deshabilitado}
                defaultValue={clinicoIniciales?.especie_detalle ?? ""}
              />
            )}
            <Field
              label="Microchip (opcional)"
              name="microchip"
              disabled={deshabilitado}
              defaultValue={clinicoIniciales?.microchip ?? ""}
              ayuda="De 9 a 20 letras o números, sin espacios."
            />
            <Field
              label="Folio de registro (opcional)"
              name="folio_registro"
              disabled={deshabilitado}
              defaultValue={clinicoIniciales?.folio_registro ?? ""}
              ayuda="Por ejemplo, el folio del RUAC."
            />
          </div>
          <Textarea
            label="Notas clínicas (opcional)"
            name="notas_clinicas"
            disabled={deshabilitado}
            defaultValue={clinicoIniciales?.notas_clinicas ?? ""}
            ayuda="Son internas del negocio: el dueño no las ve."
          />
        </>
      )}

      </>)}

      {!soloLectura && (
        <AccionesFormulario error={errorVisible} exito={estado.ok && "Cambios guardados"}>
          <Button type="submit" cargando={enviando} disabled={!listo}>
            {enviando ? "Guardando…" : textoBoton.replace("{mascota}", v.nombre)}
          </Button>
        </AccionesFormulario>
      )}
    </form>
  );
}
