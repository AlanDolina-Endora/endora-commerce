---
'@endora-commerce/admin-kit': patch
---

`AuthProvider` picks up what a federated sign-in leaves in the address when it returns to the Admin UI: `#mfa-challenge=<id>` opens the two-step verification form exactly as after the password step, and `/login?error=<sentence>` shows that sentence on the sign-in form (it was not shown before). Both are removed from the address bar once read. A pending challenge and that sentence survive the initial `/admin/me` check answering `401`.
