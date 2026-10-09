"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { comprimirImagen } from "@/lib/imagen";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { SubirLogo } from "./subir-logo";
import { guardarPerfil, quitarFoto, subirFoto, type ResultadoPerfil } from "./actions";

export type FotoPerfil = { id: string; url: string };

// Una foto de celular pesa 5–10 MB: se comprime aquí (1600 px de lado mayor)
// antes de mandarla. Un logo PNG chico se manda tal cual, para no perder la
// transparencia.
async function prepararArchivo(archivo: File, esLogo: boolean): Promise<File> {
  if (esLogo && archivo.type === "image/png" && archivo.size < 800_000) return archivo;
  const blob = await comprimirImagen(archivo, esLogo ? 600 : 1600);
  return new File([blob], esLogo ? "logo.jpg" : "foto.jpg", { type: "image/jpeg" });
}

function Subir({ etiqueta, esLogo, accion }: { etiqueta: string; esLogo: boolean; accion: (fd: FormData) => Promise<ResultadoPerfil> }) {
  const router = useRouter();
  const envio = useEspera();
  const campo = useRef<HTMLInputElement>(null);
  const [res, setRes] = useState<ResultadoPerfil | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <input
        ref={campo}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={`Foto para: ${etiqueta.toLowerCase()}`}
        className="text-sm text-n-700 file:mr-3 file:min-h-10 file:rounded-md file:border file:border-n-400 file:bg-white file:px-4 file:font-semibold file:text-n-900"
      />
      <AccionesFormulario error={res?.error} exito={res && !res.error ? res.exito ?? true : null}>
        <Button
          type="button"
          variante="secundario"
          cargando={envio.cargando}
          onClick={async () => {
            const archivo = campo.current?.files?.[0];
            if (!archivo) return setRes({ error: "Escoge una foto." });
            const intento = await envio.correr(async () => {
              const fd = new FormData();
              fd.set("foto", await prepararArchivo(archivo, esLogo));
              return accion(fd);
            });
            const r: ResultadoPerfil = intento.ok ? intento.valor : { error: intento.error };
            setRes(r);
            if (!r.error) {
              if (campo.current) campo.current.value = "";
              router.refresh();
            }
          }}
        >
          {etiqueta}
        </Button>
      </AccionesFormulario>
    </div>
  );
}

export function PerfilForm({
  descripcion,
  direccion,
  logoUrl,
  logoAncho,
  logoAlto,
  nombreNegocio,
  colorNegocio,
  fotos,
}: {
  descripcion: string;
  direccion: string;
  logoUrl: string | null;
  logoAncho: number | null;
  logoAlto: number | null;
  nombreNegocio: string;
  colorNegocio: string | null;
  fotos: FotoPerfil[];
}) {
  const router = useRouter();
  const envio = useEspera();
  const quitando = useEspera();
  const [res, setRes] = useState<ResultadoPerfil | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Datos</h2>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await envio.ejecutar(() => guardarPerfil(new FormData(e.currentTarget)));
            setRes(r);
            if (!r.error) router.refresh();
          }}
        >
          <Textarea
            label="Descripción (opcional)"
            name="descripcion"
            defaultValue={descripcion}
            rows={3}
            maxLength={600}
            ayuda="Dos o tres líneas: qué ofreces y qué te hace distinto. Sale arriba en tu página."
          />
          <Field label="Dirección" name="direccion" defaultValue={direccion} maxLength={200} ayuda="Calle, número y colonia. Sale en tu página con un link al mapa." />
          <AccionesFormulario error={res?.error} exito={res && !res.error ? res.exito ?? true : null}>
            <Button type="submit" cargando={envio.cargando}>
              Guardar datos
            </Button>
          </AccionesFormulario>
        </form>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Logo</h2>
        <SubirLogo nombre={nombreNegocio} color={colorNegocio} logoUrl={logoUrl} ancho={logoAncho} alto={logoAlto} />
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
        <div>
          <h2 className="text-lg font-bold text-n-900">Fotos del negocio</h2>
          <p className="text-sm text-n-600">Tu local, tu equipo trabajando, perros felices. Al menos 3 para tu página web.</p>
        </div>
        {fotos.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {fotos.map((f) => (
              <li key={f.id} className="flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt="" className="aspect-[4/3] w-full rounded-md border border-n-200 object-cover" />
                <button
                  type="button"
                  disabled={quitando.cargando}
                  onClick={async () => {
                    const r = await quitando.ejecutar(() => quitarFoto(f.id));
                    if (r.error) setRes(r);
                    else router.refresh();
                  }}
                  className="self-start text-sm font-semibold text-coral-oscuro hover:underline disabled:opacity-50"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
        <Subir etiqueta="Agregar foto" esLogo={false} accion={subirFoto} />
      </section>
    </div>
  );
}
