import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { Alert } from "@/components/ui/alert";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { configWhatsApp, TelegramHttp } from "@/lib/whatsapp/infra";
import { NOMBRE_TIPO, type TipoInterlocutor } from "@/lib/whatsapp/agente";
import { conectarWebhookTelegram, linkVincularTelegram, ponerFotoBotTelegram } from "./acciones";

type Hilo = { telefono: string; tipo: TipoInterlocutor; negocio_nombre: string | null; resumen: string | null; estado: string; urgencia: string; updated_at: string };

// El bot de WhatsApp de PeluDesk (ventas y soporte): si está configurado,
// la bandeja de Telegram, lo que gastó la IA este mes y las conversaciones.
// Nunca muestra el valor de una variable: solo si está puesta.
export default async function WhatsAppPlataforma() {
  const { supabase } = await exigirPlataforma();
  const cfg = configWhatsApp();
  const inicioMes = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [{ data: hilos }, { data: uso }, { data: chat }, { data: contesta }, webhook, { data: entregasCrudo }] = await Promise.all([
    supabase.from("wa_hilos").select("telefono, tipo, negocio_nombre, resumen, estado, urgencia, updated_at").is("deleted_at", null).order("updated_at", { ascending: false }).limit(40),
    supabase.rpc("wa_uso_ia_resumen", { p_desde: inicioMes }),
    supabase.from("wa_config").select("id").eq("clave", "telegram_chat_operador").is("deleted_at", null).maybeSingle(),
    supabase.from("wa_config").select("valor").eq("clave", "whatsapp_contesta_desde").is("deleted_at", null).maybeSingle(),
    cfg.telegramToken ? new TelegramHttp(cfg.telegramToken).llamar("getWebhookInfo") : Promise.resolve(null),
    supabase.rpc("plataforma_wa_entregas", { p_dias: 7 }),
  ]);
  const entregas = (entregasCrudo ?? { por_estado: {}, fallos: [] }) as {
    por_estado: Record<string, number>;
    fallos: { origen: string; tipo: string; etiqueta: string | null; error_codigo: number | null; motivo: string | null; fallido_at: string; telefono_ult4: string | null; negocio: string | null }[];
  };
  const NOMBRE_ESTADO: [string, string][] = [["aceptado", "Aceptados (sin aviso aún)"], ["enviado", "Enviados"], ["entregado", "Entregados"], ["leido", "Leídos"], ["fallido", "Fallidos"]];
  const resumenUso = (uso ?? {}) as { gasto_mxn?: number; respuestas?: number; escalados?: number };
  const gasto = Number(resumenUso.gasto_mxn ?? 0);
  const escalados = Number(resumenUso.escalados ?? 0);
  const urlWebhook = (webhook?.resultado as { url?: string } | null)?.url ?? "";
  const variables: [string, boolean][] = [
    ["WHATSAPP_TOKEN", Boolean(cfg.token)],
    ["WHATSAPP_PHONE_NUMBER_ID", Boolean(cfg.phoneNumberId)],
    ["WHATSAPP_APP_SECRET", Boolean(cfg.appSecret)],
    ["TELEGRAM_BOT_TOKEN", Boolean(cfg.telegramToken)],
    ["ANTHROPIC_API_KEY", Boolean(cfg.anthropic)],
    ["PELUDESK_WHATSAPP", Boolean(process.env.PELUDESK_WHATSAPP)],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">WhatsApp de PeluDesk</h1>
        <p className="mt-1 text-n-600">
          Ventas y soporte en el mismo número. El bot contesta lo que sabe con certeza; lo demás llega a Telegram y se contesta
          respondiendo al mensaje.
        </p>
      </div>

      <Alert variante={contesta ? "exito" : "info"} titulo={contesta ? "El número ya contesta" : "El número todavía no contesta"}>
        {contesta
          ? `Desde el ${new Date(contesta.valor as string).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}. El botón de WhatsApp se ve en la landing y en el aviso de prueba vencida.`
          : "El botón de WhatsApp de la landing y del aviso de prueba vencida sale en cuanto el bot mande su primer mensaje."}
      </Alert>

      <section className="rounded-lg border border-n-200 bg-white p-4">
        <h2 className="font-semibold text-n-900">Variables</h2>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {variables.map(([n, ok]) => (
            <li key={n} className={ok ? "text-n-700" : "font-semibold text-coral-oscuro"}>
              {ok ? "✔" : "✘"} {n}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
        <h2 className="font-semibold text-n-900">Entrega de mensajes (últimos 7 días)</h2>
        <p className="text-sm text-n-700">Meta acepta el envío y avisa después si llegó. Un mensaje «aceptado» que nunca pasa a «enviado» o «entregado» no salió.</p>
        <ul className="flex flex-wrap gap-3">
          {NOMBRE_ESTADO.map(([k, n]) => (
            <li key={k} className={`rounded-lg border px-3 py-2 ${k === "fallido" && (entregas.por_estado[k] ?? 0) > 0 ? "border-coral bg-coral-suave" : "border-n-200"}`}>
              <p className="text-xs text-n-600">{n}</p>
              <p className="text-xl font-bold tabular-nums text-n-900">{entregas.por_estado[k] ?? 0}</p>
            </li>
          ))}
        </ul>
        {entregas.fallos.length > 0 && (
          <ul className="flex flex-col gap-2 text-sm">
            {entregas.fallos.map((f, i) => (
              <li key={i} className="rounded border border-coral bg-coral-suave p-3 text-n-900">
                <p className="font-semibold">{f.etiqueta ?? f.tipo}{f.negocio ? ` · ${f.negocio}` : ""}{f.telefono_ult4 ? ` · …${f.telefono_ult4}` : ""} · código {f.error_codigo ?? "—"} · {new Date(f.fallido_at).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}</p>
                <p className="text-n-700">{f.motivo}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
        <h2 className="font-semibold text-n-900">Bandeja de Telegram</h2>
        <p className="text-sm text-n-700">
          Webhook: {urlWebhook ? <span className="break-all">{urlWebhook}</span> : "sin conectar"} · Chat vinculado: {chat ? "sí" : "no"}
        </p>
        <div className="flex flex-wrap gap-4">
          <FormularioPlataforma accion={conectarWebhookTelegram} textoBoton="Conectar webhook de Telegram" variante="secundario" />
          <FormularioPlataforma accion={linkVincularTelegram} textoBoton={chat ? "Cambiar el chat de la bandeja" : "Vincular mi Telegram"} />
          <FormularioPlataforma accion={ponerFotoBotTelegram} textoBoton="Poner la foto del bot" variante="secundario" />
        </div>
      </section>

      <section className="flex flex-wrap gap-3">
        <div className="rounded-lg border border-n-200 bg-white px-4 py-3">
          <p className="text-sm text-n-600">IA este mes</p>
          <p className="text-2xl font-bold tabular-nums text-n-900">${gasto.toFixed(2)}</p>
          <p className="text-xs text-n-600">{Number(resumenUso.respuestas ?? 0)} llamadas · {escalados} escaladas</p>
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-n-900">Conversaciones</h2>
        {!hilos?.length ? (
          <Alert variante="info" titulo="Todavía no escribe nadie">Aquí salen las conversaciones en cuanto el número esté activo.</Alert>
        ) : (
          <ul className="mt-2 divide-y divide-n-200 rounded-lg border border-n-200 bg-white">
            {(hilos as Hilo[]).map((h) => (
              <li key={h.telefono} className="px-4 py-3 text-sm">
                <p className="font-semibold text-n-900">
                  +{h.telefono} · {NOMBRE_TIPO[h.tipo] ?? h.tipo}
                  {h.negocio_nombre ? ` · ${h.negocio_nombre}` : ""}
                  {h.urgencia === "urgente" ? " · urgente" : ""} · {h.estado}
                </p>
                {h.resumen && <p className="mt-0.5 text-n-700">{h.resumen}</p>}
                <p className="text-xs text-n-600">{new Date(h.updated_at).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
