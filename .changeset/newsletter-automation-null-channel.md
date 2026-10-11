---
'@endora-commerce/mod-newsletter': patch
---

Fix NewsletterAutomationService detail responses to include salesChannelId as null when no sales channel is assigned, including after a database reload.
