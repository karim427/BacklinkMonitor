/** Reads the text and subject out of what different email-to-webhook services post. Pure, so it can be tested. */
const stripHtml = (h: string) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();

export function readInboundMail(b: Record<string, any>): { subject: string; text: string } {
  const h = (b.headers && typeof b.headers === "object" ? b.headers : {}) as Record<string, any>;
  const subject = String(b.subject ?? b.Subject ?? h.subject ?? h.Subject ?? "");
  const text = String(b.text ?? b.plain ?? b["body-plain"] ?? b["stripped-text"] ?? b.TextBody ?? b.body ?? "").trim();
  const html = String(b.html ?? b["body-html"] ?? b.HtmlBody ?? "");
  return { subject, text: text || (html ? stripHtml(html) : "") };
}
