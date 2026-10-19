---
'@endora-commerce/mod-seo': patch
---

`GET /api/v1/storefront/seo/crawler-files` declares `salesChannelAccess: 'open'`, so a sales
channel closed to anonymous visitors still answers it, and the answer carries the channel's
`anonymousAccess`. A storefront uses it to keep serving `robots.txt` and `llms.txt` on such a
store: `robots.txt` disallows everything for every crawler and names no sitemap, and `llms.txt`
names the store and says its content is for signed-in customers only. The custom `robots.txt`
instructions and the additional `llms.txt` content are not served on a closed store; they are
kept and return when the store is opened again. An open store's answer is unchanged apart from
the new member.
