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

  const [paso, setPaso] = useState(0);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [perros, setPerros] = useState<PerroAlta[]>([perroVacio()]);
  const [fotos, setFotos] = useState<(File | null)[]>([null]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Los contratos llegan del alta ya generados, y el paso de firma solo
  // existe si hay alguno: si el negocio todavía no publica el contrato de
  // este flujo, la barra de progreso enseña tres pasos y no cuatro, en vez
  // de prometer una pantalla que no va a aparecer.
  const [contratos, setContratos] = useState<ContratoPendiente[]>([]);
  const [firmados, setFirmados] = useState<Set<string>>(new Set());

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
    if (!email.trim().includes("@")) return setError("Escribe un correo válido.");
    if (password.length < 6) return setError("La contraseña debe tener al menos 6 caracteres.");
    if (password !== confirmacion) return setError("Las dos contraseñas no coinciden.");

    setEnviando(true);
    const res = await completarAlta(token, {
      nombre,
      telefono,
      direccion,
      email,
      password,
      perros,
    });

    if (res.error) {
      setEnviando(false);
      setError(res.error);
      return;
    }

    // A partir de aquí el alta YA ESTÁ HECHA: el expediente existe, los
    // perros existen y la cuenta existe. Nada de lo que sigue puede dejar
    // al dueño mirando un botón que no avanza — que es justo lo que
    // pasaba: si cualquiera de estos pasos lanzaba, no había try/catch,
    // el setEnviando(false) nunca corría y la pantalla se quedaba en
    // "Guardando tus fotos…" sin decir nada, con el alta ya completada
    // del otro lado.
    let fallaronFotos = 0;
    let sesionAbierta = false;

    try {
      if (direccion.trim()) {
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

      setAviso("Abriendo tu sesión…");
      const supabase = createSupabaseBrowserClient();
      const { error: errorSesion } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      sesionAbierta = !errorSesion;
    } catch {
      // Se traga el error a propósito: el alta ya quedó y no hay nada que
      // el dueño pueda hacer con un mensaje técnico. Abajo se le manda a
      // iniciar sesión, que es la salida buena.
      sesionAbierta = false;
    } finally {
      setEnviando(false);
      setAviso(null);
    }

    if (fallaronFotos > 0) {
      // No se le pide que repita nada: ya está adentro y recepción ve al
      // perro sin foto, que es un detalle, no un problema.
      console.warn(`${fallaronFotos} foto(s) no se pudieron subir`);
    }

    if (!sesionAbierta) {
      setError(
        "¡Tu alta quedó lista! Solo no pudimos abrirte la sesión automáticamente: entra con tu correo y tu contraseña."
      );
      return;
    }

    // La firma necesita la sesión abierta: el PDF lleva quién firmó,
    // cuándo y desde qué IP, y eso lo sella el servidor con la sesión
    // real, no con lo que la pantalla diga de sí misma.
    const pendientes = res.contratos ?? [];
    if (pendientes.length === 0) {
      router.push("/portal");
      router.refresh();
      return;
    }
    setContratos(pendientes);
    setPaso(3);
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
          />
          <Field
            label="Tu dirección (opcional)"
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            placeholder="Calle, número, colonia y ciudad"
            ayuda="Solo si te interesa que pasemos por tu perro a domicilio: con ella calculamos la distancia para cotizarlo. La puedes dar después."
          />
          <div className="flex justify-end">
            <Button type="button" onClick={siguiente}>
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {paso === 1 && (
        <div className="flex flex-col gap-4">
          <Alert variante="advertencia" titulo="Las vacunas no se capturan aquí">
            Recepción las revisa con tu carnet físico cuando lleguen. No te preocupes por eso ahora.
          </Alert>

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
          <p className="text-n-600">
            Con esta cuenta vas a poder ver a{" "}
            {perros.map((p) => p.nombre.trim()).filter(Boolean).join(", ") || "tu perro"} desde tu
            celular: sus fotos del día, sus reservas y sus contratos.
          </p>

          <Field
            label="Tu correo"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Tu contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            ayuda="Al menos 6 caracteres."
          />
          <Field
            label="Repite tu contraseña"
            type="password"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
          />

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
