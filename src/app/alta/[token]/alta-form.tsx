"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { FirmarContrato } from "@/components/firmar-contrato";
import type { RazaOpcion } from "@/components/selector-raza";
import type { CotizacionEstetica } from "@/lib/estetica/cotizacion";
import { correoSinteticoDeTelefono } from "@/lib/auth/identidad";
import { TIPOS_LINK_ALTA, type TipoLinkAlta } from "@/lib/alta/tipos-link";
import { completarAlta, subirFotoAlta, calcularDistanciaAlta } from "../acciones";
import { perroVacio, type ContratoPendiente, type PerroAlta } from "../tipos";
import { camposDeTipo } from "@/lib/alta/campos-perro";
import { TarjetaPerro, type Catalogo } from "./tarjeta-perro";

const PASOS = ["Tus datos", "Tus perros", "Tu cuenta", "Tu contrato"];

function Progreso({ paso, total }: { paso: number; total: number }) {
  return (
    <ol className="flex gap-2" aria-label="Progreso del alta">
      {PASOS.slice(0, total).map((etiqueta, i) => (
        <li key={etiqueta} className="flex flex-1 flex-col gap-1">
          <span
            className={`h-1.5 rounded-full ${i <= paso ? "bg-azul" : "bg-n-200"}`}
            aria-hidden="true"
          />
          <span className={`text-xs ${i === paso ? "font-bold text-azul" : "text-n-500"}`}>
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
}: {
  token: string;
  tipo: TipoLinkAlta;
  razas: RazaOpcion[];
  tamanos: Catalogo[];
  pelajes: Catalogo[];
  cotizacion: CotizacionEstetica | null;
}) {
  const router = useRouter();
  const definicion = TIPOS_LINK_ALTA[tipo];
  const campos = camposDeTipo(definicion.expedienteCompleto);

  // La cuenta es obligatoria para quien va a dejar a su perro —el portal es
  // donde ve sus fotos y sus reservas— y opcional para quien solo viene a
  // bañarlo: pedirle una contraseña a esa persona es un trámite más entre
  // ella y agendar.
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
  const [enviando, setEnviando] = useState(false);
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
  }

  function quitarPerro(i: number) {
    setPerros((prev) => prev.filter((_, j) => j !== i));
    setFotos((prev) => prev.filter((_, j) => j !== i));
  }

  function siguiente() {
    setError(null);
    if (paso === 0) {
      if (!nombre.trim()) return setError("Escribe tu nombre.");
      if (telefono.replace(/[^0-9]/g, "").length !== 10) {
        return setError("El teléfono debe tener 10 dígitos.");
      }
      if (email.trim() && !email.includes("@")) {
        return setError("Ese correo no se ve bien. Revísalo o déjalo vacío.");
      }
    }
    if (paso === 1) {
      if (perros.some((p) => !p.nombre.trim())) {
        return setError("Cada perro necesita al menos un nombre.");
      }
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

    setEnviando(true);
    const res = await completarAlta(token, {
      nombre,
      telefono,
      direccion: direccionFinal,
      email,
      crearCuenta,
      password,
      perros,
    });

    if (res.error) {
      setEnviando(false);
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
        await calcularDistanciaAlta(token);
      }

      const creados = res.perros ?? [];
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
        const resFoto = await subirFotoAlta(token, creados[i].id, datosFoto);
        if (resFoto.error) fallaronFotos += 1;
      }

      if (crearCuenta) {
        setAviso("Abriendo tu sesión…");
        const supabase = createSupabaseBrowserClient();
        // Entra con el mismo teléfono que acaba de registrar. El correo
        // interno con el que Auth lo conoce se deriva de ese número —
        // nunca se le enseña ni se le pide.
        const { error: errorSesion } = await supabase.auth.signInWithPassword({
          email: correoSinteticoDeTelefono(telefono),
          password,
        });
        sesionAbierta = !errorSesion;
      }
    } catch {
      // Se traga el error a propósito: el alta ya quedó y no hay nada que
      // el dueño pueda hacer con un mensaje técnico.
      sesionAbierta = false;
    } finally {
      setEnviando(false);
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
        "¡Tu alta quedó lista! Solo no pudimos abrirte la sesión automáticamente: entra con tu teléfono y tu contraseña."
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
    setPaso(3);
  }

  if (terminadoSinCuenta) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variante="exito" titulo="Listo, ya estás registrado">
          Ya tenemos los datos de{" "}
          {perros.map((p) => p.nombre.trim()).filter(Boolean).join(", ") || "tu perro"}. Puedes
          agendar por WhatsApp o pasando al mostrador.
        </Alert>
        <p className="text-n-600">
          Cuando llegues, recepción te va a pedir que firmes el contrato de{" "}
          {definicion.etiqueta.toLowerCase()}.
        </p>
        <p className="text-n-600">
          Si después quieres ver a tu perro desde tu celular, pídele a recepción que te abra tu
          cuenta: se usa este mismo teléfono.
        </p>
      </div>
    );
  }

  const totalPasos = contratos.length > 0 ? 4 : 3;
  const faltanFirmas = contratos.filter((c) => !firmados.has(c.id));

  return (
    <div className="flex flex-col gap-6">
      <Progreso paso={paso} total={totalPasos} />

      {error && (
        <Alert variante="error" titulo="Revisa esto">
          {error}
        </Alert>
      )}

      {paso === 0 && (
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
            ayuda="Con este número te reconocemos, y con él entras a tu portal."
          />
          <Field
            label="Tu correo (opcional)"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            ayuda="Solo si lo quieres dar. No hace falta para nada de esto."
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
              Me interesa que pasen por mi perro a domicilio
              <span className="block text-sm text-n-600">
                Con tu dirección calculamos la distancia para cotizarlo. La puedes dar después.
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

      {paso === 1 && (
        <div className="flex flex-col gap-4">
          {/* El aviso de vacunas es de quien va a dejar a su perro: a un
              baño de dos horas no se le revisa el carnet. */}
          {definicion.expedienteCompleto && (
            <Alert variante="advertencia" titulo="Las vacunas no se capturan aquí">
              Recepción las revisa con tu carnet físico cuando lleguen. No te preocupes por eso
              ahora.
            </Alert>
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
            <Button type="button" variante="secundario" onClick={() => setPaso(0)}>
              Atrás
            </Button>
            <Button type="button" onClick={siguiente}>
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {paso === 2 && (
        <div className="flex flex-col gap-4">
          {cuentaOpcional ? (
            <label className="flex items-start gap-2 rounded-md border-[1.5px] border-n-200 bg-white p-3 text-n-900">
              <input
                type="checkbox"
                checked={crearCuenta}
                onChange={(e) => setCrearCuenta(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span>
                Quiero mi cuenta para ver a mi perro desde el celular
                <span className="block text-sm text-n-600">
                  Sus fotos del día, sus citas y sus contratos. Si no la quieres ahora, tu registro
                  queda igual y la puedes abrir después.
                </span>
              </span>
            </label>
          ) : (
            <p className="text-n-600">
              Con tu cuenta vas a poder ver a{" "}
              {perros.map((p) => p.nombre.trim()).filter(Boolean).join(", ") || "tu perro"} desde tu
              celular: sus fotos del día, sus reservas y sus contratos.
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

          <div className="flex justify-between">
            <Button
              type="button"
              variante="secundario"
              disabled={enviando}
              onClick={() => setPaso(1)}
            >
              Atrás
            </Button>
            <Button type="button" disabled={enviando} onClick={enviar}>
              {enviando ? "Guardando…" : "Terminar mi alta"}
            </Button>
          </div>
        </div>
      )}

      {paso === 3 && (
        <div className="flex flex-col gap-4">
          <Alert variante="exito" titulo="Tu alta ya quedó">
            Falta lo último: firmar {contratos.length === 1 ? "el contrato" : "los contratos"} de{" "}
            {definicion.etiqueta.toLowerCase()}. Puedes leerlo completo antes de firmar.
          </Alert>

          {contratos.map((contrato) => (
            <FirmarContrato
              key={contrato.id}
              contratoId={contrato.id}
              tipoNombre={contrato.tipo_nombre}
              subtitulo={contrato.perro_nombre}
              estado={firmados.has(contrato.id) ? "firmado_digital" : "pendiente_firma"}
              storagePath={null}
              onFirmado={() => setFirmados((prev) => new Set(prev).add(contrato.id))}
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
                esperando ahí. Recepción también te lo puede dar en papel cuando llegues.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
