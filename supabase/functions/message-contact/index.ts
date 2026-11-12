// "Message Jana": a client writes a note on their portal; it's emailed to their contact
// (reply goes straight back to the client) and kept in a log.
import { admin, callerEmail, cors, env, esc, fail, json } from "../_shared/util.ts";
import { plainEmail, sendMail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const email = await callerEmail(req);
  if (!email) return fail(req, "Please sign in.", 401);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return fail(req, "Bad request"); }
  const body = String(b.body ?? "").trim().slice(0, 4000);
  if (!body) return fail(req, "Write a message first.");
  const db = admin();

  const { data: me } = await db.from("portal_people").select("name,portal_id,portals!inner(id,project_name,status,contact_staff_id)")
    .ilike("email", email).eq("portal_id", b.portal_id).eq("portals.status", "invited").maybeSingle();
  if (!me) return fail(req, "Only the client can send messages from this page.", 403);

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("from_email", email).gte("created_at", hourAgo);
  if ((count ?? 0) >= 10) return fail(req, "You've sent a lot of messages this hour. Please call us if it's urgent.", 429);

  const p = (me as any).portals;
  const { data: contact } = await db.from("staff").select("name,email").eq("id", p.contact_staff_id).maybeSingle();
  const to = contact?.email ?? env("MAIL_FROM");

  await sendMail({
    to,
    replyTo: email,
    subject: `Message from ${me.name} · ${p.project_name}`,
    html: plainEmail(
      [`<b>${esc(me.name)}</b> (${esc(email)}) wrote from their project page:`, `<div style="border-left:3px solid #CC6748;padding:4px 0 4px 14px;white-space:pre-wrap">${esc(body)}</div>`],
      { label: "Open this portal", url: `${env("SITE_URL")}/admin/#portal/${p.id}` },
      "Reply to this email to answer them directly.",
    ),
  });
  await db.from("messages").insert({ portal_id: p.id, from_email: email, body });
  return json(req, { ok: true, to: contact?.name ?? "New Vista" });
});
