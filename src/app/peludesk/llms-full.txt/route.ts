import { llmsFull } from "@/lib/peludesk/llms";

export async function GET() {
  return new Response(await llmsFull(), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" } });
}
