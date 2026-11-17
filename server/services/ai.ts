// OpenAI-compatible chat client (default: z.ai GLM with web search) + deterministic fallbacks.
export const aiConfigured = () => !!process.env.AI_API_KEY && !!process.env.AI_BASE_URL;
export const aiStatus = () => ({
  configured: aiConfigured(), model: process.env.AI_MODEL ?? "glm-4.6", provider: (process.env.AI_BASE_URL ?? "").includes("z.ai") ? "z.ai" : "openai-compatible", webSearch: true,
});

export async function chat(messages: { role: "system" | "user"; content: string }[], opts: { webSearch?: boolean; json?: boolean } = {}): Promise<string> {
  if (!aiConfigured()) throw new Error("AI not configured");
  const base = process.env.AI_BASE_URL ?? "";
  const body: any = { model: process.env.AI_MODEL ?? "glm-4.6", messages, temperature: 0.2 };
  if (opts.json) body.response_format = { type: "json_object" };
  if (opts.webSearch && base.includes("z.ai")) {
    body.tools = [{ type: "web_search", web_search: { enable: true, search_engine: "search-prime" } }];
  } else if (opts.webSearch && base.includes("api.openai.com")) {
    // OpenAI searches the live web only through its search models. They reject temperature and JSON mode (the prompt already asks for JSON).
    body.model = process.env.AI_SEARCH_MODEL ?? "gpt-5-search-api";
    body.web_search_options = {};
    delete body.temperature; delete body.response_format;
  }
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
