"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Undo2 } from "lucide-react";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { esEnterParaConfirmar, valorDelCampo } from "@/lib/ui/campo-vivo";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/shadcn/dropdown-menu";
import { esReciente, TEXTOS_REVERSION, type OperacionReversible } from "@/lib/operaciones/reversion";

const botonDe = (op: OperacionReversible) => (op.tipo === "checkin_estancia" && op.destino === "cancelada" ? "Deshacer el check-in y cancelar (walk-in por error)" : TEXTOS_REVERSION[op.tipo].boton);
import { revertirOperacion, type ResultadoReversion } from "@/app/(staff)/operaciones/revertir-actions";

/**
 * «Deshacer» / «Corregir» (docs/revertir-operaciones.md). Lo hecho hace menos de 24 horas sale como botón «Deshacer …»
 * a la vista; lo demás, en el menú «Corregir», que abre la operación inversa. Las dos piden motivo y confirman antes;
 * la base revisa el permiso «Deshacer operaciones», hace los efectos encadenados y deja la bitácora. Quien no tiene el
 * permiso no ve nada (`puede`): la base de todos modos rechazaría.
 */
export function Deshacer({
  operaciones,
  puede = true,
  onHecho,
  className = "",
}: {
  operaciones: OperacionReversible[];
  puede?: boolean;
  /** Para que la pantalla pinte el estado nuevo sin esperar al refresco. */
  onHecho?: (op: OperacionReversible, resultado: ResultadoReversion) => void;
  className?: string;
}) {
  const router = useRouter();
  const envio = useEspera();
  const [abierta, setAbierta] = useState<OperacionReversible | null>(null);
  const [motivo, setMotivo] = useState("");
  const campo = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);
  if (!puede || operaciones.length === 0) return null;

  const recientes = operaciones.filter((o) => esReciente(o.hechoEn));
  const enMenu = operaciones.filter((o) => !esReciente(o.hechoEn));

  function abrir(op: OperacionReversible) {
    setAbierta(op);
    setMotivo("");
    setError(null);
  }

  async function confirmar() {
    if (!abierta) return;
    const texto = valorDelCampo(campo, motivo).trim();
    if (texto.length < 5) {
      setError("Escribe el motivo (qué pasó), al menos 5 letras.");
      campo.current?.focus();
      return;
    }
    setError(null);
    const op = abierta;
    const res = await envio.ejecutar(() => revertirOperacion(op, texto));
    if (res.error) {
      setError(res.error);
      return;
    }
    setAbierta(null);
    onHecho?.(op, res);
    router.refresh();
  }

  if (abierta) {
    const t = TEXTOS_REVERSION[abierta.tipo];
    return (
      <div className={`flex flex-col gap-3 rounded-md border-[1.5px] border-ambar bg-ambar-suave p-3 ${className}`} data-deshacer-abierto={abierta.tipo}>
        <p className="text-sm font-semibold text-ambar-oscuro">{botonDe(abierta)}</p>
        <p className="text-sm text-n-700">{t.explica} Queda en la bitácora con tu nombre, la hora y el motivo.</p>
        <Textarea
          ref={campo}
          label="Motivo (obligatorio)"
          rows={2}
          maxLength={500}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          onKeyDown={(e) => {
            if (esEnterParaConfirmar(e)) {
              e.preventDefault();
              void confirmar();
            }
          }}
          placeholder="ej. Se marcó por error; el perro sí vino"
        />
        <AccionesFormulario error={error}>
          <Button type="button" variante="peligro" cargando={envio.cargando} onClick={confirmar} data-confirmar-deshacer>
            {envio.cargando ? "Deshaciendo…" : `Sí, ${botonDe(abierta).charAt(0).toLowerCase()}${botonDe(abierta).slice(1)}`}
          </Button>
          <Button type="button" variante="secundario" onClick={() => setAbierta(null)}>
            Dejarlo como está
          </Button>
        </AccionesFormulario>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} data-deshacer>
      {recientes.map((op) => (
        <Button key={`${op.tipo}-${op.id}-${op.destino ?? ""}`} type="button" variante="secundario" tamano="compacto" onClick={() => abrir(op)} data-deshacer-reciente={op.tipo}>
          <Undo2 aria-hidden className="size-4" /> {botonDe(op)}
        </Button>
      ))}
      {enMenu.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variante="secundario" tamano="compacto" data-corregir>
              Corregir <ChevronDown aria-hidden className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {enMenu.map((op) => (
              <DropdownMenuItem key={`${op.tipo}-${op.id}-${op.destino ?? ""}`} onSelect={() => abrir(op)} data-corregir-opcion={op.tipo}>
                {botonDe(op)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
