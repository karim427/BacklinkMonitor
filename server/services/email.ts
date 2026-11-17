/** Sends mail through Resend. Without RESEND_API_KEY, local dev logs the message instead; production refuses. */
export const emailConfigured = () => !!process.env.RESEND_API_KEY || !process.env.VERCEL;

export async function sendEmail(to: string, subject: string, text: string, html?: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.VERCEL) throw new Error("Email sending is not configured (RESEND_API_KEY missing).");
    console.log(`[email → ${to}] ${subject}\n${text}`);
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Backlink Verify <onboarding@resend.dev>", to: [to], subject, text, html }),
  });
  if (!r.ok) throw new Error(`Email provider error ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
