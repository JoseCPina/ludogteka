"use client";
import { conTope } from "@/lib/ui/espera";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";
import { FirmarContrato } from "@/components/firmar-contrato";
import type { RazaOpcion } from "@/components/selector-raza";
import type { CotizacionEstetica } from "@/lib/estetica/cotizacion";
import { TIPOS_LINK_ALTA, type TipoLinkAlta } from "@/lib/alta/tipos-link";
import { completarAlta, subirFotoAlta, calcularDistanciaAlta, cerrarLinkSiCompleto, iniciarSesionPorTelefono } from "../acciones";
import { perroVacio, type ContratoPendiente, type PerroAlta } from "../tipos";
import { camposDeTipo } from "@/lib/alta/campos-perro";
import { TarjetaPerro, type Catalogo } from "./tarjeta-perro";
import { ComprobantesPerro, type Comprobantes } from "./comprobantes-perro";
import { ResumenRequisitos, type ResumenPerro } from "./resumen-requisitos";
import { subirComprobantesAlta } from "./subir-comprobantes";
import type { TipoRequisitoAlta } from "@/lib/alta/requisitos";

function Progreso({ pasos, paso }: { pasos: string[]; paso: number }) {
  return (
    <ol className="flex gap-2" aria-label="Progreso del alta">
      {pasos.map((etiqueta, i) => (
        <li key={etiqueta} className="flex flex-1 flex-col gap-1">
          <span
            className={`h-1.5 rounded-full ${i <= paso ? "bg-morado" : "bg-n-200"}`}
            aria-hidden="true"
          />
          <span className={`text-xs ${i === paso ? "font-bold text-morado" : "text-n-500"}`}>
            {etiqueta}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function AltaForm({
  token,
  tipo,
  razas,
  tamanos,
  pelajes,
  cotizacion,
  requisitos,
}: {
  token: string;
  tipo: TipoLinkAlta;
  razas: RazaOpcion[];
  tamanos: Catalogo[];
  pelajes: Catalogo[];
  cotizacion: CotizacionEstetica | null;
  // Las vacunas y desparasitación que el negocio pide para guardería u
  // hotel (null: este flujo o este negocio no las pide).
  requisitos: TipoRequisitoAlta[] | null;
}) {
  const router = useRouter();
  const definicion = TIPOS_LINK_ALTA[tipo];
  const campos = camposDeTipo(definicion.expedienteCompleto);
  // Los pasos, con «Vacunas» solo cuando hay algo que pedir. Los índices
  // salen de aquí y no de números fijos.
  const PASO_DATOS = 0;
  const PASO_PERROS = 1;
  const PASO_VACUNAS = requisitos ? 2 : -1;
  const PASO_CUENTA = requisitos ? 3 : 2;
  const PASO_CONTRATO = PASO_CUENTA + 1;
  const pasos = ["Tus datos", "Tus perros", ...(requisitos ? ["Vacunas"] : []), "Tu cuenta", "Tu contrato"];

  // La cuenta es obligatoria para quien va a dejar a su perro —el portal es
  // donde ve sus fotos, su salud y sus contratos— y opcional para quien solo
  // viene a bañarlo: pedirle una contraseña a esa persona es un trámite más
  // entre ella y agendar.
  //
  // Lo que se promete aquí sale de TIPOS_LINK_ALTA[tipo].cuentaMuestra, que
  // describe lo que el portal muestra de verdad: prometer de más es
  // mentirle al dueño.
  const cuentaOpcional = !definicion.expedienteCompleto;

  const [paso, setPaso] = useState(0);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [quiereRecoleccion, setQuiereRecoleccion] = useState(false);
  const [direccion, setDireccion] = useState("");
  const [crearCuenta, setCrearCuenta] = useState(!cuentaOpcional);
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [perros, setPerros] = useState<PerroAlta[]>([perroVacio()]);
  const [fotos, setFotos] = useState<(File | null)[]>([null]);
  // Comprobantes por perro (mismo índice que `perros`) y por tipo.
  const [comprobantes, setComprobantes] = useState<Comprobantes[]>([{}]);
  const [resumenRequisitos, setResumenRequisitos] = useState<ResumenPerro[]>([]);
  const enviando = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [contratos, setContratos] = useState<ContratoPendiente[]>([]);
  const [firmados, setFirmados] = useState<Set<string>>(new Set());
  const [terminadoSinCuenta, setTerminadoSinCuenta] = useState(false);

  function actualizarPerro(i: number, cambios: Partial<PerroAlta>) {
    setPerros((prev) => prev.map((p, j) => (i === j ? { ...p, ...cambios } : p)));
  }

  function agregarPerro() {
    setPerros((prev) => [...prev, perroVacio()]);
    setFotos((prev) => [...prev, null]);
    setComprobantes((prev) => [...prev, {}]);
  }

  function quitarPerro(i: number) {
    setPerros((prev) => prev.filter((_, j) => j !== i));
    setFotos((prev) => prev.filter((_, j) => j !== i));
    setComprobantes((prev) => prev.filter((_, j) => j !== i));
  }

  function siguiente() {
    setError(null);
    if (paso === PASO_DATOS) {
      if (!nombre.trim()) return setError("Escribe tu nombre.");
      if (telefono.replace(/[^0-9]/g, "").length !== 10) {
        return setError("El teléfono debe tener 10 dígitos.");
      }
      if (email.trim() && !email.includes("@")) {
        return setError("Ese correo no se ve bien. Revísalo o déjalo vacío.");
      }
    }
    if (paso === PASO_PERROS) {
      if (perros.some((p) => !p.nombre.trim())) {
        return setError("Cada perro necesita al menos un nombre.");
      }
    }
    if (paso === PASO_VACUNAS) {
      // Un archivo sin fecha, o una fecha futura, no se puede revisar.
      const malo = comprobantes.some((c) => Object.values(c).some((v) => v.archivo && !/^\d{4}-\d{2}-\d{2}$/.test(v.fecha)));
      if (malo) return setError("Escribe la fecha en que se aplicó cada comprobante que subiste.");
    }
    setPaso((p) => p + 1);
  }

  async function enviar() {
    setError(null);
    if (crearCuenta) {
      if (password.length < 6) return setError("La contraseña debe tener al menos 6 caracteres.");
      if (password !== confirmacion) return setError("Las dos contraseñas no coinciden.");
    }

    const direccionFinal = quiereRecoleccion ? direccion : "";

    const res = await enviando.ejecutar(() => completarAlta(token, {
      nombre,
      telefono,
      direccion: direccionFinal,
      email,
      crearCuenta,
      password,
      perros,
    }));

    if (res.error) {
      setError(res.error);
      return;
    }

    // A partir de aquí el alta YA ESTÁ HECHA: el expediente existe y los
    // perros existen. Nada de lo que sigue puede dejar al dueño mirando un
    // botón que no avanza — que es justo lo que pasaba antes del try/catch.
    let fallaronFotos = 0;
    let sesionAbierta = false;

    try {
      if (direccionFinal.trim()) {
        setAviso("Calculando la distancia a tu domicilio…");
        await conTope(calcularDistanciaAlta(token));
      }

      const creados = res.perros ?? [];
      if (requisitos) {
        const resumen = await subirComprobantesAlta(
          token,
          creados.map((p, i) => ({ perroId: p.id, nombre: p.nombre, pendientes: requisitos, valores: comprobantes[i] ?? {} })),
          setAviso
        );
        setResumenRequisitos(resumen);
      }
      const conFoto = creados.filter((_, i) => fotos[i]).length;
      let subidas = 0;
      for (let i = 0; i < creados.length; i += 1) {
        const archivo = fotos[i];
        if (!archivo) continue;
        subidas += 1;
        // El contador avanza a la vista: una foto de celular puede tardar,
        // y una pantalla que no se mueve se lee como colgada.
        setAviso(`Guardando la foto de ${creados[i].nombre} (${subidas} de ${conFoto})…`);
        const datosFoto = new FormData();
        datosFoto.append("foto", archivo);
        const resFoto = await conTope(subirFotoAlta(token, creados[i].id, datosFoto), 60_000);
        if (resFoto.error) fallaronFotos += 1;
      }

      if (crearCuenta) {
        setAviso("Abriendo tu sesión…");
        // Entra con el mismo teléfono que acaba de registrar. El correo con
        // el que Auth lo conoce lo resuelve el servidor (derivado del
        // número, o el de su cuenta de antes si ya era cliente de otro
        // negocio de PeluDesk) — nunca se le enseña ni se le pide.
        const res = await conTope(iniciarSesionPorTelefono(telefono, password));
        sesionAbierta = !res.error;
      }
    } catch {
      // Se traga el error a propósito: el alta ya quedó y no hay nada que
      // el dueño pueda hacer con un mensaje técnico.
      sesionAbierta = false;
    } finally {
      setAviso(null);
    }

    if (fallaronFotos > 0) {
      console.warn(`${fallaronFotos} foto(s) no se pudieron subir`);
    }

    // Sin cuenta no hay firma posible: el PDF lleva quién firmó y desde
    // dónde, y eso lo sella el servidor con una sesión real. El contrato
    // queda pendiente y recepción lo resuelve en el mostrador.
    if (!crearCuenta) {
      setTerminadoSinCuenta(true);
      return;
    }

    if (!sesionAbierta) {
      setError(
        "¡Tu registro quedó listo! Solo que no pudimos entrar a tu cuenta automáticamente: entra tú con tu teléfono y tu contraseña."
      );
      return;
    }

    const pendientes = res.contratos ?? [];
    if (pendientes.length === 0) {
      router.push("/portal");
      router.refresh();
      return;
    }
    setContratos(pendientes);
    setPaso(PASO_CONTRATO);
  }

  if (terminadoSinCuenta) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variante="exito" titulo="Listo, ya estás registrado">
          Ya tenemos los datos de{" "}
          {perros.map((p) => p.nombre.trim()).filter(Boolean).join(", ") || "tu perro"}. Puedes
          agendar por WhatsApp o pasando al mostrador.
        </Alert>
        <ResumenRequisitos resumen={resumenRequisitos} dondeSubir="Tráenos el carnet cuando vengas." />
        {definicion.llevaContrato && (
          <p className="text-n-600">
            Cuando llegues, recepción te va a pedir que firmes el contrato de{" "}
            {definicion.etiqueta.toLowerCase()}.
          </p>
        )}
        <p className="text-n-600">
          Si después quieres una cuenta para ver {definicion.cuentaMuestra}, pídela en recepción.
          Entras con este mismo teléfono.
        </p>
      </div>
    );
  }

  const faltanFirmas = contratos.filter((c) => !firmados.has(c.id));

  return (
    <div className="flex flex-col gap-6">
      <Progreso pasos={contratos.length > 0 ? pasos : pasos.slice(0, -1)} paso={paso} />

      {error && (
        <Alert variante="error" titulo="Revisa esto">
          {error}
        </Alert>
      )}
      {/* Si el registro quedó pero no la sesión, lo pendiente de vacunas se
          dice igual: el dueño no va a ver el portal en este momento. */}
      {error && paso === PASO_CUENTA && (
        <ResumenRequisitos resumen={resumenRequisitos} dondeSubir="Súbelo desde tu portal o tráenos el carnet." />
      )}

      {paso === PASO_DATOS && (
        <div className="flex flex-col gap-4">
          <Field
            label="Tu nombre completo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
          />
          <Field
            label="Tu teléfono"
            inputMode="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="444 123 4567"
            ayuda={
              cuentaOpcional
                ? "Con este número te identificamos. Si abres tu cuenta, también entras con él."
                : "Con este número te identificamos y con él entras a tu cuenta."
            }
          />
          <Field
            label="Tu correo (opcional)"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            ayuda="Opcional. No lo necesitas para registrarte."
          />

          {/* La dirección solo le sirve a quien quiere que pasemos por su
              perro. Preguntársela a todos es un campo largo, en un celular,
              que la mayoría no va a usar. */}
          <label className="flex items-start gap-2 rounded-md border-[1.5px] border-n-200 bg-white p-3 text-n-900">
            <input
              type="checkbox"
              checked={quiereRecoleccion}
              onChange={(e) => setQuiereRecoleccion(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span>
              Quiero que pasen por mi perro a mi casa
              <span className="block text-sm text-n-600">
                Con tu dirección calculamos cuánto cuesta el traslado. También la puedes dar
                después.
              </span>
            </span>
          </label>

          {quiereRecoleccion && (
            <Field
              label="Tu dirección"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder="Calle, número, colonia y ciudad"
            />
          )}

          <div className="flex justify-end">
            <Button type="button" onClick={siguiente}>
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {paso === PASO_PERROS && (
        <div className="flex flex-col gap-4">
          {requisitos && (
            <p className="text-sm text-n-600">Las vacunas y la desparasitación van en el siguiente paso.</p>
          )}

          {perros.map((perro, i) => (
            <TarjetaPerro
              key={i}
              perro={perro}
              titulo={perro.nombre.trim() || `Perro ${i + 1}`}
              campos={campos}
              razas={razas}
              tamanos={tamanos}
              pelajes={pelajes}
              cotizacion={cotizacion}
              foto={fotos[i] ?? null}
              onCambio={(cambios) => actualizarPerro(i, cambios)}
              onFoto={(archivo) => setFotos((prev) => prev.map((f, j) => (i === j ? archivo : f)))}
              onQuitar={perros.length > 1 ? () => quitarPerro(i) : null}
            />
          ))}

          <Button type="button" variante="secundario" onClick={agregarPerro} className="self-start">
            Agregar otro perro
          </Button>

          <div className="flex justify-between">
            <Button type="button" variante="secundario" onClick={() => setPaso(PASO_DATOS)}>
              Atrás
            </Button>
            <Button type="button" onClick={siguiente}>
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {paso === PASO_VACUNAS && requisitos && (
        <div className="flex flex-col gap-4">
          <Alert variante="advertencia" titulo="Vacunas y desparasitación">
            Súbenos la foto o el PDF del carnet de cada perro, con la fecha en que se aplicó cada una.
            Recepción lo revisa y queda registrado. Si no lo tienes a la mano, puedes seguir: lo que
            falte queda «sin registro» y tu perro no podrá quedarse en guardería ni hotel hasta que lo
            tengamos.
          </Alert>
          {perros.map((perro, i) => (
            <ComprobantesPerro
              key={i}
              titulo={perro.nombre.trim() || `Perro ${i + 1}`}
              requisitos={requisitos.map((r) => ({ ...r, estado: "sin_registro" as const, en_revision: false }))}
              valores={comprobantes[i] ?? {}}
              onCambio={(tipoId, valor) =>
                setComprobantes((prev) =>
                  prev.map((c, j) => (i === j ? { ...c, [tipoId]: valor } : c))
                )
              }
            />
          ))}
          <div className="flex justify-between">
            <Button type="button" variante="secundario" onClick={() => setPaso(PASO_PERROS)}>
              Atrás
            </Button>
            <Button type="button" onClick={siguiente}>
              {perros.every((_, i) => !Object.values(comprobantes[i] ?? {}).some((v) => v.archivo)) ? "Seguir sin subirlas" : "Siguiente"}
            </Button>
          </div>
        </div>
      )}

      {paso === PASO_CUENTA && (
        <div className="flex flex-col gap-4">
          {cuentaOpcional ? (
            <div className="flex flex-col gap-3 rounded-md border-[1.5px] border-n-200 bg-white p-4 text-n-900">
              <div>
                <p className="font-bold">¿Quieres una cuenta para ver las citas de tu perro?</p>
                <p className="mt-1 text-sm text-n-600">
                  Desde tu celular ves {definicion.cuentaMuestra}. {definicion.comoSeAgenda} Si no la
                  quieres ahora, tu registro queda completo igual y la puedes pedir en recepción cuando
                  quieras.
                </p>
              </div>
              <label className="flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={crearCuenta}
                  onChange={(e) => setCrearCuenta(e.target.checked)}
                  className="h-4 w-4"
                />
                Sí, quiero mi cuenta
              </label>
            </div>
          ) : (
            <p className="text-n-600">
              En tu cuenta ves {definicion.cuentaMuestra}. {definicion.comoSeAgenda}
            </p>
          )}

          {crearCuenta && (
            <>
              <p className="text-sm text-n-600">
                Vas a entrar con tu teléfono <strong>{telefono || "…"}</strong> y esta contraseña.
              </p>
              <Field
                label="Tu contraseña"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                ayuda="Al menos 6 caracteres. Si se te olvida, recepción te la restablece por WhatsApp."
              />
              <Field
                label="Repite tu contraseña"
                type="password"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
              />
            </>
          )}

          {aviso && <Alert variante="advertencia" titulo={aviso} />}

          <AccionesFormulario error={error} className="[&>div]:justify-between">
            <Button
              type="button"
              variante="secundario"
              cargando={enviando.cargando}
              onClick={() => setPaso(requisitos ? PASO_VACUNAS : PASO_PERROS)}
            >
              Atrás
            </Button>
            <Button type="button" cargando={enviando.cargando} onClick={enviar}>
              {enviando.cargando ? "Guardando…" : "Terminar mi registro"}
            </Button>
          </AccionesFormulario>
        </div>
      )}

      {paso === PASO_CONTRATO && (
        <div className="flex flex-col gap-4">
          <Alert variante="exito" titulo="Tu registro ya quedó">
            Falta lo último: firmar {contratos.length === 1 ? "el contrato" : "los contratos"} de{" "}
            {definicion.etiqueta.toLowerCase()}. Puedes leerlo completo antes de firmar.
          </Alert>
          <ResumenRequisitos resumen={resumenRequisitos} dondeSubir="Las puedes subir después desde tu portal, o tráenos el carnet." />

          {contratos.map((contrato) => (
            <FirmarContrato
              key={contrato.id}
              contratoId={contrato.id}
              tipoNombre={contrato.tipo_nombre}
              subtitulo={contrato.perro_nombre}
              estado={firmados.has(contrato.id) ? "firmado_digital" : "pendiente_firma"}
              storagePath={null}
              onFirmado={() => {
                setFirmados((prev) => new Set(prev).add(contrato.id));
                // Con la última firma el link queda cumplido. Si falla, se
                // cierra solo la próxima vez que se abra.
                void conTope(cerrarLinkSiCompleto(token)).catch(() => undefined);
              }}
            />
          ))}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              onClick={() => {
                router.push("/portal");
                router.refresh();
              }}
            >
              {faltanFirmas.length === 0 ? "Entrar a mi portal" : "Entrar y firmar después"}
            </Button>
            {faltanFirmas.length > 0 && (
              <p className="text-sm text-n-600">
                Si prefieres leerlo con calma, entra a tu portal: el contrato te va a estar
                esperando ahí, y este mismo link también te trae de vuelta a firmarlo. Recepción
                te lo puede dar en papel cuando llegues.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
