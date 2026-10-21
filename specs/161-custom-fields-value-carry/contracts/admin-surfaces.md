# Contract: admin surfaces (`specs/161-custom-fields-value-carry/`)

Admin UI only. No new route, page, permission code, palette action or nav entry (FR-017;
`/custom-fields` is reachable as the existing palette action `open-custom-fields`). Every component
test renders inside `<StrictMode>`. User-facing text is rendered as text (string children or
i18next interpolation values) — never `dangerouslySetInnerHTML`, never an HTML-bearing bundle value;
a field key shown in the UI is truncated to 64 characters.

## 1. `/custom-fields` — carry options (US4)

Builds on the filters feature's editor (`specs/157-custom-fields-list-filters/contracts/admin-surfaces.md`
§3): `DefinitionEditorDialog`, `DefinitionOptionsEditor`, `DefinitionBehaviourFields`, the table's
*Edit* action. Every change below is an **additive** prop or member; the dialog's structure and its
save path are not rewritten.

### 1.1 `DefinitionBehaviourFields` — the carry toggles

```ts
// additive members
value: { listFilter: boolean; carryTo: SupportedEntityType[] };
onChange: (next: { listFilter: boolean; carryTo: SupportedEntityType[] }) => void;
```

One checkbox per `entityTypeInfo.carryTargets` entry, in that order, labelled
`customFields.carry.toggle` ("Carry value to {entityType}", the type label translated), with help
text `customFields.carry.help` ("When a record of type “{entityType}” is created from a record with
this field, the new record's empty field with the same key receives this field's value." — owner
ruling P4, 2026-10-21, adapted to name the checkbox's own type). Owner ruling V2 (2026-10-21): in the editor dialog
(`layout="stacked"`) each checkbox is described by its own help line; in the narrow create-form row
(`layout="row"`) the checkboxes carry no description of their own and one shared line,
`customFields.carry.helpGroup`, describes the `role="group"` through `aria-describedby`. No toggle when `carryTargets` is empty (Category, Product,
Customer, Organization — US4-4). An Order definition is never offered *Quote Request* because the
registry does not list it.

### 1.2 Saving and refusals

- The create form sends `carryTo` (default `[]`). The editor's *Save* sends `carryTo` **only when it
  changed** (the filters feature's changed-members rule), as the whole new array.
- A 422 `CUSTOM_FIELD_CARRY_INCOMPATIBLE` keeps the form/dialog open and shows an error `Alert`
  whose sentence the page builds from `error.details` (`customFields.carry.refusal.<code>`,
  interpolating the translated target type, the key, the two value-type labels or the missing
  option values). Unknown `details.code` → the server's `error.message`.

### 1.3 Table column and the "incompatible" mark (FR-006, FR-020, US4-5, US4-7)

- New column *Carries to* (`customFields.table.carriesTo`): one chip per `carryTo` entry with the
  translated type label; "—" when empty.
- A chip whose carry is incompatible gets an *Incompatible* badge (`customFields.carry.incompatible`)
  and its reason as visible text under the chip on narrow screens and as `title` / accessible
  description otherwise (`customFields.carry.reason.<reason>` — names the missing field, the type
  pair, the missing options, or the audience rule). The reason is computed as
  `assessCustomFieldCarry(source, target)` where `target` is the same-key definition of the chip's
  type in the page's definitions list (or `null`).
- The mark disappears as soon as the list re-reads and the rule answers `[]`, or the option is
  turned off.

### 1.4 Drift warnings (FR-019, US4-6, US4-8, SC-007)

A module-local pure helper:

```ts
// packages/modules/custom_fields/src/admin/lib/carry-drift.ts
export type DefinitionChange =
  | { kind: 'remove-option'; definitionId: string; optionValue: string }
  | { kind: 'add-option'; definitionId: string; optionValue: string }
  | { kind: 'audience'; definitionId: string; audience: CustomFieldAudience }
  | { kind: 'delete'; definitionId: string };

export interface CarryCounterpart { entityType: SupportedEntityType; key: string; role: 'source' | 'target' }

/**
 * The enabled carries this change turns from compatible to incompatible — or, for `delete`,
 * every enabled carry the definition is part of — named by their counterpart field.
 */
export function carryCounterpartsBrokenBy(
  change: DefinitionChange,
  definitions: readonly CustomFieldDefinitionDto[],
): CarryCounterpart[];
```

Each change site calls it before acting; a non-empty answer opens an in-dialog confirmation
(`customFields.carry.warning.title`, a list of "{entityType} · {key}" lines, `.cancel` and a
proceed button named after the action), never `window.confirm`. Owner ruling V1 (2026-10-21): one
proceed key per action (owner ruling W1, 2026-10-21, named the add-option and audience
buttons after their actions too), mapped from the change kind by `carryDriftProceed` in
`packages/modules/custom_fields/src/admin/lib/carry-drift.ts`, which both the page's dialog and the
editor's in-place warning read:

| Site | Change | Proceed key (en / pl) | Style |
| --- | --- | --- | --- |
| Options section — *Remove* | `remove-option` (breaks sources whose options include it) | `.warning.proceedRemoveOption` — "Remove option anyway" / "Usuń opcję mimo to" | destructive |
| Options section — *Add option* | `add-option` (breaks this source's carries whose target lacks it) | `.warning.proceedAddOption` — "Add option anyway" / "Dodaj opcję mimo to" | default |
| Table — audience select | `audience` (target → `customer` under an `internal` source; source → `internal` under a `customer` target) | `.warning.proceedChangeAudience` — "Change audience anyway" / "Zmień widoczność mimo to" | default |
| Table — *Delete* | `delete` | `.warning.proceedDeleteField` — "Delete field anyway" / "Usuń pole mimo to" | destructive |

*Cancel* sends nothing; the proceed button runs the action exactly as before. Value type is not editable in
the UI (the filters feature's editor never sends it), so no site asks about it.

### 1.5 Keys (`packages/modules/custom_fields/i18n/{en,pl}.json`)

`customFields.carry.toggle`, `.help`, `.incompatible`, `.reason.target_missing`,
`.reason.value_type_mismatch`, `.reason.options_missing`, `.reason.audience_mismatch`,
`.helpGroup`, `.refusal.<six tokens>`, `.warning.title`, `.warning.body`,
`.warning.proceedRemoveOption`, `.warning.proceedDeleteField`, `.warning.proceedAddOption`,
`.warning.proceedChangeAudience`,
`.warning.cancel`, `.warning.counterpart`, `customFields.table.carriesTo`. Final wording is the designer's.

## 2. Order detail — the system note (US1-4, FR-010a, SC-006)

`packages/modules/orders/src/admin/pages/OrderDetail.tsx`, *Comments* tab:

- `OrderCommentRow` gains `systemNote: OrderCommentSystemNote | null`.
- A row with `systemNote` renders: author "System" (`orderDetail.comments.systemAuthor`), an
  *Internal* marker as internal comments already show, and the sentence
  `orderDetail.comments.systemNote.customFieldCarrySkipped` ("Not carried from {sourceType}
  {reference}:") followed by one line per skipped key with
  `orderDetail.comments.carryReason.<reason>`. The field is named by the label stored with the
  skip (owner ruling V3, 2026-10-21): `label.labels[language]`, then `label.labelDefault`, then the
  key for a note written before labels were stored, cut at 64 characters. The screen makes **no**
  definitions read for it, so every admin who can see the Order reads the name without
  `custom_fields:read`. `body` is
  the fallback when a key is missing.
- No reply, edit or delete affordance appears on it (none exists for any comment today).

## 3. Quote Request history (US3, FR-010)

`packages/modules/quote_requests/src/admin/pages/RfqHistory.tsx` renders the
`custom-field-carry-skipped` entry: title `history.customFieldCarrySkipped` ("Custom field values
not carried from sales opportunity {reference}"), one line per key with
`history.carryReason.<reason>`, the field named by its stored label as on the Order note (§2).
Keys in `packages/modules/quote_requests/i18n/{en,pl}.json`.

## 4. Opportunity history (US2-5, US2-6)

`packages/modules/crm/src/admin/components/OpportunityHistory.tsx` and
`packages/modules/crm/src/admin/lib/history-fields.ts`:

- `customFieldCarry` joins `LABELLED_HISTORY_FIELDS` with `history.field.customFieldCarry`; the
  entry renders "Not carried from {sourceType}:" and one line per skipped key with
  `history.carryReason.<reason>`; `carried` is silent (the carried values show through the existing
  `customFieldValues` row).
- The field is named by the label stored with the skip, as on the Order note (§2), with no
  definitions read for it. Owner ruling V3 (2026-10-21): the skip lines — name and reason, never a
  value — are shown to every reader of the Opportunity, **without** `custom_fields:read`. The
  `customFieldValues` row keeps the existing `canSeeCustomFields` gate unchanged.
- `packages/modules/crm/src/admin/index.test.ts` stays green: every key an audited state can carry
  is labelled or silent.
