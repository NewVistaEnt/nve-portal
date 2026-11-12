// Helpers shared by the portal functions.
import { admin, env } from "./util.ts";

export async function ensureUser(email: string) {
  const db = admin();
  const { error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error && !/already|registered|exists/i.test(error.message)) throw error;
}

export async function coverUrl(cover: string | null, seconds = 60 * 60 * 24 * 30) {
  if (!cover) return null;
  if (/^https?:\/\//.test(cover)) return cover;
  if (cover.startsWith("lib:")) return `${env("SITE_URL")}/assets/covers/${cover.slice(4)}`;
  const { data } = await admin().storage.from("portal-media").createSignedUrl(cover, seconds);
  return data?.signedUrl ?? null;
}
