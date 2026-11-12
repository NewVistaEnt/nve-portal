# New Vista: lead form + client portal

Two tools that sit beside Aspire so staff keep working the way they're trained:

* **New Lead form** (`web/lead/`) replaces the "New Additions to Aspire" checklist. Anyone on the team fills it in; it's stored privately and only admins can see it. Jana gets a short alert with no client details.
* **My New Vista** (`web/portal/`) is a client page per won job. When a New Vista job is marked **Won** in Aspire, a portal is drafted automatically. Jana reviews it and presses **Approve & send**, and the client gets a sign-in link. Schedule, invoices and shared files come live from Aspire; photos tagged "Client" come from CompanyCam; updates are posted by the team. Payments stay in Aspire's billing portal.

**Setup:** see [SETUP.md](SETUP.md).

## How it's built

| Part | Where | Notes |
|---|---|---|
| Pages | `web/` → GitHub Pages | Plain HTML/JS, no build step |
| Database, sign-in, photo storage | Supabase | `supabase/migrations/…init.sql`; security rules keep leads admin-only and clients out of the tables |
| Server functions | `supabase/functions/` | `lead-submit`, `aspire-sync` (every 15 min), `portal-admin`, `portal-data`, `message-contact`, `auth-email-hook` |
| Email | Microsoft 365 via Graph | `_shared/email.ts` |
| Aspire / CompanyCam | read-only | `_shared/aspire.ts`, `_shared/companycam.ts` |

## Later (option B)

`leads` already has `aspire_property_id` / `aspire_contact_id`. Writing new leads straight into Aspire means adding a POST to Aspire's Properties/Contacts endpoints in `lead-submit` (needs an Aspire API user with write access), then New Leads becomes a quick "looks good" review.
