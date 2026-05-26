# DNS cutover plan: HostGator → Cloudflare Pages

You execute this. I will not change DNS myself. This document is the operating manual.

---

## Current state (captured 2026-05-26)

Nameservers (at the registrar — do not change):
```
molly.ns.cloudflare.com.
norman.ns.cloudflare.com.
```

DNS records in the Cloudflare zone for tomdehnel.com:

| Type | Name | Value | Proxy | TTL | Purpose |
|------|------|-------|-------|-----|---------|
| A    | @ (tomdehnel.com) | 104.21.79.20 | Proxied (orange cloud) | Auto | website (currently proxying to HostGator origin) |
| A    | @ (tomdehnel.com) | 172.67.140.34 | Proxied | Auto | website |
| AAAA | @ | 2606:4700:3030::6815:4f14 | Proxied | Auto | website |
| AAAA | @ | 2606:4700:3031::ac43:8c22 | Proxied | Auto | website |
| (A or CNAME) | www | (resolves to same Cloudflare IPs) | Proxied | Auto | website |
| MX | @ | mail.tomdehnel.com (priority 0) | DNS only | Auto | **email — do not touch** |
| TXT | @ | v=spf1 a mx include:websitewelcome.com ~all | n/a | Auto | **SPF — do not touch** |
| TXT | @ | google-site-verification=4otxGgduEyAmikVPrclF9dt8FMXk7QAD9VNC9ufDHVM | n/a | Auto | Google verification — keep |

Note: the A and AAAA records currently show Cloudflare anycast IPs because the orange-cloud proxy is rewriting them at the edge. The "DNS content" in the Cloudflare dashboard for those records is actually the HostGator origin IP, not the Cloudflare IPs shown above. Confirm this in the Cloudflare dashboard before cutover.

## Target state (after cutover)

| Type | Name | Value | Proxy | Purpose |
|------|------|-------|-------|---------|
| CNAME | @ (tomdehnel.com) | `<project>.pages.dev` | Proxied | website on Cloudflare Pages |
| CNAME | www | `<project>.pages.dev` | Proxied | website on Cloudflare Pages |
| MX | @ | mail.tomdehnel.com (priority 0) | DNS only | **email — unchanged** |
| TXT | @ | v=spf1 a mx include:websitewelcome.com ~all | n/a | **SPF — unchanged** |
| TXT | @ | google-site-verification=4otxGgduEyAmikVPrclF9dt8FMXk7QAD9VNC9ufDHVM | n/a | Google verification — unchanged |

`<project>` is the Pages project name we'll set in Step 4 (likely `tomdehnel-com`, since Pages project names cannot contain dots).

## The actual cutover procedure

Cloudflare does the right thing automatically when you add a custom domain to a Pages project. You do not edit DNS records by hand. The procedure:

1. **Before:** Confirm the new site is fully built and the Pages preview URL (`<project>.pages.dev`) works end to end. Step 7 of the build plan blocks here.
2. **In Cloudflare dashboard → Pages → tomdehnel-com → Custom domains:**
   - Click "Set up a custom domain"
   - Enter `tomdehnel.com`
   - Cloudflare will detect the existing A/AAAA records pointing at HostGator and offer to **replace them with a CNAME to `<project>.pages.dev`**. Accept.
   - Repeat for `www.tomdehnel.com`.
3. **Cloudflare provisions a TLS certificate for both names automatically** (Universal SSL). Wait until it shows "Active" — usually under a minute, occasionally a few minutes.
4. **Verify:**
   - `dig tomdehnel.com A` and `dig www.tomdehnel.com A` still return Cloudflare anycast IPs (expected — proxy is on).
   - `curl -sI https://tomdehnel.com/` shows `server: cloudflare` and the new site loads in a browser.
   - `curl -sI https://tomdehnel.com/<some-migrated-post>/` returns 200.
   - Email still works: send yourself a test message at your tomdehnel.com address.

## Rollback

If anything misbehaves:

1. **Fastest rollback (under a minute):** Cloudflare dashboard → DNS → edit the two CNAMEs (`@` and `www`) and set their content back to the HostGator origin IP as A records. The HostGator origin is still live and serving WordPress until you decide to take it down.
2. **Alternative — pause Cloudflare proxy on those records (gray cloud)** — but only useful if the issue is the Cloudflare edge itself, which is rare.

Keep the WordPress install running on HostGator for at least 30 days after cutover. Do not cancel HostGator hosting until you're confident the new site is stable and you've confirmed email continues to flow.

## What does NOT change

- Nameservers at the registrar
- MX record (mail keeps working)
- SPF TXT record
- Google site-verification TXT record
- TLS — Cloudflare issues certificates automatically

## What the registrar does (nothing)

You don't need to log into the registrar for this cutover. All changes happen in the Cloudflare dashboard. The registrar only matters if you ever want to change *nameservers*, which you don't.

## Open items to fill in before cutover

- [ ] Final Cloudflare Pages project name (likely `tomdehnel-com`)
- [ ] List of canonical URLs that must 200 after cutover (spot-check list — built during Step 7)
- [ ] List of old URLs that 301 redirect (build during Step 3)
