"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { comprimirImagen } from "@/lib/imagen";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  confirmarCheckin,
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
}: {
  estanciaId: string;
  perroId: string;
  clienteId: string;
  pertenenciasIniciales: Pertenencia[];
}) {
  const router = useRouter();
  const inputFotoRef = useRef<HTMLInputElement>(null);

  const [entregadoNombre, setEntregadoNombre] = useState("");
  const [entregadoTelefono, setEntregadoTelefono] = useState("");
  const [estadoLlegada, setEstadoLlegada] = useState("");
  const [fotoPath, setFotoPath] = useState<string | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const [pertenencias, setPertenencias] = useState<Pertenencia[]>(pertenenciasIniciales);
  const [nuevaPertenencia, setNuevaPertenencia] = useState("");
  const [agregandoPertenencia, setAgregandoPertenencia] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subirFoto(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;

    setSubiendoFoto(true);
    setError(null);
    try {
      const blob = await comprimirImagen(archivo);
      const path = await prepararRutaFotoLlegada(clienteId, perroId, estanciaId);
      const supabase = createSupabaseBrowserClient();
      const { error: subidaError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });

      if (subidaError) {
        setError("No pudimos subir la foto. Intenta de nuevo.");
        return;
      }

      const url = await obtenerUrlFotoLlegada(path);
      setFotoPath(path);
      setFotoUrl(url);
    } catch {
      setError("No pudimos procesar esa foto. Intenta con otra.");
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function agregarItem() {
    if (!nuevaPertenencia.trim()) return;
    setAgregandoPertenencia(true);
    const res = await agregarPertenencia(estanciaId, nuevaPertenencia);
    setAgregandoPertenencia(false);
    if (res.error || !res.id) {
      setError(res.error);
      return;
    }
    setPertenencias((prev) => [...prev, { id: res.id!, descripcion: nuevaPertenencia.trim(), devuelto: false }]);
    setNuevaPertenencia("");
  }

  async function confirmar() {
    if (!entregadoNombre.trim()) {
      setError("Registra quién entrega al perro.");
      return;
    }
    setEnviando(true);
    setError(null);
    const res = await confirmarCheckin(estanciaId, {
      entregadoPorNombre: entregadoNombre,
      entregadoPorTelefono: entregadoTelefono,
      estadoLlegada,
      fotoLlegadaPath: fotoPath,
    });
    setEnviando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Quién entrega al perro"
          value={entregadoNombre}
          onChange={(e) => setEntregadoNombre(e.target.value)}
          placeholder="Nombre de quien lo deja"
          autoFocus
        />
        <Field
          label="Teléfono (opcional)"
          value={entregadoTelefono}
          onChange={(e) => setEntregadoTelefono(e.target.value)}
          placeholder="10 dígitos"
        />
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
            disabled={subiendoFoto}
            onClick={() => inputFotoRef.current?.click()}
          >
            {subiendoFoto ? "Subiendo…" : fotoUrl ? "Reemplazar foto" : "Tomar/subir foto"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-n-800">
          Pertenencias que llegan con el perro
        </p>
        {pertenencias.length === 0 ? (
          <p className="text-sm text-n-500">Nada capturado todavía.</p>
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
          <Button type="button" variante="secundario" disabled={agregandoPertenencia} onClick={agregarItem}>
            {agregandoPertenencia ? "Agregando…" : "Agregar"}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variante="error" titulo="No se pudo completar el check-in">
          {error}
        </Alert>
      )}

      <Button type="button" disabled={enviando} onClick={confirmar} className="self-start">
        {enviando ? "Guardando…" : "Confirmar check-in"}
      </Button>
    </div>
  );
}
