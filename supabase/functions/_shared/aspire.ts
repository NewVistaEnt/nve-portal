// Read-only connection to Aspire's API (https://cloud-api.youraspire.com).
// Field names come from Aspire's published API reference (Swagger), Nov 2026.
// Everything Aspire-specific lives in this file so it is easy to adjust after the first live test.
import { env } from "./util.ts";

const BASE = "https://cloud-api.youraspire.com";
let cached: { token: string; until: number } | null = null;

async function token(): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.token;
  const r = await fetch(`${BASE}/Authorization`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ClientId: env("ASPIRE_CLIENT_ID"), Secret: env("ASPIRE_SECRET") }),
  });
  if (!r.ok) throw new Error(`Aspire sign-in failed (${r.status})`);
  const j = await r.json();
  // Aspire tokens last about an hour; refresh a little early.
  cached = { token: j.Token, until: Date.now() + 50 * 60 * 1000 };
  return cached.token;
}

type Q = { filter?: string; select?: string; expand?: string; orderby?: string; top?: number };

// GET /<resource> with OData-style query options. Follows pages until done (max 2,000 rows).
export async function aspireGet<T = Record<string, unknown>>(resource: string, q: Q = {}): Promise<T[]> {
  const out: T[] = [];
  const limit = q.top ?? 2000;
  for (let page = 1; out.length < limit && page <= 20; page++) {
    const p = new URLSearchParams();
    if (q.filter) p.set("$filter", q.filter);
    if (q.select) p.set("$select", q.select);
    if (q.expand) p.set("$expand", q.expand);
    if (q.orderby) p.set("$orderby", q.orderby);
    p.set("$limit", "100");
    p.set("$pageNumber", String(page));
    const r = await fetch(`${BASE}/${resource}?${p}`, { headers: { Authorization: `Bearer ${await token()}` } });
    if (r.status === 401) { cached = null; page--; continue; }
    if (!r.ok) throw new Error(`Aspire ${resource} failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
    const rows = (await r.json()) as T[];
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out.slice(0, limit);
}

const str = (s: string) => `'${s.replace(/'/g, "''")}'`;

// --- What the portal needs ------------------------------------------------

export interface Opp {
  OpportunityID: number; OpportunityNumber: number | string; OpportunityName: string;
  OpportunityStatusName: string; BranchName: string; PropertyID: number; PropertyName: string;
  SalesRepContactName: string | null; OperationsManagerContactName: string | null;
  WonDate: string | null; StartDate: string | null; EndDate: string | null; ModifiedDate?: string;
  BillingContactID: number | null; BillingContactName: string | null;
}

const OPP_FIELDS = "OpportunityID,OpportunityNumber,OpportunityName,OpportunityStatusName,BranchName,PropertyID,PropertyName,SalesRepContactName,OperationsManagerContactName,WonDate,StartDate,EndDate,BillingContactID,BillingContactName";

// Jobs marked Won on or after `since`, in the given branches.
export async function wonSince(since: string, branches: string[]): Promise<Opp[]> {
  const b = branches.map((x) => `BranchName eq ${str(x)}`).join(" or ");
  return aspireGet<Opp>("Opportunities", {
    filter: `OpportunityStatusName eq 'Won' and WonDate ge ${since}${b ? ` and (${b})` : ""}`,
    select: OPP_FIELDS,
    orderby: "WonDate",
  });
}

export async function opportunity(id: number): Promise<Opp | null> {
  const r = await aspireGet<Opp>("Opportunities", { filter: `OpportunityID eq ${id}`, select: OPP_FIELDS, top: 1 });
  return r[0] ?? null;
}

export async function property(id: number) {
  const r = await aspireGet<Record<string, unknown>>("Properties", {
    filter: `PropertyID eq ${id}`,
    select: "PropertyID,PropertyName,PropertyAddressLine1,PropertyAddressLine2,PropertyAddressCity,PropertyAddressStateProvinceCode,PropertyAddressZipCode",
    top: 1,
  });
  return r[0] ?? null;
}

// The property's primary contact, with email. Falls back to the billing contact.
export async function primaryContact(propertyId: number, billingContactId?: number | null) {
  const links = await aspireGet<{ ContactID: number; PrimaryContact: boolean; BillingContact: boolean }>("PropertyContacts", {
    filter: `PropertyID eq ${propertyId}`, select: "ContactID,PrimaryContact,BillingContact",
  });
  const pick = links.find((l) => l.PrimaryContact) ?? links.find((l) => l.BillingContact);
  const id = pick?.ContactID ?? billingContactId;
  if (!id) return null;
  const c = await aspireGet<{ ContactID: number; FirstName: string; LastName: string; Email: string | null }>("Contacts", {
    filter: `ContactID eq ${id}`, select: "ContactID,FirstName,LastName,Email", top: 1,
  });
  return c[0] ?? null;
}

// Schedule: services on the job, their work tickets and crew visits.
export async function schedule(oppId: number) {
  const services = await aspireGet<{ OpportunityServiceID: number; DisplayName: string; SortOrder: number }>("OpportunityServices", {
    filter: `OpportunityID eq ${oppId}`, select: "OpportunityServiceID,DisplayName,SortOrder",
  });
  const tickets = await aspireGet<{ WorkTicketID: number; OpportunityServiceID: number; ScheduledStartDate: string | null; AnticStartDate: string | null; CompleteDate: string | null; WorkTicketStatusName: string }>("WorkTickets", {
    filter: `OpportunityID eq ${oppId}`,
    select: "WorkTicketID,OpportunityServiceID,ScheduledStartDate,AnticStartDate,CompleteDate,WorkTicketStatusName",
  });
  const visits: { WorkTicketID: number; ScheduledDate: string }[] = [];
  // Ask in small batches so the filter stays short.
  for (let i = 0; i < tickets.length; i += 15) {
    const ids = tickets.slice(i, i + 15).map((t) => `WorkTicketID eq ${t.WorkTicketID}`).join(" or ");
    if (ids) visits.push(...await aspireGet<{ WorkTicketID: number; ScheduledDate: string }>("WorkTicketVisits", { filter: ids, select: "WorkTicketID,ScheduledDate" }));
  }
  const name = new Map(services.map((s) => [s.OpportunityServiceID, s]));
  return tickets.map((t) => ({
    service: name.get(t.OpportunityServiceID)?.DisplayName ?? "Work",
    sort: name.get(t.OpportunityServiceID)?.SortOrder ?? 0,
    status: t.WorkTicketStatusName,
    start: t.ScheduledStartDate ?? t.AnticStartDate,
    scheduled: Boolean(t.ScheduledStartDate),
    completed: t.CompleteDate,
    visits: visits.filter((v) => v.WorkTicketID === t.WorkTicketID).map((v) => v.ScheduledDate).sort(),
  })).sort((a, b) => String(a.start ?? "9").localeCompare(String(b.start ?? "9")) || a.sort - b.sort);
}

// Invoices on this property that include this job.
export async function invoices(propertyId: number, oppId: number) {
  const rows = await aspireGet<{ InvoiceID: number; InvoiceNumber: number; InvoiceDate: string; DueDate: string | null; Amount: number; AmountRemaining: number; InvoiceVoid: boolean; InvoiceOpportunities?: { OpportunityID: number }[] }>("Invoices", {
    filter: `PropertyID eq ${propertyId}`,
    select: "InvoiceID,InvoiceNumber,InvoiceDate,DueDate,Amount,AmountRemaining,InvoiceVoid",
    expand: "InvoiceOpportunities",
    orderby: "InvoiceDate desc",
  });
  return rows
    .filter((r) => !r.InvoiceVoid && (r.InvoiceOpportunities ?? []).some((o) => o.OpportunityID === oppId))
    .map((r) => ({ id: r.InvoiceID, number: r.InvoiceNumber, date: r.InvoiceDate, due: r.DueDate, amount: r.Amount, remaining: r.AmountRemaining }));
}

// Files staff marked "Show customer" on the job.
export async function customerFiles(oppId: number) {
  const rows = await aspireGet<{ AttachmentID: number; AttachmentName: string; FileExtension: string; DateUploaded: string; ShowCustomer: boolean }>("Attachments", {
    filter: `OpportunityID eq ${oppId} and ShowCustomer eq true`,
    select: "AttachmentID,AttachmentName,FileExtension,DateUploaded,ShowCustomer",
  });
  return rows.map((a) => ({ id: a.AttachmentID, name: a.AttachmentName, ext: a.FileExtension, date: a.DateUploaded }));
}

// One file's contents (base64), only if it belongs to the job and is marked Show customer.
export async function customerFile(oppId: number, attachmentId: number) {
  const ok = await aspireGet("Attachments", { filter: `AttachmentID eq ${attachmentId} and OpportunityID eq ${oppId} and ShowCustomer eq true`, select: "AttachmentID", top: 1 });
  if (!ok.length) return null;
  const r = await aspireGet<{ FileName: string; FileData: string }>("Attachments/AttachmentFileData", { filter: `AttachmentID eq ${attachmentId}`, top: 1 });
  return r[0] ?? null;
}
