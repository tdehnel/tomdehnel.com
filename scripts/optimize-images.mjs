#!/usr/bin/env node
// In-place image optimizer for public/images/.
//
// For every PNG / JPG / JPEG / WebP under public/images/:
//   - resize to max 1600px wide (preserves aspect ratio; no upscaling)
//   - re-encode with a quality preset
//   - skip if the optimized version would be larger than the original
//
// Filenames stay the same so existing markdown references still work.
// Safe to re-run — operations are idempotent within a few percent.
//
// Usage: node scripts/optimize-images.mjs [--dry-run]

import { readdirSync, statSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const IMG_DIR = join(ROOT, "public", "images");

const dryRun = process.argv.includes("--dry-run");
const MAX_WIDTH = 1600;

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
};

const isImage = (p) => /\.(png|jpe?g|webp)$/i.test(p);

const fmt = (n) => (n / 1024).toFixed(1) + " KB";

const optimize = async (path) => {
  const ext = extname(path).toLowerCase();
  const original = readFileSync(path);
  const originalSize = original.length;

  let pipe = sharp(original, { failOn: "none" }).resize({
    width: MAX_WIDTH,
    withoutEnlargement: true,
    fit: "inside",
  });

  if (ext === ".png") {
    pipe = pipe.png({ compressionLevel: 9, palette: true, quality: 80, effort: 8 });
  } else if (ext === ".jpg" || ext === ".jpeg") {
    pipe = pipe.jpeg({ quality: 82, mozjpeg: true });
  } else if (ext === ".webp") {
    pipe = pipe.webp({ quality: 82, effort: 6 });
  }

  let optimized;
  try {
    optimized = await pipe.toBuffer();
  } catch (e) {
    return { path, status: "error", error: e.message };
  }

  if (optimized.length >= originalSize) {
    return { path, status: "skip-larger", from: originalSize, to: optimized.length };
  }

  if (!dryRun) writeFileSync(path, optimized);
  return { path, status: "ok", from: originalSize, to: optimized.length };
};

const files = walk(IMG_DIR).filter(isImage);
console.error(`Found ${files.length} images. ${dryRun ? "Dry run." : ""}`);

let totalBefore = 0;
let totalAfter = 0;
let optimized = 0;
let skipped = 0;
let errored = 0;

for (const f of files) {
  const r = await optimize(f);
  if (r.status === "ok") {
    optimized++;
    totalBefore += r.from;
    totalAfter += r.to;
    console.error(`  ✓ ${f.replace(ROOT + "/", "")}: ${fmt(r.from)} → ${fmt(r.to)}`);
  } else if (r.status === "skip-larger") {
    skipped++;
    totalBefore += r.from;
    totalAfter += r.from;
  } else {
    errored++;
    console.error(`  ✗ ${f}: ${r.error}`);
  }
}

console.error("");
console.error(`Done. ${optimized} optimized, ${skipped} skipped (already small), ${errored} errors.`);
console.error(`Total: ${fmt(totalBefore)} → ${fmt(totalAfter)} (${((1 - totalAfter / totalBefore) * 100).toFixed(1)}% smaller)`);
