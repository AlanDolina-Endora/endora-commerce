---
'@endora-commerce/mod-catalog': minor
---

The admin category tree accepts `/catalog/categories?focus=<id>`: once the list has loaded, the
category's row is marked `aria-current="true"`, highlighted, scrolled into view and focused, once. It
is where a global-search Category result lands. An id the tree does not hold changes nothing.
