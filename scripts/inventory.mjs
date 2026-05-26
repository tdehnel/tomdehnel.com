#!/usr/bin/env node
// Parse a WXR (WordPress eXtended RSS) export and emit a Markdown inventory
// of posts and pages with cleanup flags. Read-only; produces stdout.
//
// Usage: node scripts/inventory.mjs <path-to.wxr.xml>

import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";

const wxrPath = process.argv[2];
if (!wxrPath) {
  console.error("Usage: node scripts/inventory.mjs <path-to.wxr.xml>");
  process.exit(1);
}

const xml = readFileSync(wxrPath, "utf8");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  cdataPropName: "__cdata",
  // Keep things as arrays predictably
  isArray: (name) => ["item", "category", "wp:postmeta"].includes(name),
  // Preserve whitespace inside content
  trimValues: false,
});

const parsed = parser.parse(xml);
const items = parsed?.rss?.channel?.item ?? [];

// Helpers ---------------------------------------------------------------

const cd = (v) => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && "__cdata" in v) return v.__cdata ?? "";
  if (typeof v === "object" && "#text" in v) return v["#text"] ?? "";
  return String(v);
};

const scanContent = (html) => {
  const flags = new Set();
  if (!html) return [];

  // WordPress shortcodes — tight heuristic to avoid markdown-link false positives.
  // Match either:
  //   [tag ...=...] form (with attribute syntax — distinctive of shortcodes)
  //   [/tag] closing form (always a shortcode)
  // Plus a known-shortcode-name allowlist for self-closing tags with no attrs.
  const shortcodes = new Set();
  let m;
  const knownShortcodes = new Set([
    "caption", "gallery", "embed", "audio", "video", "playlist", "wp_caption",
    "logocarousel", "logo_carousel",
  ]);
  // [tag attr=val ...] — has = inside
  const attrRe = /\[([a-zA-Z][a-zA-Z0-9_-]*)\s+[^\]]*=[^\]]*\]/g;
  while ((m = attrRe.exec(html))) shortcodes.add(m[1].toLowerCase());
  // [/tag]
  const closeRe = /\[\/([a-zA-Z][a-zA-Z0-9_-]*)\]/g;
  while ((m = closeRe.exec(html))) shortcodes.add(m[1].toLowerCase());
  // Standalone known shortcodes
  const standaloneRe = /\[([a-zA-Z][a-zA-Z0-9_-]*)\s*\/?\]/g;
  while ((m = standaloneRe.exec(html))) {
    const tag = m[1].toLowerCase();
    if (knownShortcodes.has(tag) || tag.startsWith("su_") || tag.startsWith("vc_") || tag.startsWith("et_pb_") || tag.startsWith("sp_")) {
      shortcodes.add(tag);
    }
  }
  if (shortcodes.size) flags.add(`shortcodes:${[...shortcodes].join(",")}`);

  // iframes
  if (/<iframe\b/i.test(html)) flags.add("iframe");

  // <script>
  if (/<script\b/i.test(html)) flags.add("script");

  // <style>
  if (/<style\b/i.test(html)) flags.add("style");

  // <table> — markdown tables are doable but worth flagging
  if (/<table\b/i.test(html)) flags.add("table");

  // Gutenberg block comments (handled by turndown via wp:postmeta block, but flag complex ones)
  const gutenbergBlocks = new Set();
  const blockRe = /<!--\s*wp:([a-zA-Z0-9/_-]+)\s/g;
  while ((m = blockRe.exec(html))) {
    const block = m[1].toLowerCase();
    // These are the safe blocks turndown + a small post-pass can handle
    const easy = new Set([
      "paragraph", "heading", "list", "list-item", "quote", "image", "html",
      "separator", "code", "preformatted", "spacer",
    ]);
    if (!easy.has(block)) gutenbergBlocks.add(block);
  }
  if (gutenbergBlocks.size) flags.add(`gutenberg:${[...gutenbergBlocks].join(",")}`);

  // External image hosts (other than tomdehnel.com) -- worth knowing
  const imgRe = /<img\b[^>]+src=["']([^"']+)["']/gi;
  const externalImgHosts = new Set();
  while ((m = imgRe.exec(html))) {
    const src = m[1];
    try {
      const u = new URL(src, "https://tomdehnel.com/");
      if (u.hostname && u.hostname !== "tomdehnel.com" && u.hostname !== "www.tomdehnel.com") {
        externalImgHosts.add(u.hostname);
      }
    } catch {}
  }
  if (externalImgHosts.size) flags.add(`ext-img:${[...externalImgHosts].join(",")}`);

  // Count of images for sense of post weight
  const imgCount = (html.match(/<img\b/gi) || []).length;
  if (imgCount > 0) flags.add(`images:${imgCount}`);

  // Detect raw <a> with javascript: or mailto: — note only the unusual
  if (/href=["']javascript:/i.test(html)) flags.add("javascript-href");

  // Approximate word count for sense of post weight
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const words = text ? text.split(" ").length : 0;
  flags.add(`words:${words}`);

  return [...flags];
};

// Categorize -------------------------------------------------------------

const rows = [];

for (const item of items) {
  const type = cd(item["wp:post_type"]);
  if (type !== "post" && type !== "page") continue;

  const status = cd(item["wp:status"]);
  const title = cd(item.title).trim();
  const slug = cd(item["wp:post_name"]).trim();
  const dateRaw = cd(item["wp:post_date"]).trim();
  const date = dateRaw ? dateRaw.split(" ")[0] : "";
  const link = cd(item.link).trim();
  const content = cd(item["content:encoded"]);
  const excerpt = cd(item["excerpt:encoded"]);

  // Categories / tags
  let cats = [];
  let tags = [];
  const categoryNodes = Array.isArray(item.category) ? item.category : (item.category ? [item.category] : []);
  for (const c of categoryNodes) {
    const domain = c?.["@_domain"];
    const value = cd(c);
    if (domain === "category") cats.push(value);
    else if (domain === "post_tag") tags.push(value);
  }

  const flags = scanContent(content);

  rows.push({
    type, status, date, slug, title, link,
    cats, tags,
    flags,
    contentLength: content.length,
    excerptLength: excerpt.length,
  });
}

// Sort posts by date desc, pages by title ---------------------------------

const posts = rows.filter((r) => r.type === "post").sort((a, b) => b.date.localeCompare(a.date));
const pages = rows.filter((r) => r.type === "page").sort((a, b) => a.title.localeCompare(b.title));

// Emit Markdown ----------------------------------------------------------

const fmtFlags = (arr) =>
  arr
    .filter((f) => !f.startsWith("words:") && !f.startsWith("images:"))
    .join("; ") || "—";

const meta = (r) => {
  const words = r.flags.find((f) => f.startsWith("words:"))?.slice(6) ?? "0";
  const images = r.flags.find((f) => f.startsWith("images:"))?.slice(7) ?? "0";
  return `${words} words${images !== "0" ? `, ${images} img` : ""}`;
};

let out = "";
out += `# Content migration inventory\n\n`;
out += `Source: ${wxrPath}\n\n`;
out += `Generated: ${new Date().toISOString()}\n\n`;

// Status summary
const statusCounts = (type) => {
  const r = rows.filter((x) => x.type === type);
  const counts = {};
  for (const item of r) counts[item.status] = (counts[item.status] || 0) + 1;
  return counts;
};
out += `## Summary\n\n`;
out += `- **Posts:** ${posts.length} total — ${JSON.stringify(statusCounts("post"))}\n`;
out += `- **Pages:** ${pages.length} total — ${JSON.stringify(statusCounts("page"))}\n\n`;

out += `## How to use this file\n\n`;
out += `For each row, add a **Decision** in the rightmost column: \`Migrate\`, \`Archive\` (keep in repo but not published), or \`Drop\` (do not carry over).\n\n`;
out += `Cleanup flags explained:\n`;
out += `- \`shortcodes:foo,bar\` — WP shortcodes that won't convert without a custom handler\n`;
out += `- \`iframe\` — embedded iframe (YouTube, Twitter, etc.) — needs manual replacement\n`;
out += `- \`script\` / \`style\` — inline JS/CSS — needs review\n`;
out += `- \`gutenberg:foo,bar\` — Gutenberg blocks beyond the easy set (paragraph, heading, list, image, quote, html, code, separator, spacer)\n`;
out += `- \`ext-img:host\` — images hosted off tomdehnel.com — will need to be downloaded or re-hosted\n`;
out += `- \`table\` — HTML table — convertible to markdown but worth a visual check\n\n`;

// Pages table
out += `## Pages (${pages.length})\n\n`;
out += `| Decision | Status | Slug | Title | Size | Cleanup flags |\n`;
out += `|---|---|---|---|---|---|\n`;
for (const r of pages) {
  out += `| ☐ | ${r.status} | \`${r.slug}\` | ${r.title || "—"} | ${meta(r)} | ${fmtFlags(r.flags)} |\n`;
}
out += `\n`;

// Posts table
out += `## Posts (${posts.length})\n\n`;
out += `| Decision | Status | Date | Slug | Title | Size | Cleanup flags |\n`;
out += `|---|---|---|---|---|---|---|\n`;
for (const r of posts) {
  out += `| ☐ | ${r.status} | ${r.date || "—"} | \`${r.slug}\` | ${r.title || "—"} | ${meta(r)} | ${fmtFlags(r.flags)} |\n`;
}
out += `\n`;

// Per-row appendix with original URL + categories/tags
out += `## Appendix: original URLs, categories, tags\n\n`;
for (const r of [...pages, ...posts]) {
  out += `### ${r.title || `(untitled — slug: ${r.slug})`}\n`;
  out += `- Type: ${r.type}\n`;
  out += `- Status: ${r.status}\n`;
  out += `- Slug: \`${r.slug}\`\n`;
  if (r.date) out += `- Date: ${r.date}\n`;
  if (r.link) out += `- Original URL: ${r.link}\n`;
  if (r.cats.length) out += `- Categories: ${r.cats.join(", ")}\n`;
  if (r.tags.length) out += `- Tags: ${r.tags.join(", ")}\n`;
  out += `- Body size: ${r.contentLength} chars, excerpt: ${r.excerptLength} chars\n`;
  out += `- All flags: ${r.flags.join("; ") || "—"}\n\n`;
}

process.stdout.write(out);
