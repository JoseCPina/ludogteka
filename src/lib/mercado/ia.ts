// Una llamada a la API de Anthropic con herramienta obligatoria que además devuelve los tokens usados (para el tope
// de gasto de la recolección de precios). Sin imports: la usan los scripts de scripts/mercado con Node directo.
export type RespuestaConUso = { entrada: unknown; tokensIn: number; tokensOut: number };

export function crearIAConUso(o: { apiKey: string; workspace?: string | null; url?: string; modelo?: string; topeMs?: number }) {
  return async (sistema: string, usuario: string, herramienta: { name: string; description: string; input_schema: Record<string, unknown> }, maxTokens = 4000): Promise<RespuestaConUso> => {
    let ultimo: unknown = null;
    for (let intento = 0; intento < 3; intento++) {
      try {
        const r = await fetch(`${o.url ?? "https://api.anthropic.com"}/v1/messages`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": o.apiKey, "anthropic-version": "2023-06-01", ...(o.workspace ? { "anthropic-workspace-id": o.workspace } : {}) },
          body: JSON.stringify({ model: o.modelo ?? "claude-haiku-5-5", max_tokens: maxTokens, system: sistema, messages: [{ role: "user", content: usuario }], tools: [herramienta], tool_choice: { type: "tool", name: herramienta.name } }),
          signal: AbortSignal.timeout(o.topeMs ?? 90_000),
        });
        if (r.status === 429 || r.status >= 500) {
          ultimo = new Error(`Anthropic ${r.status}`);
          await new Promise((res) => setTimeout(res, 2000 * (intento + 1)));
          continue;
        }
        const j = (await r.json()) as { content?: { type: string; name?: string; input?: unknown }[]; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string } };
        if (!r.ok) throw new Error(`Anthropic ${r.status}: ${j.error?.message ?? ""}`.slice(0, 300));
        const uso = j.content?.find((c) => c.type === "tool_use" && c.name === herramienta.name);
        return { entrada: uso?.input ?? null, tokensIn: Number(j.usage?.input_tokens ?? 0), tokensOut: Number(j.usage?.output_tokens ?? 0) };
      } catch (e) {
        ultimo = e;
        if (e instanceof Error && /^Anthropic 4\d\d/.test(e.message)) break;
      }
    }
    throw ultimo instanceof Error ? ultimo : new Error("La IA no contestó.");
  };
}
