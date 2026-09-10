"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { completarAlta, subirFotoAlta, calcularDistanciaAlta } from "../acciones";
import { perroVacio, type PerroAlta } from "../tipos";

type Catalogo = { id: string; etiqueta: string };

const PASOS = ["Tus datos", "Tus perros", "Tu cuenta"];

function Progreso({ paso }: { paso: number }) {
  return (
    <ol className="flex gap-2" aria-label="Progreso del alta">
      {PASOS.map((etiqueta, i) => (
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

function TarjetaPerro({
  perro,
  indice,
  total,
  tamanos,
  pelajes,
  foto,
  onCambio,
  onFoto,
  onQuitar,
}: {
  perro: PerroAlta;
  indice: number;
  total: number;
  tamanos: Catalogo[];
  pelajes: Catalogo[];
  foto: File | null;
  onCambio: (cambios: Partial<PerroAlta>) => void;
  onFoto: (archivo: File | null) => void;
  onQuitar: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border-[1.5px] border-n-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-n-900">
          {perro.nombre.trim() || `Perro ${indice + 1}`}
        </h3>
        {total > 1 && (
          <Button type="button" variante="secundario" onClick={onQuitar}>
            Quitar
          </Button>
        )}
      </div>

      <Field
        label="¿Cómo se llama?"
        value={perro.nombre}
        onChange={(e) => onCambio({ nombre: e.target.value })}
        required
      />
      <Field
        label="Raza (opcional)"
        value={perro.raza}
        onChange={(e) => onCambio({ raza: e.target.value })}
        placeholder="ej. Labrador, mestizo"
      />

      <div className="grid grid-cols-2 gap-3">
        <Select label="Sexo" value={perro.sexo} onChange={(e) => onCambio({ sexo: e.target.value })}>
          <option value="">Prefiero no decir</option>
          <option value="macho">Macho</option>
          <option value="hembra">Hembra</option>
        </Select>
        <Field
          label="Fecha de nacimiento"
          type="date"
          value={perro.fecha_nacimiento}
          onChange={(e) => onCambio({ fecha_nacimiento: e.target.value })}
          ayuda="Aproximada está bien."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Tamaño"
          value={perro.tamano_id}
          onChange={(e) => onCambio({ tamano_id: e.target.value })}
        >
          <option value="">No sé</option>
          {tamanos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.etiqueta}
            </option>
          ))}
        </Select>
        <Select
          label="Pelaje"
          value={perro.pelaje_id}
          onChange={(e) => onCambio({ pelaje_id: e.target.value })}
        >
          <option value="">No sé</option>
          {pelajes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.etiqueta}
            </option>
          ))}
        </Select>
      </div>

      <Textarea
        label="Alimentación"
        value={perro.alimentacion_notas}
        onChange={(e) => onCambio({ alimentacion_notas: e.target.value })}
        placeholder="Qué come, cuánto y a qué horas. Si trae su propia comida, dínoslo aquí."
        rows={3}
      />

      <fieldset className="flex flex-col gap-3 rounded-md border border-n-200 p-3">
        <legend className="px-1 text-sm font-bold text-n-700">Contacto de emergencia</legend>
        <p className="text-sm text-n-600">
          A quién le hablamos si no te localizamos a ti.
        </p>
        <Field
          label="Nombre"
          value={perro.contacto_emergencia_nombre}
          onChange={(e) => onCambio({ contacto_emergencia_nombre: e.target.value })}
        />
        <Field
          label="Teléfono"
          inputMode="tel"
          value={perro.contacto_emergencia_telefono}
          onChange={(e) => onCambio({ contacto_emergencia_telefono: e.target.value })}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-md border border-n-200 p-3">
        <legend className="px-1 text-sm font-bold text-n-700">Su veterinario</legend>
        <Field
          label="Nombre del veterinario"
          value={perro.veterinario_nombre}
          onChange={(e) => onCambio({ veterinario_nombre: e.target.value })}
        />
        <Field
          label="Clínica"
          value={perro.veterinario_clinica}
          onChange={(e) => onCambio({ veterinario_clinica: e.target.value })}
        />
        <Field
          label="Teléfono"
          inputMode="tel"
          value={perro.veterinario_telefono}
          onChange={(e) => onCambio({ veterinario_telefono: e.target.value })}
        />
      </fieldset>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-n-800">Foto (opcional)</label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => onFoto(e.target.files?.[0] ?? null)}
          className="w-full rounded-md border-[1.5px] border-n-400 bg-white p-2.5 text-sm text-n-700"
        />
        {foto && <p className="mt-1 text-sm text-verde-oscuro">Foto lista: {foto.name}</p>}
      </div>
    </div>
  );
}

export function AltaForm({
  token,
  tamanos,
  pelajes,
}: {
  token: string;
  tamanos: Catalogo[];
  pelajes: Catalogo[];
}) {
  const router = useRouter();
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
      if (telefono.replace(/\D/g, "").length !== 10) {
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
    // el `setEnviando(false)` nunca corría y la pantalla se quedaba en
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

      setAviso("Entrando a tu portal…");
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
    }

    if (!sesionAbierta) {
      setAviso(null);
      setError(
        "¡Tu alta quedó lista! Solo no pudimos abrirte la sesión automáticamente: entra con tu correo y tu contraseña."
      );
      return;
    }

    if (fallaronFotos > 0) {
      // No se le pide que repita nada: ya está adentro y recepción ve al
      // perro sin foto, que es un detalle, no un problema.
      console.warn(`${fallaronFotos} foto(s) no se pudieron subir`);
    }

    router.push("/portal");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <Progreso paso={paso} />

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
              indice={i}
              total={perros.length}
              tamanos={tamanos}
              pelajes={pelajes}
              foto={fotos[i] ?? null}
              onCambio={(cambios) => actualizarPerro(i, cambios)}
              onFoto={(archivo) => setFotos((prev) => prev.map((f, j) => (i === j ? archivo : f)))}
              onQuitar={() => quitarPerro(i)}
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
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            ayuda="Al menos 6 caracteres."
          />
          <Field
            label="Repite la contraseña"
            type="password"
            autoComplete="new-password"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
          />

          {aviso && <p className="text-sm font-semibold text-azul">{aviso}</p>}

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
              {enviando ? "Creando tu cuenta…" : "Terminar mi alta"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
