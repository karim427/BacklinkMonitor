// OpenAI-compatible chat client (default: z.ai GLM with web search) + deterministic fallbacks.
export const aiConfigured = () => !!process.env.AI_API_KEY && !!process.env.AI_BASE_URL;
export const aiStatus = () => ({
  configured: aiConfigured(), model: process.env.AI_MODEL ?? "glm-4.6", provider: (process.env.AI_BASE_URL ?? "").includes("z.ai") ? "z.ai" : "openai-compatible", webSearch: true,
});

export async function chat(messages: { role: "system" | "user"; content: string }[], opts: { webSearch?: boolean; json?: boolean } = {}): Promise<string> {
  if (!aiConfigured()) throw new Error("AI not configured");
  const body: any = { model: process.env.AI_MODEL ?? "glm-4.6", messages, temperature: 0.2 };
  // The web_search tool is z.ai-specific; OpenAI's chat API rejects it, so only send it to z.ai.
  if (opts.webSearch && (process.env.AI_BASE_URL ?? "").includes("z.ai")) body.tools = [{ type: "web_search", web_search: { enable: true, search_engine: "search-prime" } }];
  if (opts.json) body.response_format = { type: "json_object" };
  const r = await fetch(`${process.env.AI_BASE_URL!.replace(/\/$/, "")}/chat/completions`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.AI_API_KEY}` }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`AI ${r.status}`);
  const j = (await r.json()) as any;
  return j.choices?.[0]?.message?.content ?? "";
}

export function extractJson<T>(text: string): T {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = m ? m[1] : text.slice(text.search(/[\[{]/));
  return JSON.parse(raw);
}
