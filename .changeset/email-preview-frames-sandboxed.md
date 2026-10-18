---
'@endora-commerce/page-builder-admin': patch
'@endora-commerce/mod-newsletter': patch
---

E-mail HTML previews are drawn in sandboxed frames that do not run scripts: the e-mail editor's full preview and the newsletter campaign preview carry `sandbox=""`, and the e-mail editor's inline preview of an embedded block or template is drawn in a script-less frame sized to its content instead of being injected into the editor's document.
