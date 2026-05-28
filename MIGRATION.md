# Migration log

WordPress → Astro migration record. Hand-written; not re-generated. Re-running `scripts/migrate.mjs` would overwrite this file — don't do that after content edits.

## What was migrated

Source: `tomdehnel.WordPress.2026-05-26 (1).xml` (WXR export, all content).

Decision policy applied (per the rebuild prompt's approved default):

- **All 44 published posts → migrated** to `src/content/blog/<slug>.md`, `draft: false`.
- **All 9 draft posts → archived** to `src/content/blog/<slug>.md`, `draft: true`. Visible at their direct URL with a draft banner; excluded from `/blog`, the RSS feed, tag archives, and the home page recent list.
- **All 7 published pages → migrated** to `src/content/pages/<slug>.md`.
- **1 page renamed:** `about-me` → `about`. Old URL `/about-me/` 301-redirects to `/about/`.
- **1 new page added:** `contact.md` (didn't exist on the WP site; LinkedIn link + form TODO).

## Images

- 122 inline + featured images downloaded to `public/images/{posts,pages}/<slug>/`.
- Bulk optimized in place by `scripts/optimize-images.mjs`: max 1600px wide, JPEG q82 mozjpeg, PNG palette+q80. Total size reduced from ~100 MB to ~21 MB.
- 3 image downloads failed (all on the `the-big-hit-sample-email` page — they were Google Docs drawing links from 2020 that now require auth). They remain as broken `<img>` tags with `<!-- TODO: broken/external image ... -->` markers next to them in the markdown.
- Hero images are referenced as string paths in frontmatter (not Astro `Image` components) so Decap CMS can manage them directly.

## URL changes & redirects

- Posts moved from WordPress `/<slug>/` to Astro `/blog/<slug>/`. 44 explicit redirects in `astro-redirects.generated.json` cover every migrated post.
- 1 manual redirect for the page rename (`/about-me/` → `/about/`) in `astro.config.mjs` and `scripts/generate-cf-redirects.mjs`.
- Both Astro's redirects config (HTML meta-refresh, works on any host) and Cloudflare's `_redirects` file (real 301s at the edge) are populated. Cloudflare wins when deployed to Pages.

## What didn't carry over

WordPress-specific scaffolding intentionally dropped:

- Plugins: SP Logo Carousel (the `[logocarousel]` shortcode on the SEO consulting page is now a `<!-- TODO -->` marker), Shortcodes Ultimate (`[su_box]`, `[su_accordion]`, `[su_spoiler]` on the backlinks post — outer wrappers stripped, inner content preserved).
- Gutenberg block comments (`<!-- wp:foo -->`) — stripped from all content.
- WP nav menus, custom CSS, custom post types (`sp_logo_carousel`, `sp_lc_shortcodes`, etc.) — not applicable in the new architecture.
- Comments — none on the live site to migrate.

## Per-post manual cleanup

A second pass cleaned up most of what the migration script flagged. Notes below are what's left vs. what's been done.

### `src/content/pages/seo-consulting.md` — Tom Dehnel - SEO Consultant — ✅ cleaned
- Logo carousel shortcode dropped (`[logocarousel id="631"]`). Replaced the dangling list intro with a one-line callout naming a few clients pulled from the testimonials (Okta, Current, Amplitude, Asurion). Edit it any time if you want a different list.

### `src/content/pages/the-big-hit-sample-email.md` — The Big Hit — ✅ cleaned
- 3 Google Docs drawing URLs returning HTTP 401. Removed the broken `<figure>` blocks entirely. The page is a 2020 newsletter sample so the missing header graphic isn't material.

### `src/content/blog/seo-value-of-backlinks.md` — SEO Value of Backlinks — ✅ cleaned
- Stripped Shortcodes Ultimate accordion/box/spoiler wrappers — the "Sources" section is now a flat list at the bottom with an explicit `## Sources` heading.
- Inline `<script>` tag stripped (left as an HTML comment by the migrator; no action needed).
- TOC anchor links updated to match Astro's auto-generated heading IDs (`#the-history-of-search-engines`, `#relevance`, `#other-link-value-metrics`, `#a-final-word`).
- Removed stray Grammarly `<g class="gr_...">` wrapper in one figcaption.
- Fixed broken `_wp_link_placeholder` href in the Google Search Algorithms reference.
- Twitter oEmbed converted to a plain "View tweet" link.

### `src/content/blog/best-pizza-in-san-francisco.md` — ✅ cleaned
- 2 YouTube oEmbeds converted to lazy `<iframe>` players (16:9 aspect, no JS).
- WordPress oEmbed (brokeassstuart.com) converted to a plain link — there's no static way to oEmbed a third-party WordPress post.

### `src/content/pages/videos.md` — ✅ cleaned
- 3 YouTube oEmbeds converted to lazy `<iframe>` players.

### Twitter embeds — ✅ cleaned
Converted to plain "View tweet" links on:
- `src/content/blog/seo-value-of-backlinks.md`
- `src/content/blog/crushing-the-myth-of-late-stage-capitalism.md`
- `src/content/blog/what-is-russell-conjugation.md`

### Posts with external images — ⚠️ no action needed, but worth knowing
These posts originally referenced images on third-party domains (`lh*.googleusercontent.com`, `cdn-images-1.medium.com`, `c1.sfdcstatic.com`). The migration downloaded all of them successfully (no `broken/external` markers remain in the content), so they're now local. If any of the upstream sources changed before download, the local files will be stale rather than 404 — visual spot-check welcome:
- `how-to-fix-broken-backlinks`
- `time-management-or-how-to-control-your-destiny-by-ignoring-slack-sometimes`
- `what-if-leadgen-were-more-like-a-conversation`
- `seo-value-of-backlinks`

## Drafts archived (draft: true)

- `life-as-a-ship-or-a-castle` — Life as a Ship or a Castle
- `consistency` — Consistency
- `learnology` — Learnology - The Science of How People Learn Things
- `top-words-you-can-use-to-build-credibility-with-tech-people` — Top words you can use to build credibility with tech people
- `the-liberal-paradox-of-assuming-everyone-is-awful` — The Liberal Paradox of Assuming Everyone is Awful
- `learning-how-to-think` — Learning how to think
- `everything-is-racist` — Everything is racist
- `the-reasons-why-empiricism-is-wrong` — The reasons why empiricism is wrong
- `why-your-smart-friend-voted-for-trump-even-though-he-probably-doesnt-talk-about-it` — Why your smart friend voted for Trump (even though he probably doesn't talk about it)
