---
'@endora-commerce/mod-email': patch
'@endora-commerce/mod-newsletter': patch
---

Raise `nodemailer` to `^10.1.4` (the lockfile resolves 10.2.1). This version tightens address parsing, strips credentials from a cross-origin redirect and caps the work one message can cause the mailer to do. The pool and content-stream behaviour changes in 10.1.0 do not apply here, because both modules build a plain, unpooled transport and send string bodies.
