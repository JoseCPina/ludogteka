"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { iniciarSesionPorTelefono } from "../acciones";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { FirmarContrato } from "@/components/firmar-contrato";
import type { RazaOpcion } from "@/components/selector-raza";
import type { CotizacionEstetica } from "@/lib/estetica/cotizacion";
import { TIPOS_LINK_ALTA, type TipoLinkAlta } from "@/lib/alta/tipos-link";
import { completarExpediente, subirFotoAlta, calcularDistanciaAlta } from "../acciones";
import {
  perroVacio,
  type ContratoPendiente,
  type PerroAlta,
  type PerroComplemento,
} from "../tipos";
import { camposDeTipo, type CampoPerro } from "@/lib/alta/campos-perro";
import { TarjetaPerro, type Catalogo } from "./tarjeta-perro";

export type PerroExistente = {
  id: string;
  nombre: string;
  raza: string;
  raza_id: string | null;
  // Solo lo que trae vacío. Un perro con el expediente completo llega con
  // la lista vacía y no se pinta: al dueño no se le enseña una tarjeta
  // llena de campos ya contestados para que la revise.
  campos: CampoPerro[];
};

type Fase = "cuenta" | "datos" | "contrato";

// Un perro existente se edita con la misma forma que uno nuevo, así que
// se envuelve en un PerroAlta con todo vacío: lo único que se va a mandar
// son los campos que la tarjeta pinte, y la función de la base solo
// rellena huecos, nunca sobreescribe.
function comoFormulario(perro: PerroExistente): PerroAlta {
  return { ...perroVacio(), nombre: perro.nombre, raza: perro.raza, raza_id: perro.raza_id };
}

export function CompletarForm({
  token,
  tipo,
  clienteNombre,
  clienteTelefono,
  faltaDireccion,
  tieneCuenta,
  perros,
  razas,
  tamanos,
  pelajes,
  cotizacion,
}: {
  token: string;
  tipo: TipoLinkAlta;
  clienteNombre: string;
  clienteTelefono: string;
  faltaDireccion: boolean;
  tieneCuenta: boolean;
  perros: PerroExistente[];
  razas: RazaOpcion[];
  tamanos: Catalogo[];
  pelajes: Catalogo[];
  cotizacion: CotizacionEstetica | null;
}) {
  const router = useRouter();
  const definicion = TIPOS_LINK_ALTA[tipo];
  const camposNuevo = camposDeTipo(definicion.expedienteCompleto);

  const conHuecos = perros.filter((p) => p.campos.length > 0);
  const hayAlgoQuePedir = faltaDireccion || conHuecos.length > 0;

  const [fase, setFase] = useState<Fase>("cuenta");
  // No se edita: el expediente ya lo trae, y dejar que se cambie desde un
  // formulario público sería dejar que alguien se mueva de identidad.
  const telefono = clienteTelefono;
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [direccion, setDireccion] = useState("");
  const [existentes, setExistentes] = useState<Record<string, PerroAlta>>(() =>
    Object.fromEntries(perros.map((p) => [p.id, comoFormulario(p)]))
  );
  const [nuevos, setNuevos] = useState<PerroAlta[]>([]);
  const [fotosNuevos, setFotosNuevos] = useState<(File | null)[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [contratos, setContratos] = useState<ContratoPendiente[]>([]);
  const [firmados, setFirmados] = useState<Set<string>>(new Set());

  function actualizarExistente(id: string, cambios: Partial<PerroAlta>) {
    setExistentes((prev) => ({ ...prev, [id]: { ...prev[id], ...cambios } }));
  }

  async function entrar() {
    setError(null);
    if (password.length < 6) return setError("La contraseña debe tener al menos 6 caracteres.");

    if (tieneCuenta) {
      setEnviando(true);
      // El teléfono ya lo sabemos: es el del expediente que abrió este
      // link. Solo falta que demuestre que la cuenta es suya.
      const res = await iniciarSesionPorTelefono(telefono, password);
      setEnviando(false);
      if (res.error) return setError(res.error);
    } else {
      if (password !== confirmacion) return setError("Las dos contraseñas no coinciden.");
    }

    if (hayAlgoQuePedir) setFase("datos");
    else await guardar();
  }

  async function guardar() {
    setError(null);
    setEnviando(true);

    // Solo viajan los campos que se pintaron. Mandar el objeto completo
    // haría que un campo vacío en pantalla pareciera una respuesta, y del
    // otro lado no hay forma de distinguir "no contestó" de "contestó
    // vacío".
    const perrosAMandar: PerroComplemento[] = conHuecos.map((p) => {
      const valores = existentes[p.id];
      const parcial: PerroComplemento = { id: p.id };
      for (const campo of p.campos) {
        (parcial as Record<string, unknown>)[campo] = valores[campo as keyof PerroAlta];
        if (campo === "raza") parcial.raza_id = valores.raza_id;
      }
      return parcial;
    });

    const res = await completarExpediente(token, {
      direccion: faltaDireccion ? direccion : "",
      password,
      perros: perrosAMandar,
      perrosNuevos: nuevos,
    });

    if (res.error) {
      setEnviando(false);
      setError(res.error);
      return;
    }

    let sesionAbierta = tieneCuenta;
    try {
      if (faltaDireccion && direccion.trim()) {
        setAviso("Calculando la distancia a tu domicilio…");
        await calcularDistanciaAlta(token);
      }

      // Las fotos son solo de los perros nuevos: a los que ya existen no
      // se les toca la que tengan.
      const creados = (res.perros ?? []).filter(
        (p) => !perros.some((existente) => existente.id === p.id)
      );
      for (let i = 0; i < creados.length; i += 1) {
        const archivo = fotosNuevos[i];
        if (!archivo) continue;
        setAviso(`Guardando la foto de ${creados[i].nombre}…`);
        const datosFoto = new FormData();
        datosFoto.append("foto", archivo);
        await subirFotoAlta(token, creados[i].id, datosFoto);
      }

      if (!tieneCuenta) {
        setAviso("Abriendo tu sesión…");
        const res = await iniciarSesionPorTelefono(telefono, password);
        sesionAbierta = !res.error;
      }
    } catch {
      sesionAbierta = tieneCuenta;
    } finally {
      setEnviando(false);
      setAviso(null);
    }

    if (!sesionAbierta) {
      setError(
        "¡Listo! Solo no pudimos abrirte la sesión automáticamente: entra con tu correo y tu contraseña."
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
    setFase("contrato");
  }

  if (fase === "contrato") {
    const faltan = contratos.filter((c) => !firmados.has(c.id));
    return (
      <div className="flex flex-col gap-4">
        <Alert variante="exito" titulo="Ya quedó lo que faltaba">
          Solo resta firmar {contratos.length === 1 ? "el contrato" : "los contratos"} de{" "}
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

        <Button
          type="button"
          onClick={() => {
            router.push("/portal");
            router.refresh();
          }}
        >
          {faltan.length === 0 ? "Entrar a mi portal" : "Entrar y firmar después"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <Alert variante="error" titulo="Revisa esto">
          {error}
        </Alert>
      )}
      {aviso && <Alert variante="advertencia" titulo={aviso} />}

      {fase === "cuenta" && (
        <div className="flex flex-col gap-4">
          {tieneCuenta ? (
            <>
              <p className="text-n-600">
                Entra con tu cuenta para continuar. Es la misma con la que ves a tus perros en el
                portal.
              </p>
              <p className="text-sm text-n-600">
                Entras con tu teléfono <strong>{telefono}</strong>.
              </p>
              <Field
                label="Tu contraseña"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </>
          ) : (
            <>
              <p className="text-n-600">
                {clienteNombre}, todavía no tienes cuenta para entrar al portal. Créala aquí y con
                ella vas a poder ver a tus perros desde tu celular.
              </p>
              <p className="text-sm text-n-600">
                Vas a entrar con tu teléfono <strong>{telefono}</strong> y la contraseña que
                escojas aquí.
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

          <div className="flex justify-end">
            <Button type="button" disabled={enviando} onClick={entrar}>
              {enviando ? "Un momento…" : hayAlgoQuePedir ? "Continuar" : "Continuar al contrato"}
            </Button>
          </div>
        </div>
      )}

      {fase === "datos" && (
        <div className="flex flex-col gap-4">
          <Alert variante="advertencia" titulo="Solo esto nos falta">
            Lo que ya nos habías dicho no aparece aquí: no hace falta que lo escribas otra vez.
          </Alert>

          {faltaDireccion && (
            <Field
              label="Tu dirección"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder="Calle, número, colonia y ciudad"
              ayuda="Con ella podemos cotizarte la recolección a domicilio. Es opcional."
            />
          )}

          {conHuecos.map((perro) => (
            <TarjetaPerro
              key={perro.id}
              perro={existentes[perro.id]}
              titulo={perro.nombre}
              pedirNombre={false}
              campos={perro.campos}
              razas={razas}
              tamanos={tamanos}
              pelajes={pelajes}
              cotizacion={cotizacion}
              foto={null}
              onCambio={(cambios) => actualizarExistente(perro.id, cambios)}
              onFoto={null}
              onQuitar={null}
            />
          ))}

          {nuevos.map((perro, i) => (
            <TarjetaPerro
              key={`nuevo-${i}`}
              perro={perro}
              titulo={perro.nombre.trim() || "Perro nuevo"}
              campos={camposNuevo}
              razas={razas}
              tamanos={tamanos}
              pelajes={pelajes}
              cotizacion={cotizacion}
              foto={fotosNuevos[i] ?? null}
              onCambio={(cambios) =>
                setNuevos((prev) => prev.map((p, j) => (i === j ? { ...p, ...cambios } : p)))
              }
              onFoto={(archivo) =>
                setFotosNuevos((prev) => prev.map((f, j) => (i === j ? archivo : f)))
              }
              onQuitar={() => {
                setNuevos((prev) => prev.filter((_, j) => j !== i));
                setFotosNuevos((prev) => prev.filter((_, j) => j !== i));
              }}
            />
          ))}

          <Button
            type="button"
            variante="secundario"
            className="self-start"
            onClick={() => {
              setNuevos((prev) => [...prev, perroVacio()]);
              setFotosNuevos((prev) => [...prev, null]);
            }}
          >
            Tengo otro perro que no está aquí
          </Button>

          <div className="flex justify-end">
            <Button
              type="button"
              disabled={enviando}
              onClick={() => {
                if (nuevos.some((p) => !p.nombre.trim())) {
                  setError("El perro que agregaste necesita un nombre.");
                  return;
                }
                guardar();
              }}
            >
              {enviando ? "Guardando…" : "Guardar y continuar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
