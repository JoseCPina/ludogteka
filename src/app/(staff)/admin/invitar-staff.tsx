"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type Resultado =
  | { estado: "formulario" }
  | { estado: "cargando" }
  | { estado: "exito"; email: string; rol: string; inviteLink: string }
  | { estado: "error"; mensaje: string };

function mensajeError(status: number, cuerpo: { error?: string } | null): string {
  if (status === 409) {
    return cuerpo?.error ?? "Ya existe una cuenta con ese correo.";
  }
  if (status === 400) {
    return cuerpo?.error ?? "Revisa el correo y el rol: algo no es válido.";
  }
  if (status === 403) {
    return "No tienes permiso para invitar personal.";
  }
  if (status === 401) {
    return "Tu sesión expiró. Recarga la página e inicia sesión de nuevo.";
  }
  return "No pudimos completar la invitación. Intenta de nuevo.";
}

export function InvitarStaff() {
  const router = useRouter();
  const [resultado, setResultado] = useState<Resultado>({ estado: "formulario" });
  const [copiado, setCopiado] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const rol = String(formData.get("rol") ?? "");

    setResultado({ estado: "cargando" });

    try {
      const respuesta = await fetch("/api/staff/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, rol }),
      });
      const cuerpo = await respuesta.json().catch(() => null);

      if (!respuesta.ok) {
        setResultado({ estado: "error", mensaje: mensajeError(respuesta.status, cuerpo) });
        return;
      }

      setResultado({
        estado: "exito",
        email: cuerpo.email,
        rol: cuerpo.rol,
        inviteLink: cuerpo.invite_link,
      });
      router.refresh();
    } catch {
      setResultado({ estado: "error", mensaje: "No pudimos completar la invitación. Revisa tu conexión." });
    }
  }

  async function copiarLink(link: string) {
    await navigator.clipboard.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  if (resultado.estado === "exito") {
    return (
      <div className="flex flex-col gap-4">
        <Alert variante="exito" titulo="Cuenta creada">
          Se creó la cuenta de {resultado.email} como{" "}
          {resultado.rol === "recepcion" ? "recepción" : "estética"}.
        </Alert>

        <div className="rounded-lg border-[1.5px] border-amarillo bg-amarillo-suave p-4">
          <p className="mb-2 font-bold text-amarillo-oscuro">
            Cópialo ahora — este link no se vuelve a mostrar
          </p>
          <p className="mb-3 text-sm text-n-700">
            Pásaselo a {resultado.email} para que entre y elija su contraseña. Si cierras esta
            pantalla sin copiarlo, no hay forma de recuperarlo: la única salida es invitar nuevamente
            (y esa vez el correo ya estará registrado, así que tampoco funcionará). Cópialo antes de
            seguir.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={resultado.inviteLink}
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-12 w-full flex-1 rounded-md border-[1.5px] border-n-400 bg-white px-3.5 text-sm text-n-900"
            />
            <Button
              type="button"
              variante="primario"
              className="flex-none"
              onClick={() => copiarLink(resultado.inviteLink)}
            >
              {copiado ? "Copiado" : "Copiar link"}
            </Button>
          </div>
        </div>

        <Button
          type="button"
          variante="secundario"
          className="self-start"
          onClick={() => setResultado({ estado: "formulario" })}
        >
          Invitar a alguien más
        </Button>
      </div>
    );
  }

  const cargando = resultado.estado === "cargando";

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      {resultado.estado === "error" && (
        <Alert variante="error" titulo="No se pudo invitar">
          {resultado.mensaje}
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="Correo" name="email" type="email" required disabled={cargando} />
        <Select label="Rol" name="rol" required disabled={cargando} defaultValue="">
          <option value="" disabled>
            Elige un rol
          </option>
          <option value="recepcion">Recepción</option>
          <option value="estetica">Estética</option>
        </Select>
      </div>

      <Button type="submit" disabled={cargando} className="self-start">
        {cargando ? "Invitando…" : "Invitar"}
      </Button>
    </form>
  );
}
