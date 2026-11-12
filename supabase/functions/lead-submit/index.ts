// Universal lead form.
// GET  (header x-staff-code) -> lists for the form (names, owners, sources, brands)
// POST (header x-staff-code) -> saves the lead (hidden; admins only can read it) and alerts Jana.
// The alert email never contains client details, only a link to the admin page.
import { admin, cors, env, esc, fail, json, isEmail, sameText, setting } from "../_shared/util.ts";
import { plainEmail, sendMail } from "../_shared/email.ts";

const clip = (v: unknown, n = 300) => String(v ?? "").trim().slice(0, n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const code = req.headers.get("x-staff-code") ?? "";
  if (!sameText(code, env("STAFF_CODE"))) return fail(req, "That team code isn't right. Ask Jana for the current code.", 401);

  const db = admin();

  if (req.method === "GET") {
    const { data: staff } = await db.from("staff").select("name,on_lead_form,can_own_accounts").eq("active", true).order("name");
    return json(req, {
      names: (staff ?? []).filter((s) => s.on_lead_form).map((s) => s.name),
      owners: (staff ?? []).filter((s) => s.can_own_accounts).map((s) => s.name),
      sources: (await setting<string[]>("lead_sources")) ?? [],
      brands: (await setting<string[]>("brands")) ?? [],
    });
  }

  if (req.method !== "POST") return fail(req, "Not allowed", 405);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return fail(req, "Couldn't read the form."); }
  if (clip(b.website)) return json(req, { ok: true }); // honeypot: bots fill hidden fields

  const kind = b.kind === "Commercial" ? "Commercial" : "Residential";
  const row = {
    brand: clip(b.brand, 60),
    kind,
    submitted_by: clip(b.submitted_by, 120),
    account_owner: clip(b.account_owner, 120),
    first_name: kind === "Residential" ? clip(b.first_name, 80) : null,
    last_name: kind === "Residential" ? clip(b.last_name, 80) : null,
    property_name: kind === "Commercial" ? clip(b.property_name, 160) : null,
    property_address: clip(b.property_address, 300),
    billing_same: b.billing_same !== false,
    billing_address: b.billing_same === false ? clip(b.billing_address, 300) : null,
    contact_name: clip(b.contact_name, 120),
    contact_phone: clip(b.contact_phone, 40),
    contact_email: clip(b.contact_email, 200).toLowerCase(),
    billing_contact_same: b.billing_contact_same !== false,
    billing_contact_name: b.billing_contact_same === false ? clip(b.billing_contact_name, 120) : null,
    billing_contact_email: b.billing_contact_same === false ? clip(b.billing_contact_email, 200).toLowerCase() : null,
    paperless: b.paperless !== false,
    lead_source: clip(b.lead_source, 120),
    notes: clip(b.notes, 4000) || null,
    extra_contacts: Array.isArray(b.extra_contacts)
      ? b.extra_contacts.slice(0, 6).map((c: Record<string, unknown>) => ({ name: clip(c?.name, 120), role: clip(c?.role, 80), phone: clip(c?.phone, 40), email: clip(c?.email, 200) })).filter((c) => c.name || c.email || c.phone)
      : [],
  };

  const missing: string[] = [];
  if (!row.brand) missing.push("brand");
  if (!row.submitted_by) missing.push("your name");
  if (!row.account_owner) missing.push("account owner");
  if (kind === "Residential" && !(row.first_name && row.last_name)) missing.push("client first and last name");
  if (kind === "Commercial" && !row.property_name) missing.push("property name");
  if (!row.property_address) missing.push("property address");
  if (!row.billing_same && !row.billing_address) missing.push("billing address");
  if (!row.contact_name) missing.push("contact name");
  if (!row.contact_phone) missing.push("contact phone");
  if (!isEmail(row.contact_email)) missing.push("a valid contact email");
  if (!row.billing_contact_same && !(row.billing_contact_name && row.billing_contact_email && isEmail(row.billing_contact_email))) missing.push("billing contact name and email");
  if (!row.lead_source) missing.push("lead source");
  if (missing.length) return fail(req, `Please add ${missing.join(", ")}.`);

  const { data, error } = await db.from("leads").insert(row).select("id").single();
  if (error) return fail(req, "Couldn't save the lead. Try again in a minute.", 500);

  // Alert (no client details in email).
  try {
    const to = (await setting<string[]>("lead_alert_to")) ?? [];
    if (to.length) {
      await sendMail({
        to,
        subject: `New lead #${data.id} from ${row.submitted_by}`,
        html: plainEmail(
          [`${esc(row.submitted_by)} sent in a new ${esc(row.brand)} ${kind.toLowerCase()} lead.`, "It's waiting in New Leads. Enter it into Aspire, then mark it entered."],
          { label: "Open New Leads", url: `${env("SITE_URL")}/admin/#leads` },
          "Client details stay in the admin page and are not included in this email.",
        ),
      });
    }
  } catch (e) {
    console.error("lead alert failed", e);
  }

  return json(req, { ok: true, id: data.id });
});
