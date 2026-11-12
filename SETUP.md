# Setup guide: New Lead form + My New Vista client portal

About 1–2 hours the first time. Work through the steps in order. Anything marked **IT** may need whoever manages Microsoft 365 for New Vista.

**What you end up with**

| Page | Address (suggested) | Who uses it |
|---|---|---|
| Lead form | `portal.newvistaent.com/lead/` | Whole team (one team code per phone) |
| Admin | `portal.newvistaent.com/admin/` | Jana (and any other admins) |
| Post an update | `portal.newvistaent.com/post/` | Teammates on a project |
| Client portal | `portal.newvistaent.com/portal/` | Clients (sign-in link by email, no passwords) |

**Monthly cost:** Supabase Pro $25 (recommended so the database is never paused and gets daily backups). GitHub Pages is free. Email goes out through New Vista's existing Microsoft 365.

---

## 1. Create the accounts (owned by New Vista, not a person)

1. **GitHub:** create a free organization, e.g. `newvista-ent`, using a shared company email. Create a repository named `nve-portal` and upload everything in this folder. Keep the repository **private** if your plan allows Pages from private repos (GitHub Team); otherwise public is OK, because no secrets are in these files. 
2. **Supabase:** sign up at supabase.com with the same company email, create an organization "New Vista Enterprises", upgrade it to Pro, and create a project named `nve-portal` (region: East US). Save the database password in your password manager.

## 2. Build the database

Supabase → **SQL Editor** → New query → paste all of `supabase/migrations/20261112000000_init.sql` → **Run**. It should finish with no errors.

Then add Jana as the first admin (change the email/name):

```sql
insert into staff (email, name, title, role, on_lead_form)
values ('jana@newvistaent.com', 'Jana ___', 'Client Care', 'admin', true);
update app_settings set value = '["jana@newvistaent.com"]' where key = 'lead_alert_to';
```

Then **Authentication → Users → Add user → Create new user**: Jana's email, any long random password, tick **Auto confirm user**. (She'll never use the password; she signs in by email link.) Everyone else gets added from the admin's **Team** page later.

## 3. Point the pages at Supabase

Supabase → **Project Settings → API**. Copy the **Project URL** and the **anon public** key into `web/assets/config.js`. Both are safe to publish. Add the office phone there too if you want it on the portal.

## 4. Turn on the pages (GitHub Pages)

1. Repository → **Settings → Pages → Source: GitHub Actions**. The included workflow publishes the `web/` folder each time you push.
2. Custom domain: enter `portal.newvistaent.com`. In your DNS (wherever newvistaent.com is managed) add a **CNAME** record: `portal` → `newvista-ent.github.io`. After it verifies, tick **Enforce HTTPS**.

## 5. Email through Microsoft 365 (**IT**)

The portal sends mail through Microsoft Graph, not SMTP (Microsoft is switching off basic-auth SMTP for Exchange Online starting at the end of December 2026).

1. Create a shared mailbox, e.g. `portal@newvistaent.com` (free; no license).
2. **Entra admin center → App registrations → New registration** "NVE Portal mail". Note the **Application (client) ID** and **Directory (tenant) ID**.
3. **API permissions → Add → Microsoft Graph → Application permissions → Mail.Send → Grant admin consent.**
4. **Certificates & secrets → New client secret** (24 months). Copy the value. Put a reminder on the calendar to renew it.
5. Lock the app to just the mailboxes it may send from. In Exchange Online PowerShell, make a mail-enabled security group "Portal senders" containing `portal@`, Jana, and anyone else who may be a client's contact, then:
   ```powershell
   New-ApplicationAccessPolicy -AppId <client-id> -PolicyScopeGroupId portal-senders@newvistaent.com -AccessRight RestrictAccess -Description "NVE portal can send only as these"
   ```
   Welcome emails go out **from the contact's own mailbox** (e.g. Jana's), so the client's reply lands in her inbox and the email shows in her Sent Items. If that mailbox isn't allowed, it falls back to `portal@` with Jana as the reply-to.

## 6. Get the API keys

* **Aspire:** an Aspire admin creates API credentials (an API user with read access) in Aspire's administration settings and copies the **Client ID** and **Secret**. If you can't find the option, ask your Aspire rep to turn on API access for your account.
* **CompanyCam:** create an API access token in CompanyCam's settings (an admin can do this; CompanyCam support can point to it). In CompanyCam, create the tag **Client** (crews tag the photos clients should see).

## 7. Store the secrets in Supabase

Copy `supabase/.env.example` to `supabase/.env`, fill it in, and run (Supabase CLI, see step 8):

```bash
supabase secrets set --env-file supabase/.env --project-ref <your-project-ref>
```

Or enter each one under **Edge Functions → Secrets** in the dashboard.

| Name | What to put |
|---|---|
| `SITE_URL` | `https://portal.newvistaent.com` |
| `SITE_ORIGINS` | same as above (comma-separate if more than one) |
| `STAFF_CODE` | the team code for the lead form; change it anytime someone leaves |
| `SYNC_SECRET` | long random text (also goes in step 10) |
| `ASPIRE_CLIENT_ID`, `ASPIRE_SECRET` | from step 6 |
| `COMPANYCAM_TOKEN` | from step 6 |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | from step 5 |
| `MAIL_FROM` | `portal@newvistaent.com` |
| `SEND_EMAIL_HOOK_SECRET` | from step 9 |

## 8. Deploy the server functions

Easiest: install the Supabase CLI (`brew install supabase/tap/supabase` on Mac, or see supabase.com/docs/guides/cli), then from this folder:

```bash
supabase login
supabase functions deploy --project-ref <your-project-ref>
```

To deploy automatically after this, add two repository secrets in GitHub (**Settings → Secrets and variables → Actions**): `SUPABASE_ACCESS_TOKEN` (supabase.com → Account → Access Tokens) and `SUPABASE_PROJECT_REF`.

## 9. Sign-in settings

Supabase → **Authentication**:

1. **Sign In / Providers → Email:** keep Email on. **Turn off "Allow new users to sign up"** (only people you add can sign in).
2. **URL Configuration:** Site URL `https://portal.newvistaent.com`. Redirect URLs: add `https://portal.newvistaent.com/**`.
3. **Email OTP expiration:** 3600 seconds (1 hour) is a good balance. Welcome links expire too; when a client clicks an old one, the portal shows "Welcome back… For your safety, enter your email and we'll send a fresh link."
4. **Sessions:** set "Time-box user sessions" to about 30 days, so clients stay signed in on their phone for a month.
5. **Hooks → Send Email Hook → HTTPS** → URL `https://<project-ref>.supabase.co/functions/v1/auth-email-hook` → **Generate secret** → copy it into the `SEND_EMAIL_HOOK_SECRET` secret (step 7). Now every sign-in email is a New Vista email from Microsoft 365.

## 10. Check Aspire every 15 minutes

SQL Editor → paste `supabase/cron.sql`, replace `<PROJECT-REF>` and `<SYNC_SECRET>`, Run. The first run only looks back one day, so old jobs don't flood in ("new wins only").

## 11. Try it end to end

1. Jana opens `/admin/`, enters her email, clicks the link. Under **Team**, add everyone (work email, title, phone; tick who appears on the lead form and who can own accounts). Under **Settings**, replace the sample **Lead sources** with Aspire's exact list and confirm the branch name in **Aspire branches that get a portal** matches Aspire exactly.
2. Open `/lead/` on a phone, enter the team code, submit a test lead. Jana gets a short alert (no client details) and sees it under **New Leads**.
3. In Aspire, mark a test New Vista opportunity **Won** (use a test property with your own email as the primary contact). Within 15 minutes, or right away with **Check Aspire now**, it appears under **Client Portals**. Open it, pick a cover, then **Preview as the client**, then **Approve & send**.
4. Open the welcome email, click **Open my project**, and check each tab. Post an update from `/post/`.

## 12. Link it from WordPress

Add a menu item or button on newvistaent.com:
* Staff menu or intranet page: "New lead" → `https://portal.newvistaent.com/lead/`
* Client-facing (optional): "Client login" → `https://portal.newvistaent.com/portal/`

On each staff phone, open the lead form and **Add to Home Screen**.

---

## Things to confirm on the first live run

These are written from Aspire's and CompanyCam's published API references but can't be tested without your keys. If something comes up empty, it's almost always one line in `supabase/functions/_shared/aspire.ts` or `companycam.ts`:

* **Aspire date filter** (`WonDate ge 2026-11-10`). If Aspire wants a different date format, adjust `wonSince()`.
* **Aspire paging** (`$limit`/`$pageNumber`) and the **AttachmentFileData** download.
* **CompanyCam tag filter.** The code double-checks each photo's tags, so it works either way, but it's slower on projects with many photos.
* **Aspire data rules:** the portal reads Aspire live each time and doesn't store Aspire data, which keeps it within Aspire's API terms.

## Fonts

`web/assets/fonts` holds the brand fonts, Criteria CF and Cartograph CF, which are cleared for web use. Every page loads them from there. Leave that folder in place.

## Day-to-day (for Jana)

* **New lead alert** → Admin → New Leads → enter it in Aspire (**Copy all** helps) → **Mark as entered**.
* **New portal alert** → Admin → Client Portals → open it → check the yellow note, cover, people → **Approve & send**.
* Add a spouse later → open the portal → **Add a person** → **Send invite**.
* Hide an update, invoice, file or photo → open the portal → switch it off.
* Job finished → **Archive**.
