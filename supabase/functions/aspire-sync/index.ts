// Runs every 15 minutes (see supabase/cron.sql). Looks for jobs newly marked Won in Aspire,
// in the branches listed in settings (New Vista only to start), and creates a pending portal
// for each one. Then emails Jana one alert. Nothing goes to the client until Jana sends it.
import { admin, env, esc, fail, json, sameText, saveSetting, setting } from "../_shared/util.ts";
import { plainEmail, sendMail } from "../_shared/email.ts";
import { primaryContact, property, wonSince } from "../_shared/aspire.ts";
import { findProject } from "../_shared/companycam.ts";

type Defaults = { sections: Record<string, boolean>; headline: string; cover_url: string | null };

Deno.serve(async (req) => {
  if (!sameText(req.headers.get("x-sync-secret") ?? "", env("SYNC_SECRET"))) return fail(req, "Not allowed", 401);
  const db = admin();

  const state = (await setting<{ last_won_check: string | null }>("aspire_sync")) ?? { last_won_check: null };
  const started = new Date();
  // First run: only look back 1 day, so old jobs don't flood in ("new wins only").
  const since = state.last_won_check ?? new Date(Date.now() - 86400_000).toISOString();
  // Look back an extra 2 days each run in case a Won date was back-dated; duplicates are skipped below.
  const sinceDate = new Date(new Date(since).getTime() - 2 * 86400_000).toISOString().slice(0, 10);

  const branches = (await setting<string[]>("portal_branches")) ?? ["New Vista"];
  const defaults = (await setting<Defaults>("portal_defaults"))!;
  const { data: firstAdmin } = await db.from("staff").select("id").eq("role", "admin").eq("active", true).order("created_at").limit(1).maybeSingle();

  // Never re-create a portal for a job we've seen (including ones Jana skipped).
  // A job counts as "new" only if it was Won on or after the very first run.
  const { data: firstRun } = await db.from("app_settings").select("value").eq("key", "aspire_first_run").maybeSingle();
  const floor = (firstRun?.value as string | undefined) ?? started.toISOString().slice(0, 10);
  if (!firstRun) await saveSetting("aspire_first_run", floor);

  const opps = (await wonSince(sinceDate, branches)).filter((o) => o.WonDate && o.WonDate.slice(0, 10) >= floor);
  const created: string[] = [];

  for (const o of opps) {
    const { data: exists } = await db.from("portals").select("id").eq("aspire_opportunity_id", o.OpportunityID).maybeSingle();
    if (exists) continue;

    const p = await property(o.PropertyID).catch(() => null);
    const contact = await primaryContact(o.PropertyID, o.BillingContactID).catch(() => null);
    const address = p ? [p.PropertyAddressLine1, p.PropertyAddressLine2].filter(Boolean).join(", ") : null;
    const ccProject = p?.PropertyAddressLine1 ? await findProject(String(p.PropertyAddressLine1)).catch(() => null) : null;

    const problems: string[] = [];
    if (!contact) problems.push("No primary contact on the property in Aspire");
    else if (!contact.Email) problems.push("The contact has no email in Aspire");
    if (!ccProject) problems.push("No CompanyCam project found yet (photos will be empty until linked)");

    const { data: portal, error } = await db.from("portals").insert({
      aspire_opportunity_id: o.OpportunityID,
      aspire_property_id: o.PropertyID,
      opportunity_number: String(o.OpportunityNumber ?? ""),
      project_name: o.OpportunityName || o.PropertyName,
      property_name: o.PropertyName,
      property_address: address,
      property_city: p ? [p.PropertyAddressCity, p.PropertyAddressStateProvinceCode].filter(Boolean).join(", ") : null,
      branch: o.BranchName,
      won_date: o.WonDate?.slice(0, 10),
      sales_rep: o.SalesRepContactName,
      headline: defaults.headline,
      sections: defaults.sections,
      contact_staff_id: firstAdmin?.id ?? null,
      companycam_project_id: ccProject,
      needs_attention: problems.join(". ") || null,
    }).select("id").single();
    if (error || !portal) { console.error("portal insert failed", o.OpportunityID, error); continue; }

    if (contact?.Email) {
      await db.from("portal_people").insert({
        portal_id: portal.id,
        name: `${contact.FirstName ?? ""} ${contact.LastName ?? ""}`.trim() || "Client",
        email: contact.Email.toLowerCase(),
        is_primary: true,
      });
    }
    created.push(o.OpportunityName || o.PropertyName);
  }

  await saveSetting("aspire_sync", { last_won_check: started.toISOString(), last_count: created.length });

  if (created.length) {
    try {
      const to = (await setting<string[]>("lead_alert_to")) ?? [];
      const { data: admins } = await db.from("staff").select("email").eq("role", "admin").eq("active", true);
      const recipients = to.length ? to : (admins ?? []).map((a) => a.email);
      if (recipients.length) {
        await sendMail({
          to: recipients,
          subject: created.length === 1 ? "New portal ready to review" : `${created.length} new portals ready to review`,
          html: plainEmail(
            [`${created.length === 1 ? "A job was" : `${created.length} jobs were`} marked Won in Aspire:`, `<b>${created.map(esc).join("<br>")}</b>`, "Review each portal and press Approve &amp; send when it looks right."],
            { label: "Review portals", url: `${env("SITE_URL")}/admin/#portals` },
          ),
        });
      }
    } catch (e) { console.error("portal alert failed", e); }
  }

  return json(req, { ok: true, checked: opps.length, created: created.length });
});
