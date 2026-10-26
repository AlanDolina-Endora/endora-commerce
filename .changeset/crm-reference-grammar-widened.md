---
'@endora-commerce/mod-crm': patch
---

An Opportunity's description, notes and messages read the two reference types the shared
grammar gained — `[[quote_request:<uuid>]]` and `[[task:<uuid>]]` — and show each as an
unavailable reference ("Quote request unavailable", "Task unavailable"). They are not stored
among the Opportunity's references yet and nothing inserts them; before, the same characters
were plain text. Every reference CRM inserts, stores and resolves today is unchanged.
