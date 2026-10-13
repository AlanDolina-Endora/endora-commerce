---
'@endora-commerce/mod-cms': minor
---

The four CMS list screens are now reachable from the command palette (⌘K / CTRL+K): **CMS Pages**, **CMS Blocks**, **CMS Templates** and **CMS Hooks**, in English and Polish. Until now the palette offered only *New page*, so an operator could reach the lists through the sidebar alone.

Each entry opens its list screen (`/cms/pages`, `/cms/blocks`, `/cms/templates`, `/cms/hooks`), is shown only to a role holding `cms.read` — the code those screens enforce — and draws the same icon as its sidebar row. The entries are declared in the `cms` manifest (`open-pages`, `open-blocks`, `open-templates`, `open-hooks`), so switching the module off removes them with the rest of its surface. *New page* is unchanged.
