// Supabase calls this instead of sending its own sign-in emails, so every sign-in email
// is sent through Resend and looks like New Vista.
// Set up in Supabase: Authentication -> Hooks -> Send Email Hook -> HTTPS -> this function's URL.
import { Webhook } from "npm:standardwebhooks@1.0.0";
import { admin, env, esc } from "../_shared/util.ts";
import { brandedEmail, plainEmail, sendMail } from "../_shared/email.ts";

type Payload = {
  user: { email: string };
  email_data: { token: string; token_hash: string; redirect_to: string; email_action_type: string; site_url: string };
};

Deno.serve(async (req) => {
  const raw = await req.text();
  let p: Payload;
  try {
    const secret = env("SEND_EMAIL_HOOK_SECRET").replace(/^v1,whsec_/, "");
    p = new Webhook(secret).verify(raw, Object.fromEntries(req.headers)) as Payload;
  } catch {
    return new Response(JSON.stringify({ error: { http_code: 401, message: "Bad signature" } }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const { user, email_data: d } = p;
  const email = user.email.toLowerCase();
  // Link to our own page with the token in the address. The page only uses the token when the person
  // presses "Sign in", so email security scanners that open links can't use it up first.
  const target = new URL(d.redirect_to || env("SITE_URL"));
  target.searchParams.set("th", d.token_hash);
  target.searchParams.set("tt", d.email_action_type);
  const link = target.toString();

  try {
    const db = admin();
    const { data: staff } = await db.from("staff").select("name").ilike("email", email).eq("active", true).maybeSingle();
    if (staff) {
      await sendMail({
        to: email,
        subject: "Your New Vista sign-in link",
        html: plainEmail(
          [`Hi ${esc(staff.name.split(" ")[0])}, here's your sign-in link. It works once and expires soon.`, d.token ? `Or type this code: <b style="font-size:20px;letter-spacing:.15em">${esc(d.token)}</b>` : ""],
          { label: "Sign in", url: link },
          "Didn't ask for this? You can ignore it.",
        ),
      });
    } else {
      const { data: person } = await db.from("portal_people").select("name").ilike("email", email).limit(1).maybeSingle();
      const first = esc((person?.name ?? "").split(" ")[0] || "there");
      await sendMail({
        to: email,
        subject: "Your link to your New Vista project",
        html: brandedEmail({
          heading: `Welcome back, ${first}.`,
          paragraphs: [
            "It's been a while since you last signed in. For your safety, we've sent you a fresh link. Tap the button and you're in.",
            d.token ? `On a different device? Type this code instead: <b style="font-size:20px;letter-spacing:.15em;color:#1F2A20">${esc(d.token)}</b>` : "",
          ].filter(Boolean),
          button: { label: "Open my project", url: link },
          signoff: `<span style="color:#6B7468">This link works once and expires soon. Didn't ask for it? You can ignore this email.</span>`,
        }),
      });
    }
  } catch (e) {
    console.error("sign-in email failed", e);
    return new Response(JSON.stringify({ error: { http_code: 500, message: "Email could not be sent" } }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
});
