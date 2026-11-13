// Sends email through Resend (https://resend.com). Mail comes from @newvistaent.com once the
// domain is verified in Resend. See SETUP.md, step 5.
import { env, esc } from "./util.ts";

export interface Mail {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;        // "Name <address@newvistaent.com>"; defaults to MAIL_FROM
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
}

const list = (v?: string | string[]) => (v ? (Array.isArray(v) ? v : [v]) : []).filter(Boolean);

export async function sendMail(m: Mail) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: m.from || env("MAIL_FROM"),
      to: list(m.to),
      cc: list(m.cc).length ? list(m.cc) : undefined,
      bcc: list(m.bcc).length ? list(m.bcc) : undefined,
      reply_to: m.replyTo || undefined,
      subject: m.subject,
      html: m.html,
    }),
  });
  if (!r.ok) throw new Error(`Email failed (${r.status}): ${await r.text()}`);
}

// --- Branded email shell ---------------------------------------------------
const PINE = "#2F3F31", BLOSSOM = "#CC6748", SNOW = "#FFFFF8", SAND = "#F2F1E7", INK = "#1F2A20", BODY = "#33402F";

export function brandedEmail(o: { heading: string; paragraphs: string[]; button?: { label: string; url: string }; note?: string; coverUrl?: string | null; signoff?: string }) {
  const logo = `${env("SITE_URL")}/assets/logo/nv-horizontal-reverse.png`;
  return `<!doctype html><html><body style="margin:0;background:${SAND};padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:${BODY}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${SNOW};border-radius:10px;overflow:hidden">
<tr><td style="background:${PINE};padding:20px 28px"><img src="${logo}" alt="New Vista" height="30" style="display:block;height:30px"></td></tr>
${o.coverUrl ? `<tr><td><img src="${esc(o.coverUrl)}" alt="" width="600" style="display:block;width:100%;height:auto"></td></tr>` : ""}
<tr><td style="padding:28px 28px 8px">
${o.note ? `<p style="margin:0 0 16px;font-style:italic;color:#5B6657;font-size:15px">${esc(o.note)}</p>` : ""}
<h1 style="margin:0;font-size:28px;line-height:1.1;color:${INK}">${esc(o.heading)}</h1>
${o.paragraphs.map((p) => `<p style="margin:14px 0 0;font-size:16px;line-height:1.6">${p}</p>`).join("")}
${o.button ? `<p style="margin:24px 0 0"><a href="${esc(o.button.url)}" style="display:inline-block;background:${BLOSSOM};color:#fff;text-decoration:none;font-weight:bold;padding:13px 24px;border-radius:999px;font-size:16px">${esc(o.button.label)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:22px 28px 26px;font-size:15px">${o.signoff ?? ""}</td></tr>
<tr><td style="background:${SAND};padding:14px 28px;font-size:11px;letter-spacing:.06em;color:#6B7468">NEW VISTA ENTERPRISES · CHESTERLAND, OH · FAMILY OWNED SINCE 2000</td></tr>
</table></td></tr></table></body></html>`;
}

// Plain, functional email for internal alerts.
export function plainEmail(lines: string[], button?: { label: string; url: string }, fine?: string) {
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#202124">
${lines.map((l) => `<p style="margin:0 0 12px">${l}</p>`).join("")}
${button ? `<p><a href="${esc(button.url)}" style="display:inline-block;background:${PINE};color:${SNOW};text-decoration:none;font-weight:bold;padding:11px 20px;border-radius:8px">${esc(button.label)}</a></p>` : ""}
${fine ? `<p style="color:#5F6368;font-size:13px;margin-top:18px">${fine}</p>` : ""}
</body></html>`;
}
