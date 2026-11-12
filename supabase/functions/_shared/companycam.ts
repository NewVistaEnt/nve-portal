// Photos from CompanyCam: only photos tagged with the client tag (default "Client").
// Uses CompanyCam API v2 (https://api.companycam.com/v2) with an access token.
import { env } from "./util.ts";

const BASE = "https://api.companycam.com/v2";
const has = () => Boolean(Deno.env.get("COMPANYCAM_TOKEN"));

async function cc<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${env("COMPANYCAM_TOKEN")}`, Accept: "application/json" } });
  if (!r.ok) throw new Error(`CompanyCam ${path} failed (${r.status})`);
  return r.json();
}

type Photo = { id: string | number; captured_at?: number; description?: string; uris?: { type: string; uri?: string; url?: string }[] };

// Find the CompanyCam project for a street address (first match).
export async function findProject(addressLine1: string): Promise<string | null> {
  if (!has() || !addressLine1) return null;
  const rows = await cc<{ id: string | number }[]>(`/projects?query=${encodeURIComponent(addressLine1)}&per_page=5`);
  return rows[0] ? String(rows[0].id) : null;
}

let tagCache: { name: string; id: string | null; at: number } | null = null;
async function tagId(name: string): Promise<string | null> {
  if (tagCache && tagCache.name === name && Date.now() - tagCache.at < 3600_000) return tagCache.id;
  const tags = await cc<{ id: string | number; display_value?: string; value?: string }[]>(`/tags?per_page=200`);
  const t = tags.find((x) => (x.display_value ?? x.value ?? "").toLowerCase() === name.toLowerCase());
  tagCache = { name, id: t ? String(t.id) : null, at: Date.now() };
  return tagCache.id;
}

const pick = (p: Photo, type: string) => p.uris?.find((u) => u.type === type)?.uri ?? p.uris?.find((u) => u.type === type)?.url;

// Client-tagged photos for a project, newest first.
export async function clientPhotos(projectId: string, tagName: string) {
  if (!has() || !projectId) return [];
  const id = await tagId(tagName);
  if (!id) return [];
  let photos: Photo[] = [];
  try {
    photos = await cc<Photo[]>(`/projects/${projectId}/photos?per_page=100&tag_ids[]=${id}`);
  } catch {
    photos = [];
  }
  // If the tag filter is not honoured, check each photo's tags (capped at 60 photos).
  const verified: Photo[] = [];
  for (const p of photos.slice(0, 60)) {
    try {
      const t = await cc<{ id: string | number }[]>(`/photos/${p.id}/tags`);
      if (t.some((x) => String(x.id) === id)) verified.push(p);
    } catch { /* skip */ }
  }
  return verified
    .map((p) => ({ id: String(p.id), at: p.captured_at ? new Date(p.captured_at * 1000).toISOString() : null, caption: p.description ?? "", web: pick(p, "web") ?? pick(p, "original"), thumb: pick(p, "thumbnail") ?? pick(p, "web") }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
