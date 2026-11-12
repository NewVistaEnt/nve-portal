// Shared helpers for every function.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const env = (k: string, fallback?: string): string => {
  const v = Deno.env.get(k) ?? fallback;
  if (v === undefined) throw new Error(`Missing setting: ${k}`);
  return v;
};

// Pages are served from these addresses (comma-separated in SITE_ORIGINS).
const origins = () => (Deno.env.get("SITE_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function cors(req: Request): HeadersInit {
  const o = req.headers.get("origin") ?? "";
  const allowed = origins();
  return {
    "Access-Control-Allow-Origin": allowed.includes(o) ? o : (allowed[0] ?? "*"),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-staff-code",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

export const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

export const fail = (req: Request, message: string, status = 400) => json(req, { error: message }, status);

// Full-access client for server code (never sent to a browser).
export const admin = (): SupabaseClient =>
  createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

// Who is calling? Returns their verified email, or null.
export async function callerEmail(req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user?.email) return null;
  return data.user.email.toLowerCase();
}

export async function staffFor(email: string) {
  const { data } = await admin().from("staff").select("*").ilike("email", email).eq("active", true).maybeSingle();
  return data as null | { id: string; email: string; name: string; role: "admin" | "team"; title: string | null; phone: string | null };
}

export async function setting<T>(key: string): Promise<T | null> {
  const { data } = await admin().from("app_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? null;
}

export async function saveSetting(key: string, value: unknown) {
  await admin().from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

// Constant-time compare for the staff code.
export function sameText(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
