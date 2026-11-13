// Admin-only actions that need server powers. Everything else the admin page does
// directly against the database (protected by the security rules).
//   { action: "ensure-login", email }                 -> lets a staff member sign in
//   { action: "send-invite", portal_id, person_ids? }  -> emails the welcome + sign-in link
//   { action: "aspire-check" }                         -> runs the Aspire check right now
import { admin, callerEmail, cors, env, esc, fail, json, staffFor } from "../_shared/util.ts";
import { brandedEmail, sendMail } from "../_shared/email.ts";
import { coverUrl, ensureUser } from "../_shared/portal.ts";


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const email = await callerEmail(req);
  const me = email ? await staffFor(email) : null;
  if (!me || me.role !== "admin") return fail(req, "Only admins can do that.", 403);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return fail(req, "Bad request"); }
  const db = admin();

  if (b.action === "ensure-login") {
    const e = String(b.email ?? "").trim().toLowerCase();
    if (!e) return fail(req, "Email needed");
    await ensureUser(e);
    return json(req, { ok: true });
  }

  if (b.action === "aspire-check") {
    const r = await fetch(`${env("SUPABASE_URL")}/functions/v1/aspire-sync`, { method: "POST", headers: { "x-sync-secret": env("SYNC_SECRET") } });
    return json(req, await r.json(), r.status);
  }

  if (b.action === "send-invite") {
    const { data: portal } = await db.from("portals").select("*").eq("id", b.portal_id).single();
    if (!portal) return fail(req, "Portal not found", 404);
    const { data: contact } = await db.from("staff").select("*").eq("id", portal.contact_staff_id).maybeSingle();
    const sender = contact ?? me;

    let q = db.from("portal_people").select("*").eq("portal_id", portal.id);
    if (Array.isArray(b.person_ids) && b.person_ids.length) q = q.in("id", b.person_ids as string[]);
    else q = q.is("invited_at", null);
    const { data: people } = await q;
    if (!people?.length) return fail(req, "No one to invite. Add a person with an email first.");

    const cover = await coverUrl(portal.cover_path);
    const portalUrl = `${env("SITE_URL")}/portal/?p=${portal.id}`;
    const sent: string[] = [], failed: string[] = [];

    for (const person of people) {
      try {
        await ensureUser(person.email);
        const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email: person.email, options: { redirectTo: portalUrl } });
        if (error || !data?.properties?.action_link) throw error ?? new Error("No link");
        const first = esc(person.name.split(" ")[0] || "there");
        const html = brandedEmail({
          note: portal.invite_note || undefined,
          coverUrl: cover,
          heading: `Welcome, ${person.name.split(" ")[0] || "friend"}.`,
          paragraphs: [
            `Hi ${first}, your New Vista project <b>${esc(portal.project_name)}</b> now has its own page. You'll find your schedule, photos, updates from the crew and anything you need to pay, all in one place.`,
            "The button below signs you straight in. No password to remember.",
          ],
          button: { label: "Open my project", url: data.properties.action_link },
          signoff: `Questions any time? Just reply to this email.<br><br>${esc(sender.name)}<br><span style="color:#6B7468">${esc(sender.title ?? "New Vista Enterprises")}${sender.phone ? ` · ${esc(sender.phone)}` : ""}</span>`,
        });
        // Sent as the contact (e.g. "Jana Kowal <jana@newvistaent.com>"); replies go to her inbox,
        // and she gets a BCC copy so she has a record of every welcome email.
        const fromName = String(sender.name).replace(/[<>"]/g, "");
        const mail = { to: person.email, subject: `Your New Vista project page is ready`, html, replyTo: sender.email, bcc: [sender.email] };
        try { await sendMail({ ...mail, from: `${fromName} <${sender.email}>` }); }
        catch { await sendMail(mail); } // fall back to the shared MAIL_FROM address
        await db.from("portal_people").update({ invited_at: new Date().toISOString() }).eq("id", person.id);
        sent.push(person.email);
      } catch (e) {
        console.error("invite failed", person.email, e);
        failed.push(person.email);
      }
    }

    if (sent.length && portal.status !== "invited") {
      await db.from("portals").update({ status: "invited", invited_at: new Date().toISOString(), invited_by: me.name }).eq("id", portal.id);
    }
    return json(req, { ok: failed.length === 0, sent, failed });
  }

  return fail(req, "Unknown action");
});
