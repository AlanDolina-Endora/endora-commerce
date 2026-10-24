---
'@endora-commerce/mod-catalog': patch
---

A price-sorted listing page on a cursor of a walk begun in the default order (no price order existed) is handed to the default listing before anything else is read: it no longer resolves the viewer's pricing context, the category tree or the search's attribute keys only to discard them, and issues exactly the statements the default listing's page does.
