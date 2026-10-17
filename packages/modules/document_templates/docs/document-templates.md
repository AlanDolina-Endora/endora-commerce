---
title: Document templates
description: Design the PDF documents the platform produces — the product comparison and the invoice — in the Page Builder, per document type, language and sales channel
---

# Document templates

Document templates let an operator design the layout of the PDF documents the
platform produces, in the same Page Builder as CMS pages and e-mails. Two kinds
of document — **document types** — use them in this release:

| Document type | Provided by | Produced when |
| --- | --- | --- |
| **Product comparison** | Compare Products | a buyer clicks **PDF** on the storefront comparison page |
| **Invoice** | Invoices | an invoice PDF is downloaded by an administrator or a customer, regenerated, or attached to the invoice e-mail |

A document type is contributed by the module that owns the document's data, so
it is listed only while that module is switched on. The module also decides
which blocks its documents may use.

## Where to find it

**Content → Document templates** in the sidebar, or press **⌘K** / **Ctrl+K**
and type *pdf*, *document template*, *invoice template* or *szablon faktury*.
The **PDF template** button on the **Comparisons** screen opens the product
comparison card, and the **Templates** tab of **Invoices** opens the invoice
card.

## Built-in layout, templates and the default

Each document type has a **built-in layout**: the layout the platform ships. It
is used whenever no template applies, and it is where every new template starts.

A document type can hold any number of **templates**. Each template applies to
**all sales channels** or to **one sales channel** — its scope, chosen when it
is created and fixed afterwards. In each scope **at most one template is the
default**. A document is produced with:

1. the default template of the document's sales channel, else
2. the default template for all sales channels, else
3. the built-in layout.

A template whose layout places nothing printable counts as absent, and the
next one in that order is used.

Creating a template changes no document: a new template is not the default
unless **Set as default** is ticked. The safe way to change what customers
receive is *duplicate → edit → set as default*. Setting a template as default
replaces the previous default of its scope in the same step; deleting a default
asks for confirmation and says what applies instead.

## Editing a template

The editor offers **only the blocks of the template's document type**:

| Document type | Blocks |
| --- | --- |
| Product comparison | Comparison header, Comparison table, Share link, and the general blocks: Heading, Text, Image (from the assets library), Spacer, Divider, Page break |
| Invoice | Header, Parties, Line items, VAT summary, Totals, Notes, Spacer, Divider, Logo, Footer, and blocks other installed modules contribute to invoices (for example a KSeF section) |

The canvas shows each block filled with a **sample document**; **Preview PDF**
produces the real PDF of the canvas — saved or not — with the same sample, and
saves nothing.

**Page settings** (the root of the tree) set the page size (A4 or Letter),
orientation (automatic — landscape from three compared products — portrait or
landscape), margins, base font size, an optional repeating header and footer
text, and page numbers.

**Merge fields** are placeholders typed into a text, such as `{{date}}` or
`{{customerName}}`, replaced when the PDF is produced. The editor lists the
merge fields of the document type; `{{page}}` and `{{pages}}` work in the
header, footer and page-number format only. A merge field without a value prints
empty; a misspelled one prints as typed.

**Languages.** A template holds one layout per language. The product comparison
may hold every active content language: a buyer gets the layout in the language
the storefront is shown in, else one with the same base language, else English,
else the first the template has; product and attribute names, dates and prices
are printed in that language. Choosing a language the template does not hold
offers to start it from the language being edited. Invoices are printed in
Polish only, so the invoice editor offers no language choice.

**Saving** is refused when someone else saved the template after you opened it;
reload to see their changes. A block whose module is switched off is kept in the
template, shown as a placeholder and left out of the PDF.

## Permissions

| Permission | Allows |
| --- | --- |
| `document_templates:read` | the list, the editor (read-only) and **Preview PDF** |
| `document_templates:write` | creating, renaming, saving, setting and clearing the default, duplicating and deleting |

When invoice templates moved here, every role allowed to view invoices was given
`document_templates:read`, and every role allowed to edit invoices also
`document_templates:write` — once; a permission removed afterwards is not given
back. Every template change is recorded in the audit log.

## Switching modules off

- **Document templates off** — the screens, the sidebar entry, the palette entry
  and the comparison's **PDF template** button disappear and the API answers
  `MODULE_DISABLED`; the comparison PDF keeps working with its fixed layout. It
  cannot be switched off while **Invoices** is on, because every invoice PDF is
  produced from it. Templates are kept and return unchanged when it is switched
  back on.
- **Compare Products or Invoices off** — that document type, its blocks and its
  templates leave the screens and the API; nothing is deleted.

## Limits

A template holds up to 10 languages, 200 blocks and 20 images per language, and
512 KiB of content; a text holds up to 5 000 characters. The comparison table
prints 1 to 8 products per table and continues in the next table.

## API

`/api/v1/admin/document-templates` — the document types (`/types`,
`/types/:code`, `/types/:code/builder-config`), the templates (list, read,
create or duplicate, rename, save one language, set and clear the default,
delete) and `POST /preview`. Error codes: `DOCUMENT_TEMPLATE_NOT_FOUND`,
`DOCUMENT_TYPE_NOT_AVAILABLE`, `DOCUMENT_TEMPLATE_INVALID`,
`DOCUMENT_TEMPLATE_IS_DEFAULT`, `DOCUMENT_TEMPLATE_NOT_SELECTABLE`,
`DOCUMENT_RENDER_FAILED`.

A module adds a document type by pushing a registration — its blocks, whether it
opts into the general blocks, merge fields, sample data, built-in layout,
languages, page defaults and whether one template may be chosen per document —
into the `documentTypeRegistry`, and produces documents through the
`documentRenderPort` with its own data.
