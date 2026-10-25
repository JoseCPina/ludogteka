"use client";

import { useRef, useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { comprimirImagen } from "@/lib/imagen";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";
import { AvisoBorrador, useAutoguardado } from "@/lib/borradores/use-autoguardado";
import {
  confirmarCheckin,
  type ConfirmacionesEntradaSalida,
  agregarPertenencia,
  prepararRutaFotoLlegada,
  obtenerUrlFotoLlegada,
} from "../../../checkin-actions";

const BUCKET = "perros-archivos";

type Pertenencia = { id: string; descripcion: string; devuelto: boolean };

export function CheckinForm({
  estanciaId,
  perroId,
  clienteId,
  pertenenciasIniciales,
  declaradas,
  conocidos = [],
}: {
  estanciaId: string;
  perroId: string;
  clienteId: string;
  pertenenciasIniciales: Pertenencia[];
  // Lo que la reserva ya traía declarado (texto libre de la estancia), si algo.
  declaradas: string | null;
  // QA S15: las personas que pueden entregarlo (dueño, contacto de emergencia); cualquier otra es «Otra persona».
  conocidos?: { etiqueta: string; nombre: string; telefono: string }[];
}) {
  const router = useRouter();
  const inputFotoRef = useRef<HTMLInputElement>(null);

  const [entregadoNombre, setEntregadoNombre] = useState("");
  const [entregadoTelefono, setEntregadoTelefono] = useState("");
  // Quién lo entrega: el índice de un conocido, «otra» (escribe el nombre) o "" (sin escoger).
  const [quien, setQuien] = useState<string>("");
  const esOtra = quien === "otra";
  const [estadoLlegada, setEstadoLlegada] = useState("");
  const [fotoPath, setFotoPath] = useState<string | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  // Una foto de celular puede tardar: tope más largo que el de un botón.
  const subiendoFoto = useEspera({ tope: 60_000 });

  const [pertenencias, setPertenencias] = useState<Pertenencia[]>(pertenenciasIniciales);
  const [nuevaPertenencia, setNuevaPertenencia] = useState("");
  const agregandoPertenencia = useEspera();

  const enviando = useEspera();
  const [error, setError] = useState<string | null>(null);
  // El campo obligatorio que falta: se marca y se enfoca.
  const [faltaEntrega, setFaltaEntrega] = useState(false);
  // Ya quedó registrado: el formulario se cierra y la pantalla lo dice (sin esperar al refresco del servidor).
  const [registrado, setRegistrado] = useState(false);
  // Autoguardado por estancia: quién entrega y cómo llegó. La foto y las pertenencias ya se guardan solas.
  const borrador = useAutoguardado({
    formulario: "checkin",
    clave: estanciaId,
    valor: { entregadoNombre, entregadoTelefono, estadoLlegada },
    esVacio: (v) => !v.entregadoNombre.trim() && !v.entregadoTelefono.trim() && !v.estadoLlegada.trim(),
    alRecuperar: (d) => {
      const i = conocidos.findIndex((c) => c.nombre === (d.entregadoNombre ?? "").trim());
      setQuien(i >= 0 ? String(i) : (d.entregadoNombre ?? "").trim() ? "otra" : "");
      setEntregadoNombre(d.entregadoNombre ?? "");
      setEntregadoTelefono(d.entregadoTelefono ?? "");
      setEstadoLlegada(d.estadoLlegada ?? "");
    },
  });

  async function subirFoto(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;

    setError(null);
    const r = await subiendoFoto.correr(async () => {
      const blob = await comprimirImagen(archivo);
      const path = await prepararRutaFotoLlegada(clienteId, perroId, estanciaId);
      const supabase = createSupabaseBrowserClient();
      const { error: subidaError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (subidaError) return { error: "No pudimos subir la foto. Intenta de nuevo.", path, url: null };
      return { error: null, path, url: await obtenerUrlFotoLlegada(path) };
    });

    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (r.valor.error) {
      setError(r.valor.error);
      return;
    }
    setFotoPath(r.valor.path);
    setFotoUrl(r.valor.url);
  }

  async function agregarItem() {
    if (!nuevaPertenencia.trim()) return;
    const res = await agregandoPertenencia.ejecutar(() => agregarPertenencia(estanciaId, nuevaPertenencia));
    if (res.error || !res.id) {
      setError(res.error);
      return;
    }
    setPertenencias((prev) => [...prev, { id: res.id!, descripcion: nuevaPertenencia.trim(), devuelto: false }]);
    setNuevaPertenencia("");
  }

  // QA S16 (N69): lo obligatorio se marca antes del clic y el botón dice qué falta.
  const motivoConfirmar = !quien ? "Falta: escoge quién entrega al perro." : !entregadoNombre.trim() ? "Falta: el nombre de quien entrega al perro." : null;

  // La casa llena al registrar la entrada (check-in tardío): el texto de la base y, ya registrado, en cuánto quedó.
  const [sobrecupo, setSobrecupo] = useState<string | null>(null);
  const [quedo, setQuedo] = useState<string | null>(null);
  // QA N125: fuera del horario del negocio (día cerrado u hora fuera de rango), la misma pregunta. Lo ya confirmado
  // se acumula: si también está llena la casa, se pregunta una cosa y luego la otra.
  const [fueraHorario, setFueraHorario] = useState<string | null>(null);
  const [quedoFueraHorario, setQuedoFueraHorario] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<ConfirmacionesEntradaSalida>({});
  const pregunta = fueraHorario ?? sobrecupo;

  async function confirmar(confirmaAhora: ConfirmacionesEntradaSalida = {}) {
    if (!quien || !entregadoNombre.trim()) {
      setFaltaEntrega(true);
      setError(esOtra ? "Escribe el nombre de la otra persona que entrega al perro." : "Escoge quién entrega al perro.");
      document.getElementById(esOtra ? "checkin-entrega-nombre" : "checkin-entrega-quien")?.focus();
      return;
    }
    setFaltaEntrega(false);
    setError(null);
    borrador.pausar();
    const confirma = { ...confirmado, ...confirmaAhora };
    setConfirmado(confirma);
    const res = await enviando.ejecutar(() => confirmarCheckin(estanciaId, {
      entregadoPorNombre: entregadoNombre,
      entregadoPorTelefono: entregadoTelefono,
      estadoLlegada,
      fotoLlegadaPath: fotoPath,
    }, confirma));
    if (res.fueraHorario) {
      setSobrecupo(null);
      setFueraHorario(res.fueraHorario);
      return;
    }
    if (res.sobrecupo) {
      setFueraHorario(null);
      setSobrecupo(res.sobrecupo);
      return;
    }
    if (res.error) {
      setError(res.error);
      return;
    }
    setSobrecupo(null);
    setFueraHorario(null);
    setQuedo(res.quedo ?? null);
    setQuedoFueraHorario(res.quedoFueraHorario ?? null);
    borrador.descartar();
    setRegistrado(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {registrado && (
        <Alert variante="exito" titulo="Check-in registrado">
          La estancia ya está en curso. Cuando el perro salga, haz el check-out desde su estancia.
          {quedo && (
            <span className="mt-2 block" data-checkin-sobrecupo>
              Entró con la casa llena: quedó en {quedo}. Quedó anotado en la bitácora.
            </span>
          )}
          {quedoFueraHorario && (
            <span className="mt-2 block" data-checkin-fuera-horario>
              Entró fuera del horario ({quedoFueraHorario}). Quedó anotado en la bitácora.
            </span>
          )}
          <span className="mt-2 block font-semibold" data-pertenencias-recibidas>
            Pertenencias recibidas:{" "}
            {pertenencias.length > 0 || declaradas ? [...(declaradas ? [declaradas] : []), ...pertenencias.map((p) => p.descripcion)].join(", ") : "ninguna"}.
          </span>
        </Alert>
      )}
      <AvisoBorrador estado={borrador} />
      <fieldset disabled={registrado} className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          id="checkin-entrega-quien"
          label="Quién entrega al perro * (obligatorio)"
          required
          error={faltaEntrega && !quien ? "Escoge quién entrega al perro." : undefined}
          value={quien}
          onChange={(e) => {
            const v = e.target.value;
            setQuien(v);
            setFaltaEntrega(false);
            const c = conocidos[Number(v)];
            if (v !== "otra" && v !== "" && c) {
              setEntregadoNombre(c.nombre);
              setEntregadoTelefono(c.telefono);
            } else {
              setEntregadoNombre("");
              setEntregadoTelefono("");
            }
          }}
          autoFocus
        >
          <option value="">— Escoge —</option>
          {conocidos.map((c, i) => (
            <option key={i} value={String(i)}>
              {c.etiqueta}: {c.nombre}
            </option>
          ))}
          <option value="otra">Otra persona (escribo su nombre)</option>
        </Select>
        {esOtra ? (
          <>
            <Field
              id="checkin-entrega-nombre"
              label="Nombre de la otra persona * (obligatorio)"
              required
              error={faltaEntrega && !entregadoNombre.trim() ? "Escribe el nombre de quien lo entrega." : undefined}
              value={entregadoNombre}
              onChange={(e) => {
                setEntregadoNombre(e.target.value);
                setFaltaEntrega(false);
              }}
              placeholder="Nombre y apellido"
              ayuda="No es el dueño ni su contacto de emergencia: queda registrado quién lo dejó."
            />
            <Field
              label="Teléfono de esa persona (recomendado)"
              value={entregadoTelefono}
              onChange={(e) => setEntregadoTelefono(e.target.value)}
              placeholder="10 dígitos"
            />
          </>
        ) : null}
      </div>

      <Textarea
        label="Estado del perro a la llegada (opcional)"
        value={estadoLlegada}
        onChange={(e) => setEstadoLlegada(e.target.value)}
        placeholder="ej. Tranquilo, cojea un poco de la pata izquierda"
      />

      <div>
        <p className="mb-1.5 block text-sm font-semibold text-n-800">Foto de llegada (opcional)</p>
        <div className="flex items-center gap-3">
          {fotoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fotoUrl} alt="" className="h-20 w-20 rounded-md border border-n-200 object-cover" />
          )}
          <input
            ref={inputFotoRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={subirFoto}
          />
          <Button
            type="button"
            variante="secundario"
            cargando={subiendoFoto.cargando}
            onClick={() => inputFotoRef.current?.click()}
          >
            {subiendoFoto.cargando ? "Subiendo…" : fotoUrl ? "Reemplazar foto" : "Tomar/subir foto"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-n-800">
          Pertenencias que llegan con el perro
        </p>
        {declaradas && (
          <p className="text-sm text-n-700">
            Ya declaradas en la reserva: <strong>{declaradas}</strong>. Agrega aquí lo que lleguen de más.
          </p>
        )}
        {pertenencias.length === 0 ? (
          <p className="text-sm text-n-500">{declaradas ? "Nada más capturado todavía." : "Nada capturado todavía."}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {pertenencias.map((p) => (
              <li
                key={p.id}
                className="rounded-full bg-n-100 px-3 py-1 text-sm font-semibold text-n-700"
              >
                {p.descripcion}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div className="max-w-xs flex-1">
            <Field
              label="Agregar pertenencia"
              value={nuevaPertenencia}
              onChange={(e) => setNuevaPertenencia(e.target.value)}
              placeholder="ej. Correa roja"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  agregarItem();
                }
              }}
            />
          </div>
          <Button type="button" variante="secundario" cargando={agregandoPertenencia.cargando} onClick={agregarItem}>
            {agregandoPertenencia.cargando ? "Agregando…" : "Agregar"}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variante="error" titulo="No se pudo completar el check-in">
          {error}
        </Alert>
      )}

      {!registrado && pregunta && (
        <Alert variante="advertencia" titulo="Confirma la entrada">
          {fueraHorario ? <span data-aviso-fuera-horario>{fueraHorario}</span> : <span data-aviso-sobrecupo>{sobrecupo}</span>} Si de todos modos registras la entrada, queda anotado en la bitácora.
        </Alert>
      )}

      {!registrado && (
        <AccionesFormulario error={error}>
          {pregunta ? (
            <>
              <Button
                type="button"
                cargando={enviando.cargando}
                onClick={() => confirmar(fueraHorario ? { fueraHorario: true } : { sobrecupo: true })}
                {...(fueraHorario ? { "data-confirmar-fuera-horario": true } : { "data-confirmar-sobrecupo": true })}
              >
                {enviando.cargando ? "Guardando…" : "Registrar la entrada de todos modos"}
              </Button>
              <Button type="button" variante="secundario" disabled={enviando.cargando} onClick={() => { setSobrecupo(null); setFueraHorario(null); setConfirmado({}); }}>
                Todavía no
              </Button>
            </>
          ) : (
          <Button type="button" cargando={enviando.cargando} disabled={Boolean(motivoConfirmar)} onClick={() => confirmar()} data-confirmar-checkin>
            {enviando.cargando ? "Guardando…" : "Confirmar check-in"}
          </Button>
          )}
          {motivoConfirmar && <span className="text-sm text-n-600" data-motivo-confirmar>{motivoConfirmar}</span>}
        </AccionesFormulario>
      )}
      </fieldset>
    </div>
  );
}
