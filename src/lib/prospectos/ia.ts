// Una llamada a la API de Anthropic que obliga a contestar con una herramienta (JSON con forma fija).
// Sin imports: la usan la tarea de Vercel, las acciones de /plataforma/prospectos y los scripts con Node directo.

export type Herramienta = { name: string; description: string; input_schema: Record<string, unknown> };
export type LlamarIA = (o: { sistema: string; usuario: string; herramienta: Herramienta; modelo?: string; maxTokens?: number }) => Promise<unknown>;

// Clasificar ~1,000 negocios: el modelo chico basta. Los mensajes para personas: el del bot de WhatsApp.
export const MODELO_CLASIFICAR = "claude-haiku-5-5";
export const MODELO_MENSAJES = "claude-sonnet-5";

export function crearLlamarIA(o: { apiKey: string; workspace?: string | null; url?: string; topeMs?: number }): LlamarIA {
  return async ({ sistema, usuario, herramienta, modelo, maxTokens }) => {
    let ultimo: unknown = null;
    for (let intento = 0; intento < 3; intento++) {
      try {
        const r = await fetch(`${o.url ?? "https://api.anthropic.com"}/v1/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": o.apiKey,
            "anthropic-version": "2023-06-01",
            ...(o.workspace ? { "anthropic-workspace-id": o.workspace } : {}),
          },
          body: JSON.stringify({
            model: modelo ?? MODELO_CLASIFICAR,
            max_tokens: maxTokens ?? 4000,
            system: sistema,
            messages: [{ role: "user", content: usuario }],
            tools: [herramienta],
            tool_choice: { type: "tool", name: herramienta.name },
          }),
          signal: AbortSignal.timeout(o.topeMs ?? 90_000),
        });
        if (r.status === 429 || r.status >= 500) {
          ultimo = new Error(`Anthropic ${r.status}`);
          await new Promise((res) => setTimeout(res, 2000 * (intento + 1)));
          continue;
        }
        const j = (await r.json()) as { content?: { type: string; name?: string; input?: unknown }[]; error?: { message?: string } };
        if (!r.ok) throw new Error(`Anthropic ${r.status}: ${j.error?.message ?? ""}`.slice(0, 300));
        const uso = j.content?.find((c) => c.type === "tool_use" && c.name === herramienta.name);
        if (!uso) throw new Error("La IA no contestó con la herramienta.");
        return uso.input;
      } catch (e) {
        ultimo = e;
        if (e instanceof Error && /^Anthropic 4\d\d/.test(e.message)) break;
      }
    }
    throw ultimo instanceof Error ? ultimo : new Error("La IA no contestó.");
  };
}
