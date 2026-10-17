# Contract: line collections, the Line items table, and the selection list

**Normative for**: `document_templates` (owner of every name below) and every module declaring a line
collection on its document type — in this feature `quote_requests`.
**Extends**: `specs/152-compare-pdf-template/contracts/document-type-registry.md` (§2 registration,
§3 registry, §4 port) and `contracts/document-templates-api.md` (route 2). Everything there still holds
unless amended here.
**Types live in**: `packages/contracts/src/document-templates.ts` (Principle II — before any route).
Shapes: `data-model.md` §2–§3.

## 1. Registration — `collections`

```ts
interface DocumentTypeRegistration<TData, TPrepared> {
  // … 152 members unchanged …
  readonly collections?: readonly DocumentCollectionDeclaration<TData>[];
}
```

Refused **at registration** (boot error, `DocumentTypeRegistrationError`, in addition to 152 §3):

- a collection `key` outside `^[a-z][A-Za-z0-9]*$` or used twice in one type;
- a built-in layout (`defaultContent()`) whose `document_templates.ItemsTable` node fails
  `itemsTablePropsSchema`, or names a `collection` the type does not declare.

Refused **per call** of `fields()` / `summaryFields()` (field dropped, logged once, type kept — the
152 per-call idiom): a path outside `documentFieldPathRe`; a path in a reserved family (`row.*`,
`item.*`); a duplicate path. `fields()` rejecting → the collection answers an empty catalogue for
that call and the failure is logged (the render continues; columns print their empty text).

`items(data)` and `summary(data)` are called once per render per collection the layout uses; a throw
is a block failure (152 R-17: `DOCUMENT_RENDER_FAILED`, logged with the block name).

The facility prepends `row.number` (*Position*, `number`, group `line`, audience `customer`,
right-aligned, 0 decimals) to every collection's catalogue and assigns it 1…n in item order (within the
whole table; grouping does not restart it).

## 2. Palette

`DocumentTypeRegistry.palette(code)` = type blocks ∪ opted-in core blocks ∪ **collection blocks**, where
collection blocks = `['document_templates.ItemsTable']` when `collections?.length > 0`, else `[]`.
`COLLECTION_BLOCK_NAMES` is exported beside `CORE_BLOCK_NAMES`; a host block may not take the name
(per-call refusal, as for a core block name). The builder descriptor lists type blocks, then collection
blocks, then core blocks. Save-time FR-019 (152) refuses the ItemsTable in a type without collections,
naming it; the renderer skips it there.

## 3. Block `document_templates.ItemsTable`

Declared in `document_templates`' manifest: `contexts: ['document']`, category `data` (new category,
`blocks.category.data`), `labelKey: 'blocks.itemsTable.label'`, `fields` (descriptor) for the scalar
style props; the structured props (`collection`, `columns`, `detailRow`, `totals`, `grouping`) are
declared `type: 'array' | 'object'` in the descriptor and edited through custom fields the facility's
admin canvas supplies (`admin-ui.md` §2). `defaultProps`: one column per catalogue-independent default
— `row.number`, then no further columns (an empty table's editor prompts "Add a column"); `stripedRows:
false`, colours and sizes as in `data-model.md` §2.

### 3.1 Save-time validation

`saveContent` (and `create` from a source) runs `itemsTablePropsSchema` over every ItemsTable node of the
tree **after** 152's tree validation; the first issue answers 422 `DOCUMENT_TEMPLATE_INVALID` with
`details: { path: 'content.<i>.props.<…>', blockName: 'document_templates.ItemsTable', limit? }`.
A `collection` the type does not declare is refused (`details.collection`). Unknown field paths are
accepted (FR-037).

### 3.2 Rendering — `rendering/items-table.ts`

Input: props (tolerant readers), the collection declaration, `language`, `context`, the collection's
catalogue for `language` (one `fields()` + one `summaryFields()` call per render per collection,
awaited before blocks render, alongside asset images), `items(data)`, `summary(data)`.

1. **Visible columns**: `never` dropped; `any_has_value` dropped when no item has a value at the column's
   field (or the rule's `field`); `always` kept. No column or no item → one text node `emptyText`
   (interpolated with document merge fields).
2. **Header row**: label (interpolated with document merge fields) or the catalogue label; unknown field →
   the path itself in the editor only, `''` in the PDF.
3. **Body**: per item (in group order, §3.3) one row: `formatDocumentValue(item.values[field], format ⊕
   field.defaultFormat, language)` or `emptyText` when it has no value; alignment
   `resolveDocumentAlign(column.align, field.defaultAlign, valueKind)`.
4. **Detail row** (if enabled): entries whose rule holds over `{ item }` with a value, formatted
   `label: value` joined by `separator`; none → no row; else a row of one cell `colSpan: n`.
5. **Widths** (§R-8), `headerRows: 1`, `dontBreakRows: true`, layout lines with `borderColor`, header
   fill, stripes.
6. **Totals**: rows whose rule holds over `{ summary }`; label (or catalogue label) and formatted value;
   a separate right-aligned two-column `unbreakable` table; emphasised rows bold with a top rule.
7. Output: `{ stack: [table, totals?], margin: [0, 0, 0, marginBottom] }` — one pdfmake node.

### 3.3 Grouping

Group key = `formatDocumentValue(value, {}, language)` of `grouping.field`, `emptyLabel` when it has no
value. Groups in order of first appearance; items keep their order within a group. Per group: a header
row (one cell, `colSpan: n`, bold, header fill), the group's rows, then — when `subtotalField` is set —
a subtotal row: `subtotalLabel` spanning `n − 1` cells and `sumDocumentValues` in the last visible
column (or, when that column is not numeric, right-aligned in a full-width cell).

### 3.4 Pure functions (`CT/document-templates.ts`) — normative behaviour

| Function | Behaviour |
| --- | --- |
| `documentValueHasValue(v)` | `false` for `null`/`undefined` and a text empty after trim; `true` otherwise (`0` included) |
| `formatDocumentValue(v, f, lang)` | text → as is; number → `Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d })` (d = `f.decimals` ?? 2, 0 for integers); money → `style: 'currency'`, `currencyDisplay` `symbol`/`code`, `none` → number + nothing; invalid currency → number + code; percent → number + ` %`; date → `Intl.DateTimeFormat(lang, { dateStyle })`; any failure → `String(raw)` |
| `evaluateDocumentCondition(c, scope, defaultField)` | `always` → true; `never` → false; `has_value` → `hasValue(scope.item?.values[f] ?? scope.summary?.[f])`; `any_has_value` → `scope.items.some(hasValue(values[f]))`; unreadable → true |
| `sumDocumentValues(values)` | numbers → sum; money of one currency → money sum rounded to 2 decimals; mixed kinds or currencies, or none with a value → `null` |
| `resolveDocumentAlign(a, def, kind)` | explicit → it; `auto` → `def` ?? (number/money/percent → right, else left) |

## 4. Admin route 2 — `GET /api/v1/admin/document-templates/types/:code?language=` (amended)

`DocumentTypeDetail` gains:

```ts
collections: {
  key: string; labelKey: string; ownerModule: string;
  fields: DocumentFieldDefinition[];          // incl. row.number; labels in `language`
  summaryFields: DocumentFieldDefinition[];
  sampleItems: DocumentItem[];                // items(sampleData(language)), sampleValue filled where absent
  sampleSummary: Record<string, DocumentValue>;
}[]
```

`[]` for a type without collections. Same permission, cache header and availability rules as 152.

## 5. `DocumentRenderPort.listChoices` (new member of the gated port)

```ts
interface DocumentRenderPort {
  render<TData>(input: DocumentRenderInput<TData>): Promise<DocumentRenderResult>;   // unchanged
  listChoices(input: { readonly documentType: string; readonly salesChannelId: string | null }):
    Promise<DocumentTemplateChoices>;
}

interface DocumentTemplateChoices {
  readonly templates: readonly {
    readonly id: string; readonly name: string; readonly salesChannelId: string | null;
    readonly languages: readonly string[]; readonly isDefault: boolean;
  }[];                                         // global ∪ that channel (none of another), ordered: channel first, then global; by name
  readonly effectiveDefaultId: string | null;  // FR-031 without a choice; null = built-in layout
  readonly builtInLanguages: readonly string[];
}
```

- Type not available → 404 `DOCUMENT_TYPE_NOT_AVAILABLE`; type `default_only` → 422
  `DOCUMENT_TEMPLATE_NOT_SELECTABLE`.
- One indexed read (`document_type`, `sales_channel_id in (null, $channel)`). `effectiveDefaultId` does
  not apply the "renders nothing" fall-through (152 FR-031's last clause) — it names the default row.
- Gated like `render` (the port is one registration).

## 6. Merge fields — reservation (no behaviour change)

`interpolateMergeFields` is unchanged. A test pins that `{{item.sku}}`, `{{item.attributes.colour}}`
and `{{row.number}}` print **verbatim** (FR-045). `mergeFieldKeyRe` is unchanged; a declared variable
key still may not contain a dot, so no host can claim the reserved `item.` namespace.

## 7. Tests owed

- Contracts: `itemsTablePropsSchema` (every limit, rule ops per position, ids unique), path regex,
  reserved families; the five pure functions incl. `pl-PL`/`en-US` formatting, `0` has a value, mixed
  currencies.
- Registry: collection key refusals at registration; per-call field refusals; palette with/without
  collections; host block named `document_templates.ItemsTable` refused per call.
- Renderer (definition-level, `buildDefinition`): visible-column rules; widths scaling; `headerRows`,
  `dontBreakRows`; detail row present/absent per item; totals rules; grouping order and subtotals;
  empty text; unknown field; `fields()` rejecting; hostile props; ItemsTable skipped in a type without
  collections; a test-only type declaring a collection prints through the block with no facility change
  (SC-007).
- Service: save refuses invalid props with the path; accepts unknown field paths; built-in layout
  validation at registration.
- Port: `listChoices` scope filtering (global + same channel, never another), `effectiveDefaultId` per
  channel/global/none, `default_only` refusal, off-state `MODULE_DISABLED`.
- Merge-field reservation (§6).
