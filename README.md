# tomdehnel.com

Source for the personal site at **https://tomdehnel.com** — Astro + Markdown + Decap CMS, deployed to Cloudflare Pages.

- See [`WHAT_THIS_DOES.txt`](./WHAT_THIS_DOES.txt) for a plain-language overview.
- See [`HOSTING-RECOMMENDATION.md`](./HOSTING-RECOMMENDATION.md) for why this stack.
- See [`DNS-CUTOVER.md`](./DNS-CUTOVER.md) for the procedure to point the live domain at this build.
- See [`MIGRATION.md`](./MIGRATION.md) for what came over from the old WordPress install and what didn't.

---

## Editing

### From any computer (desktop, laptop)

You can edit any post or page as plain Markdown with a text editor:

1. `git pull`
2. Edit a file under `src/content/blog/<slug>.md` (posts) or `src/content/pages/<slug>.md` (pages). Frontmatter at the top, Markdown below.
3. `git commit && git push`. Cloudflare Pages rebuilds in ~1 minute. Done.

To preview locally before pushing:

```bash
npm install        # once
npm run dev        # http://localhost:4321
```

Drafts (`draft: true`) are visible at their direct URL during dev and on the live site but are filtered out of `/blog`, the RSS feed, and tag pages.

### From a phone or any browser

1. Open <https://tomdehnel.com/admin/> in any browser, including mobile Safari.
2. Click **Login with GitHub** and authorize.
3. Pick **Blog posts** or **Pages**.
4. Edit, save (or save as a draft), publish. Decap commits to the repo and the site rebuilds.

Mobile CMS auth uses a GitHub OAuth popup. If a popup is blocked, allow popups for tomdehnel.com once.

### Adding a new post

Via CMS: hit `+ New Blog Post`, fill in the form, leave **Draft** ticked until ready. The CMS generates the filename and the URL slug from the title.

Via git:

```bash
# Replace 'my-new-post' with your slug.
cat > src/content/blog/my-new-post.md <<'EOF'
---
title: "My new post"
date: 2026-06-01
slug: my-new-post
tags: [seo]
excerpt: "One or two sentences for previews + meta description."
draft: true
---

Body content in Markdown.
EOF
```

Inline images: put files under `public/images/posts/<slug>/` and reference them as `/images/posts/<slug>/<filename>`.

### Adding a new page

Same idea, under `src/content/pages/<slug>.md`. URL becomes `/<slug>/`. To put it in the header nav, edit `src/components/Header.astro`.

---

## Deploys

Push to `main` → Cloudflare Pages auto-builds → live in ~1 minute.

`npm run build` runs `scripts/generate-cf-redirects.mjs` first (as `prebuild`), then `astro build`. Output is `dist/`.

### Rolling back a bad deploy

Two options, fastest first:

1. **Cloudflare dashboard → Pages → tomdehnel-com → Deployments → previous green build → "Rollback to this deployment".** No git change needed. ~5 seconds.
2. **`git revert <bad-commit-sha> && git push`** — the next deploy will rebuild from a known-good tree. Cleaner long-term but slower.

Avoid `git reset --hard origin/main && git push --force`. Pages keeps history of every deploy regardless, but force-pushing makes the local history harder to read.

---

## Project layout

```
.
├── astro.config.mjs          site URL, redirects, integrations, Tailwind
├── astro-redirects.generated.json  WP -> /blog/<slug> redirects (committed)
├── functions/
│   └── api/
│       ├── auth.ts           CMS OAuth: redirect to GitHub
│       └── callback.ts       CMS OAuth: exchange code for token
├── public/
│   ├── admin/                Decap CMS UI
│   │   ├── index.html
│   │   └── config.yml
│   ├── _redirects            Cloudflare real 301s (regenerated each build)
│   └── images/
│       ├── posts/<slug>/…    Per-post images, optimized
│       └── pages/<slug>/…    Per-page images, optimized
├── scripts/
│   ├── inventory.mjs                  one-shot WXR audit
│   ├── migrate.mjs                    one-shot WXR → Markdown migration
│   ├── optimize-images.mjs            resize+recompress public/images in place
│   └── generate-cf-redirects.mjs      writes public/_redirects (prebuild step)
└── src/
    ├── components/  Header, Footer, BaseHead, FormattedDate, HeaderLink
    ├── consts.ts    site title, description, BLOG_PAGE_SIZE
    ├── content/
    │   ├── blog/    posts
    │   └── pages/   pages
    ├── content.config.ts   Zod schemas for the two collections
    ├── layouts/
    │   ├── BlogPost.astro  post template (hero, date, tags, draft banner)
    │   └── PageLayout.astro
    ├── pages/       Astro routes (file-based)
    │   ├── 404.astro
    │   ├── index.astro
    │   ├── rss.xml.js
    │   ├── [slug].astro              pages
    │   └── blog/
    │       ├── index.astro           page 1
    │       ├── [slug].astro          individual posts
    │       ├── page/[page].astro     pages 2..N
    │       └── tag/[tag].astro       tag archive
    └── styles/global.css   Tailwind v4 + base typography
```

---

## One-time setup (before the first deploy)

These have to happen once, in this order. The first three were not yet done at the time this repo was created — do them before flipping DNS.

### 1. Create the GitHub repo

The repo is configured (in `public/admin/config.yml`) as `tomdehnel/tomdehnel.com`, public, branch `main`. Create that repo on GitHub (empty, no README), then:

```bash
git remote add origin git@github.com:tomdehnel/tomdehnel.com.git
git push -u origin main
```

### 2. Connect Cloudflare Pages

1. Cloudflare dashboard → Workers & Pages → Create application → Pages → Connect to Git.
2. Pick the `tomdehnel/tomdehnel.com` repo.
3. Build settings (most are auto-detected):
   - **Framework preset:** Astro
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** *(leave blank — repo root)*
   - **Functions directory:** `functions` (default)
4. **Save and Deploy.** First deploy takes 2–3 min.
5. Confirm the preview URL (`<project>.pages.dev`) loads with content.

### 3. Set up the GitHub OAuth app (for /admin)

1. <https://github.com/settings/developers> → OAuth Apps → New OAuth App.
   - **Application name:** `tomdehnel.com CMS`
   - **Homepage URL:** `https://tomdehnel.com`
   - **Authorization callback URL:** `https://tomdehnel.com/api/callback`
   - (During pre-cutover testing, use the Pages preview URL instead — e.g. `https://tomdehnel-com.pages.dev/api/callback` — and update later.)
2. Note the **Client ID**. Click **Generate a new client secret** and note that too.
3. Cloudflare dashboard → Pages → tomdehnel-com → Settings → Environment variables → Production:
   - `GITHUB_CLIENT_ID` = the client ID
   - `GITHUB_CLIENT_SECRET` = the client secret (mark as encrypted / secret)
4. Trigger a redeploy so the new env vars take effect.
5. Test `/admin/` end to end:
   - Open `/admin/` on a phone (mobile Safari).
   - Click **Login with GitHub** → authorize → popup closes → editor loads.
   - Create a draft post → save → confirm a commit appears in the repo.
   - Untick **Draft** → save → confirm the post appears at `/blog/<slug>/` after the rebuild.

### 4. Flip DNS

See [`DNS-CUTOVER.md`](./DNS-CUTOVER.md).

---

## Open TODOs (deferred per the rebuild prompt's Constraints)

- **No analytics.** Add later if wanted (Plausible, Cloudflare Web Analytics).
- **No newsletter signup.** None on the old site either; add later if wanted.
- **No comments.**
- **No contact form handler.** `/contact` currently links to LinkedIn. To add a real form, use a Cloudflare Pages Function (`functions/contact.ts`) posting to a transactional email API (Resend, Postmark, etc.).
- **Per-post manual cleanup.** See `MIGRATION.md` for the list of posts with `<!-- TODO -->` markers (mostly stripped shortcodes and external embeds).
