#!/usr/bin/env node
// Migrate WordPress WXR export → Astro content collections.
//
// Reads a WXR file, writes:
//   - src/content/blog/<slug>.md      (one file per post)
//   - src/content/pages/<slug>.md     (one file per page)
//   - public/images/posts/<slug>/...  (downloaded images)
//   - public/images/pages/<slug>/...
//   - MIGRATION.md                    (per-item log of TODOs + skipped content)
//   - astro-redirects.generated.json  (slug-changed redirect entries for astro.config.mjs)
//
// Default policy (matches what the user approved):
//   - All status="publish" posts -> Migrate (draft: false)
//   - All status="draft" posts   -> Archive (draft: true)
//   - All status="publish" pages -> Migrate
//
// Re-running OVERWRITES generated markdown files. Don't re-run after manual edits.
//
// Usage: node scripts/migrate.mjs <path-to.wxr.xml>

import { readFileSync, writeFileSync, mkdirSync, existsSync, createWriteStream } from "node:fs";
import { dirname, join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { XMLParser } from "fast-xml-parser";
import TurndownService from "turndown";
import { gfm, tables, strikethrough } from "turndown-plugin-gfm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const wxrPath = process.argv[2];
if (!wxrPath) {
  console.error("Usage: node scripts/migrate.mjs <path-to.wxr.xml>");
  process.exit(1);
}

// =====================================================================
// Helpers
// =====================================================================

const cd = (v) => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && "__cdata" in v) return v.__cdata ?? "";
  if (typeof v === "object" && "#text" in v) return v["#text"] ?? "";
  return String(v);
};

const decodeEntities = (s) => {
  if (!s) return s;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "…")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, "”")
    .replace(/&ldquo;/g, "“")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
};

const slugify = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/[‘’“”]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";

const ensureDir = (p) => mkdirSync(p, { recursive: true });

const yamlQuoteString = (s) => {
  // Use double-quoted YAML with JSON-style escaping. Safest for arbitrary titles.
  const json = JSON.stringify(s);
  return json;
};

const yamlFrontmatter = (obj) => {
  const lines = ["---"];
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === "boolean" || typeof v === "number") {
      lines.push(`${k}: ${v}`);
    } else if (v instanceof Date) {
      lines.push(`${k}: ${v.toISOString().slice(0, 10)}`);
    } else if (Array.isArray(v)) {
      if (v.length === 0) {
        lines.push(`${k}: []`);
      } else if (v.length <= 3 && v.every((x) => typeof x === "string" && !/[:,#\[\]]/.test(x))) {
        lines.push(`${k}: [${v.map((x) => yamlQuoteString(x)).join(", ")}]`);
      } else {
        lines.push(`${k}:`);
        for (const x of v) lines.push(`  - ${yamlQuoteString(String(x))}`);
      }
    } else {
      lines.push(`${k}: ${yamlQuoteString(String(v))}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
};

// =====================================================================
// Parse WXR
// =====================================================================

const xml = readFileSync(wxrPath, "utf8");
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  cdataPropName: "__cdata",
  isArray: (name) => ["item", "category", "wp:postmeta"].includes(name),
  trimValues: false,
});
const parsed = parser.parse(xml);
const items = parsed?.rss?.channel?.item ?? [];

// Build attachment map: post_id -> { url, filename }
const attachmentById = new Map();
for (const it of items) {
  if (cd(it["wp:post_type"]) !== "attachment") continue;
  const id = String(cd(it["wp:post_id"]) || "");
  const url = cd(it["wp:attachment_url"]) || cd(it.guid);
  if (id && url) attachmentById.set(id, { url, filename: basename(new URL(url).pathname) });
}

// =====================================================================
// HTML content pre-processing (before turndown)
// =====================================================================

const stripGutenbergBlockComments = (html) =>
  html.replace(/<!--\s*\/?wp:[^>]*-->/g, "");

const convertCaptionShortcodes = (html) => {
  // [caption ...]<img .../> Caption text[/caption]
  return html.replace(
    /\[caption[^\]]*\]([\s\S]*?)\[\/caption\]/g,
    (_, inner) => {
      // inner contains an <img> followed by caption text
      const imgMatch = inner.match(/<img\b[^>]*>/i);
      const img = imgMatch ? imgMatch[0] : "";
      const caption = inner.replace(/<img\b[^>]*>/i, "").replace(/^\s*<a[^>]*>|<\/a>\s*$/g, "").trim();
      if (!img) return inner;
      return `<figure>${img}${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`;
    }
  );
};

const stripShortcodesUltimate = (html, log) => {
  // [su_TAG ...]inner[/su_TAG] -> inner (with TODO marker)
  return html.replace(
    /\[(su_[a-z0-9_]+)(?:\s[^\]]*)?\]([\s\S]*?)\[\/\1\]/g,
    (_, tag, inner) => {
      log.add(`Shortcodes-Ultimate \`[${tag}]\` wrapper stripped; inner content preserved.`);
      return `<!-- TODO: was [${tag}] -->\n${inner}\n<!-- /TODO -->`;
    }
  );
};

const handleLogoCarousel = (html, log) => {
  return html.replace(/\[logocarousel[^\]]*\]/g, (m) => {
    log.add(`Logo carousel shortcode dropped: \`${m}\``);
    return `<!-- TODO: replace logo carousel — was \`${m}\` -->`;
  });
};

const stripRemainingShortcodes = (html, log) => {
  // Catch anything else of [foo ...] form that's clearly a shortcode (has =attr= or /]).
  return html
    .replace(/\[([a-zA-Z][a-zA-Z0-9_-]*)\s+[^\]]*=[^\]]*\/?\]/g, (m, tag) => {
      log.add(`Unhandled shortcode \`[${tag} ...]\` dropped: \`${m.slice(0, 80)}…\``);
      return `<!-- TODO: shortcode dropped: ${m.replace(/-->/g, "-- >")} -->`;
    })
    .replace(/\[\/([a-zA-Z][a-zA-Z0-9_-]*)\]/g, "");
};

const noteIframes = (html, log) => {
  const iframes = html.match(/<iframe\b[^>]*>/gi);
  if (iframes) {
    for (const f of iframes) {
      const src = f.match(/src=["']([^"']+)["']/i)?.[1];
      log.add(`iframe preserved as raw HTML${src ? ` — src: ${src}` : ""}`);
    }
  }
  return html;
};

const noteScripts = (html, log) => {
  const scripts = html.match(/<script\b[\s\S]*?<\/script>/gi);
  if (scripts) {
    for (const s of scripts) log.add(`<script> stripped (${s.length} chars)`);
    return html.replace(/<script\b[\s\S]*?<\/script>/gi, "<!-- TODO: <script> stripped -->");
  }
  return html;
};

const noteStyles = (html, log) => {
  const styles = html.match(/<style\b[\s\S]*?<\/style>/gi);
  if (styles) {
    for (const s of styles) log.add(`<style> stripped (${s.length} chars)`);
    return html.replace(/<style\b[\s\S]*?<\/style>/gi, "<!-- TODO: <style> stripped -->");
  }
  return html;
};

// =====================================================================
// Image download + URL rewrite
// =====================================================================

const downloadCache = new Map(); // url -> { ok, localPath?, error? }

const safeFilename = (url) => {
  try {
    const u = new URL(url);
    let f = basename(u.pathname) || "file";
    // strip query
    f = f.replace(/[?#].*$/, "");
    if (!extname(f)) f += ".jpg"; // best guess
    return f.replace(/[^a-zA-Z0-9._-]/g, "_");
  } catch {
    return "file.jpg";
  }
};

async function downloadImage(url, destDir) {
  if (downloadCache.has(url)) return downloadCache.get(url);

  // Skip data: URIs
  if (url.startsWith("data:")) {
    const r = { ok: false, error: "data: URI not downloaded" };
    downloadCache.set(url, r);
    return r;
  }

  let absUrl;
  try {
    absUrl = new URL(url, "https://tomdehnel.com/").toString();
  } catch (e) {
    const r = { ok: false, error: `bad URL: ${e.message}` };
    downloadCache.set(url, r);
    return r;
  }

  const filename = safeFilename(absUrl);
  ensureDir(destDir);
  const localPath = join(destDir, filename);

  if (existsSync(localPath)) {
    const r = { ok: true, localPath, cached: "exists" };
    downloadCache.set(url, r);
    return r;
  }

  try {
    const res = await fetch(absUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Astro migration script)" },
      redirect: "follow",
    });
    if (!res.ok) {
      const r = { ok: false, error: `HTTP ${res.status}` };
      downloadCache.set(url, r);
      return r;
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) {
      const r = { ok: false, error: `not an image (content-type: ${ct})` };
      downloadCache.set(url, r);
      return r;
    }
    await pipeline(Readable.fromWeb(res.body), createWriteStream(localPath));
    const r = { ok: true, localPath };
    downloadCache.set(url, r);
    return r;
  } catch (e) {
    const r = { ok: false, error: e.message };
    downloadCache.set(url, r);
    return r;
  }
}

async function processImages(html, slug, kind, log) {
  // kind: "posts" | "pages"
  const destDir = join(ROOT, "public", "images", kind, slug);
  const publicBase = `/images/${kind}/${slug}`;

  const imgRe = /<img\b([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi;
  const matches = [...html.matchAll(imgRe)];
  let result = html;

  for (const m of matches) {
    const [full, pre, src, post] = m;
    const r = await downloadImage(src, destDir);
    if (r.ok) {
      const newSrc = `${publicBase}/${basename(r.localPath)}`;
      const replaced = `<img${pre}src="${newSrc}"${post}>`;
      result = result.split(full).join(replaced);
    } else {
      log.add(`Image download failed: ${src} (${r.error})`);
      // Leave src alone but add a comment after
      const annotated = `${full}<!-- TODO: broken/external image: ${src} (${r.error}) -->`;
      result = result.split(full).join(annotated);
    }
  }

  return result;
}

async function downloadHero(attachmentId, slug, kind, log) {
  if (!attachmentId) return null;
  const att = attachmentById.get(String(attachmentId));
  if (!att) {
    log.add(`Featured image attachment id ${attachmentId} not found in export`);
    return null;
  }
  const destDir = join(ROOT, "public", "images", kind, slug);
  const r = await downloadImage(att.url, destDir);
  if (!r.ok) {
    log.add(`Hero image download failed: ${att.url} (${r.error})`);
    return null;
  }
  return `/images/${kind}/${slug}/${basename(r.localPath)}`;
}

// =====================================================================
// Turndown setup
// =====================================================================

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
  strongDelimiter: "**",
  linkStyle: "inlined",
});
turndown.use([tables, strikethrough]);

// Preserve <figure>/<figcaption> as raw HTML (markdown can't express them).
turndown.keep(["figure", "figcaption", "iframe", "video", "audio"]);

// =====================================================================
// Excerpt fallback
// =====================================================================

const firstParagraphExcerpt = (markdown) => {
  const text = markdown
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/^#.*$/gm, "")
    .replace(/<[^>]+>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>]/g, "")
    .split(/\n\s*\n/)[0]
    ?.trim() || "";
  if (!text) return undefined;
  const words = text.split(/\s+/);
  return words.length > 35 ? words.slice(0, 35).join(" ") + "…" : text;
};

// =====================================================================
// Main loop
// =====================================================================

const migrationLog = []; // { kind, slug, title, original_url, notes[] }
const redirects = []; // { from, to }

const processItem = async (it) => {
  const type = cd(it["wp:post_type"]);
  if (type !== "post" && type !== "page") return;

  const status = cd(it["wp:status"]);
  if (status !== "publish" && status !== "draft") return;

  const title = decodeEntities(cd(it.title).trim());
  const rawSlug = cd(it["wp:post_name"]).trim();
  const slug = rawSlug ? decodeURIComponent(rawSlug).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/--+/g, "-") : slugify(title);
  const dateRaw = cd(it["wp:post_date"]).trim();
  const date = dateRaw ? dateRaw.split(" ")[0] : "";
  const link = cd(it.link).trim();
  let content = cd(it["content:encoded"]);
  const wpExcerpt = decodeEntities(cd(it["excerpt:encoded"]).trim());

  const notes = new Set();

  // ---- Tags (merge WP categories + post_tags, drop "Uncategorized") ----
  let tags = [];
  const categoryNodes = Array.isArray(it.category) ? it.category : it.category ? [it.category] : [];
  for (const c of categoryNodes) {
    const value = decodeEntities(cd(c)).trim();
    if (!value) continue;
    if (value.toLowerCase() === "uncategorized") continue;
    tags.push(value);
  }
  // dedupe case-insensitively, preserve first-seen casing
  const seen = new Set();
  tags = tags.filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // ---- Postmeta lookups (featured image) ----
  const postmeta = Array.isArray(it["wp:postmeta"]) ? it["wp:postmeta"] : [];
  let thumbnailId = null;
  for (const pm of postmeta) {
    const key = cd(pm["wp:meta_key"]);
    if (key === "_thumbnail_id") thumbnailId = cd(pm["wp:meta_value"]);
  }

  // ---- Content pre-processing ----
  content = stripGutenbergBlockComments(content);
  content = convertCaptionShortcodes(content);
  content = stripShortcodesUltimate(content, notes);
  content = handleLogoCarousel(content, notes);
  content = stripRemainingShortcodes(content, notes);
  content = noteScripts(content, notes);
  content = noteStyles(content, notes);
  content = noteIframes(content, notes);

  // ---- Image download + rewrite ----
  // Content collection dir uses "blog" for posts (matches src/content.config.ts).
  // Image public dir uses "posts" / "pages" (matches the plan's /images/posts/<slug>/ URL convention).
  const contentDir = type === "post" ? "blog" : "pages";
  const imageDir = type === "post" ? "posts" : "pages";
  content = await processImages(content, slug, imageDir, notes);

  // ---- Hero image ----
  const heroPath = await downloadHero(thumbnailId, slug, imageDir, notes);

  // ---- HTML -> Markdown ----
  // Run turndown only on a body that's not empty
  let body = "";
  if (content.trim()) {
    try {
      body = turndown.turndown(content);
    } catch (e) {
      notes.add(`turndown error: ${e.message} — body preserved as raw HTML`);
      body = content;
    }
  }
  // Trim excess blank lines
  body = body.replace(/\n{3,}/g, "\n\n").trim();

  // ---- Excerpt ----
  let excerpt = wpExcerpt || firstParagraphExcerpt(body);
  if (excerpt && excerpt.length > 280) excerpt = excerpt.slice(0, 277).trimEnd() + "…";

  // ---- Frontmatter ----
  const frontmatter = {
    title,
    ...(type === "post" ? { date } : {}),
    slug,
    ...(type === "post" ? { tags } : {}),
    ...(excerpt ? { excerpt } : {}),
    ...(heroPath ? { hero_image: heroPath } : {}),
    ...(type === "post" ? { draft: status === "draft" } : {}),
    ...(link ? { original_url: link } : {}),
  };

  // ---- Write file ----
  const outDir = join(ROOT, "src", "content", contentDir);
  ensureDir(outDir);
  const outPath = join(outDir, `${slug}.md`);
  writeFileSync(outPath, `${yamlFrontmatter(frontmatter)}\n\n${body}\n`);

  // ---- Redirects: only needed if the new URL differs from the old. ----
  // Our new URLs: /blog/<slug>/ for posts, /<slug>/ for pages.
  // Old WordPress URLs were typically /<slug>/ for both.
  // Pages keep the same URL. Posts move from /<slug>/ to /blog/<slug>/ — need redirect.
  if (type === "post" && link) {
    try {
      const u = new URL(link);
      const oldPath = u.pathname.replace(/\/+$/, "") || "/";
      const newPath = `/blog/${slug}`;
      if (oldPath !== newPath && oldPath !== "/") {
        redirects.push({ from: oldPath, to: newPath });
      }
    } catch {}
  }

  // ---- Log ----
  if (notes.size > 0 || status === "draft" || type === "page") {
    migrationLog.push({
      kind: type,
      status,
      slug,
      title,
      original_url: link,
      notes: [...notes],
    });
  }
};

// ----------------------------------------------------------------------

console.error(`Processing ${items.length} items from ${wxrPath}…`);
let count = 0;
for (const it of items) {
  await processItem(it);
  count++;
  if (count % 25 === 0) console.error(`  …${count}/${items.length}`);
}

// =====================================================================
// Write MIGRATION.md
// =====================================================================

let migDoc = `# Migration log\n\n`;
migDoc += `Source: ${wxrPath}\n`;
migDoc += `Generated: ${new Date().toISOString()}\n\n`;
migDoc += `Policy applied: published posts and pages migrated, draft posts archived with \`draft: true\`.\n\n`;
migDoc += `**Warning:** re-running \`scripts/migrate.mjs\` will overwrite the generated markdown files. Do not re-run after manual edits.\n\n`;

const withNotes = migrationLog.filter((e) => e.notes.length > 0);
const drafts = migrationLog.filter((e) => e.status === "draft");
const pages = migrationLog.filter((e) => e.kind === "page");

migDoc += `## Summary\n\n`;
migDoc += `- Items written: ${migrationLog.length === 0 ? "see content dirs (no per-item issues)" : migrationLog.length} logged here\n`;
migDoc += `- Items with cleanup TODOs: ${withNotes.length}\n`;
migDoc += `- Drafts archived: ${drafts.length}\n`;
migDoc += `- Pages: ${pages.length}\n\n`;

if (withNotes.length > 0) {
  migDoc += `## Items needing manual review\n\n`;
  for (const e of withNotes) {
    migDoc += `### ${e.title}\n`;
    migDoc += `- Type: ${e.kind} (${e.status})\n`;
    migDoc += `- File: \`src/content/${e.kind === "post" ? "blog" : "pages"}/${e.slug}.md\`\n`;
    if (e.original_url) migDoc += `- Original: ${e.original_url}\n`;
    migDoc += `- Notes:\n`;
    for (const n of e.notes) migDoc += `  - ${n}\n`;
    migDoc += `\n`;
  }
}

if (drafts.length > 0) {
  migDoc += `## Drafts archived (\`draft: true\`)\n\n`;
  for (const e of drafts) {
    migDoc += `- \`${e.slug}\` — ${e.title}\n`;
  }
  migDoc += `\n`;
}

writeFileSync(join(ROOT, "MIGRATION.md"), migDoc);

// =====================================================================
// Write redirects for astro.config.mjs
// =====================================================================

const dedup = new Map();
for (const r of redirects) dedup.set(r.from, r.to);
const redirectsObj = Object.fromEntries(dedup);
writeFileSync(
  join(ROOT, "astro-redirects.generated.json"),
  JSON.stringify(redirectsObj, null, 2) + "\n"
);

// =====================================================================
// Done
// =====================================================================

console.error("");
console.error(`Done.`);
console.error(`  Items processed: ${count}`);
console.error(`  Items logged in MIGRATION.md: ${migrationLog.length}`);
console.error(`  Images cached: ${downloadCache.size}`);
const failed = [...downloadCache.values()].filter((r) => !r.ok).length;
console.error(`  Image download failures: ${failed}`);
console.error(`  Redirects: ${dedup.size}`);
