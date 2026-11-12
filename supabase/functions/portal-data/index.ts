// Everything a signed-in client sees, for their own project only.
//   POST { portal_id? }                               -> the portal
//   POST { portal_id, action: "file", attachment_id }  -> one document (base64)
// Admins and the portal's teammates can call this too, to preview exactly what the client sees.
import { admin, callerEmail, cors, fail, json, setting, staffFor } from "../_shared/util.ts";
import { customerFile, customerFiles, invoices, schedule } from "../_shared/aspire.ts";
import { clientPhotos } from "../_shared/companycam.ts";
import { coverUrl } from "../_shared/portal.ts";

const SIGN = 60 * 60 * 6; // photo links last 6 hours

async function safe<T>(label: string, f: () => Promise<T>, fallback: T, problems: string[]): Promise<T> {
  try { return await f(); } catch (e) { console.error(label, e); problems.push(label); return fallback; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const email = await callerEmail(req);
  if (!email) return fail(req, "Please sign in.", 401);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* empty body is fine */ }
  const db = admin();

  // Which portals may this person open?
  const staff = await staffFor(email);
  const { data: mine } = await db.from("portal_people").select("id,portal_id,portals!inner(id,project_name,status)").ilike("email", email).eq("portals.status", "invited");
  const allowed = new Map<string, string>((mine ?? []).map((m: any) => [m.portal_id, m.portals.project_name]));
  let portalId = (b.portal_id as string) || [...allowed.keys()][0];
  let preview = false;
  if (portalId && !allowed.has(portalId) && staff) {
    const { data: ok } = staff.role === "admin" ? { data: true } : await db.rpc("can_post_as", { p: portalId, e: email });
    preview = Boolean(ok);
  }
  if (!portalId || (!allowed.has(portalId) && !preview)) {
    return fail(req, allowed.size ? "That project isn't on your account." : "We couldn't find a project for this email. Please contact New Vista.", 404);
  }

  const { data: p } = await db.from("portals").select("*").eq("id", portalId).single();
  if (!p) return fail(req, "Project not found", 404);
  const s = p.sections as Record<string, boolean>;
  const hidden = p.hidden_items as { invoices: number[]; photos: string[]; documents: number[] };

  // A single document download
  if (b.action === "file") {
    const id = Number(b.attachment_id);
    if (!s.documents || hidden.documents.includes(id) || !p.aspire_opportunity_id) return fail(req, "Not available", 404);
    const f = await customerFile(p.aspire_opportunity_id, id);
    return f ? json(req, { name: f.FileName, data: f.FileData }) : fail(req, "Not available", 404);
  }

  const problems: string[] = [];
  const opp = p.aspire_opportunity_id as number | null;

  const [contact, team, updates, sched, inv, docs, photos, billingUrl, tag] = await Promise.all([
    db.from("staff").select("name,title,phone,email,photo_path,color").eq("id", p.contact_staff_id).maybeSingle().then((r) => r.data),
    s.team ? db.from("portal_team").select("show_on_team,staff(name,title,photo_path,color)").eq("portal_id", p.id).eq("show_on_team", true).then((r) => r.data ?? []) : [],
    s.updates ? db.from("updates").select("id,body,photo_paths,created_at,staff(name,title,photo_path,color)").eq("portal_id", p.id).eq("hidden", false).order("created_at", { ascending: false }).limit(50).then((r) => r.data ?? []) : [],
    s.schedule && opp ? safe("schedule", () => schedule(opp), [], problems) : [],
    s.payments && opp && p.aspire_property_id ? safe("payments", () => invoices(p.aspire_property_id, opp), [], problems) : [],
    s.documents && opp ? safe("documents", () => customerFiles(opp), [], problems) : [],
    s.photos && p.companycam_project_id ? setting<string>("companycam_tag").then((t) => safe("photos", () => clientPhotos(p.companycam_project_id, t ?? "Client"), [], problems)) : [],
    setting<string>("billing_portal_url"),
    Promise.resolve(null),
  ]);
  void tag;

  // Sign storage paths so the browser can show private photos for a few hours.
  const sign = async (path: string | null) => {
    if (!path) return null;
    const { data } = await db.storage.from("portal-media").createSignedUrl(path, SIGN);
    return data?.signedUrl ?? null;
  };
  const person = async (x: any) => x ? ({ name: x.name, title: x.title, color: x.color, photo: await sign(x.photo_path) }) : null;

  if (!preview) {
    await db.from("portal_people").update({ last_seen_at: new Date().toISOString() }).eq("portal_id", p.id).ilike("email", email);
  }

  const mark = (rows: any[], ids: (string | number)[]) =>
    preview ? rows.map((r) => ({ ...r, hidden: ids.includes(r.id) })) : rows.filter((r) => !ids.includes(r.id));

  const { data: people } = await db.from("portal_people").select("name,is_primary").eq("portal_id", p.id).order("is_primary", { ascending: false });

  return json(req, {
    preview,
    portals: [...allowed].map(([id, name]) => ({ id, name })),
    portal: {
      id: p.id, project_name: p.project_name, headline: p.headline, address: p.property_address, city: p.property_city,
      cover: await coverUrl(p.cover_path, SIGN), sections: s, opportunity_number: p.opportunity_number,
    },
    people: people ?? [],
    contact: contact ? { ...(await person(contact)), phone: contact.phone, email: contact.email } : null,
    team: await Promise.all((team as any[]).map((t) => person(t.staff))),
    updates: await Promise.all((updates as any[]).map(async (u) => ({
      id: u.id, body: u.body, at: u.created_at, author: await person(u.staff),
      photos: (await Promise.all((u.photo_paths ?? []).map(sign))).filter(Boolean),
    }))),
    schedule: sched,
    // Clients never receive hidden items. Admin previews get them, marked hidden, so Jana can switch them back on.
    invoices: mark(inv as any[], hidden.invoices),
    documents: mark(docs as any[], hidden.documents),
    photos: mark(photos as any[], hidden.photos),
    billing_url: billingUrl,
    problems,
  });
});
