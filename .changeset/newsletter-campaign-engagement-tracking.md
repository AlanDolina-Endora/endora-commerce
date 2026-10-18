---
'@endora-commerce/mod-newsletter': minor
'@endora-commerce/contracts': patch
---

Campaign e-mails carry open and click tracking. When a campaign is sent, each recipient's
message gets an invisible 1×1 image and its absolute `http(s)` links are routed through the
click redirect, each with a signed token bound to the recipient's send record, a link id
(`link-1`, `link-2`, … in document order) and the link's destination. `mailto:`, `tel:`, in-page
anchors, relative links and the module's own unsubscribe and confirmation links are left as they
are; the plain-text part is sent unchanged. The per-campaign opened and clicked counts and the
per-link clicks now reflect what recipients do.

The two public trackers take their token in the query string, because a signed token is longer
than the router's 100-character path-parameter limit and the path form was answered `414`
before reaching the handler:

- `GET /api/v1/newsletter/o/:token.gif` is now `GET /api/v1/newsletter/open.gif?token=<token>`
- `GET /api/v1/newsletter/c/:token?u=<url>` is now `GET /api/v1/newsletter/click?token=<token>&u=<url>`

The click redirect still leads only to the destination its token binds, sends a mismatching
destination to the storefront home page and answers an invalid or missing token `410`.

Two new settings in the Newsletter group, `newsletter.tracking.opens_enabled` and
`newsletter.tracking.clicks_enabled`, switch the two kinds of tracking independently. Both
default to on, can be set per sales channel, and are labelled in English and Polish on the
Settings screen. A campaign with `trackingEnabled: false` is sent without either. Automation
e-mails are not tracked. `NEWSLETTER_SETTING_CODES` in `@endora-commerce/contracts` gains
`TRACKING_OPENS_ENABLED` and `TRACKING_CLICKS_ENABLED`.
