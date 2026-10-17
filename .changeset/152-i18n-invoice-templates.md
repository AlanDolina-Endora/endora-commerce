---
'@endora-commerce/mod-i18n': minor
---

The shared admin bundle drops the `invoiceTemplates.*` keys and `appShell.nav.invoiceTemplates`
(the invoice template screens moved to the `document_templates` module, which ships its own
strings), and relabels `adminRoles.permission.invoices:write` in English and Polish
(`specs/152-compare-pdf-template/`).
