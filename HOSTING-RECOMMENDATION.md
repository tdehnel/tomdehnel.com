# Hosting recommendation

**Recommendation: Cloudflare Pages.** Strongly.

## The decisive fact: DNS for tomdehnel.com is already on Cloudflare

```
NS:   molly.ns.cloudflare.com.
NS:   norman.ns.cloudflare.com.
A:    104.21.79.20      (Cloudflare anycast)
A:    172.67.140.34     (Cloudflare anycast)
AAAA: 2606:4700:3030::6815:4f14
AAAA: 2606:4700:3031::ac43:8c22
TTL:  300
MX:   0 mail.tomdehnel.com.
TXT:  v=spf1 a mx include:websitewelcome.com ~all
TXT:  google-site-verification=4otxGgduEyAmikVPrclF9dt8FMXk7QAD9VNC9ufDHVM
```

Cloudflare is currently *proxying* tomdehnel.com to HostGator (orange-cloud). HTTP responses show `server: cloudflare` and `cf-ray` headers. This means:

- You already have a Cloudflare account and an active zone for tomdehnel.com
- The cutover from HostGator → Cloudflare Pages is **purely a Cloudflare dashboard change**, not a registrar change
- DNS TTL is already 300 — no pre-cutover TTL lowering needed
- MX and SPF/TXT records stay untouched, so **email continues working** without any change

## Why Cloudflare Pages wins here

| Factor | Cloudflare Pages | HostGator (current) |
|---|---|---|
| Already integrated with your stack | Yes (zone + proxy already live) | Yes (legacy) |
| Push-to-deploy from GitHub | Native, free | cPanel Git VC if installed, or manual rsync |
| Build environment | Managed Node, always current | Whatever shared-hosting Node is, often old |
| TLS / CDN / DDoS | Built in | Manual via Cloudflare (already in place) |
| Cost | $0 for this site's scale | Existing HostGator bill |
| Moving parts | One (Pages = origin) | Two (HostGator origin + Cloudflare proxy) |
| Decap CMS GitHub OAuth | One Pages Function in same project | Need external OAuth proxy host |

The only argument for keeping HostGator would be wanting to preserve an existing server-side process (PHP scripts, cron jobs, mail). Mail is on `mail.tomdehnel.com` (MX) and is independent of where the website is served, so it stays untouched either way.

## Side findings worth knowing

1. **WP REST API is blocked by Mod_Security at the HostGator origin.** Requests to `https://tomdehnel.com/wp-json/wp/v2/posts` return HTTP 406. So Step 2 (content audit) cannot use the REST API — we'll need the WXR export from `WP Admin → Tools → Export → All content`.

2. **`gh` CLI is not installed locally.** Either install it (`brew install gh`, then `gh auth login`) or create the empty `tomdehnel/tomdehnel.com` GitHub repo manually before Step 4. Either works.

3. **Local Node is v24.14.0** — well above the Astro requirement. Local builds and the migration script will run fine.

4. **HostGator SSH inspection — not needed for this decision.** If we go Cloudflare Pages, HostGator's Node version / cPanel Git availability is irrelevant. If you ever want to keep HostGator as a documented fallback, I can do the SSH check later; just say the word and share creds.

## What this changes about the plan

- `Step 1` reduces to: produce this doc + `DNS-CUTOVER.md`, then stop for approval.
- `Step 5` (Decap auth): the **Cloudflare Pages Function as OAuth proxy** option is the obvious default. Same project, same account, ~50 lines of code.
- Cutover risk: very low. Two records change in Cloudflare DNS; MX and SPF stay. Rollback is one click.
