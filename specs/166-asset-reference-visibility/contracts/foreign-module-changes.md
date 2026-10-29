# Contract: changes outside the `assets_library` module

This lists every file outside `packages/modules/assets_library/` that the feature changes,
grouped by owner, with the reason for each. **A change not on this list needs a line here first.**
Each module's own tests and docs change with its code, in the same merge request.

## A. `packages/contracts/`

| File | Change | Why |
| --- | --- | --- |
| `src/assets-library.ts` | Adds `AssetReferenceHit`, `AssetReferenceReaderRestriction` and the optional `AssetReferenceDescriptor.readerRestriction`; `findReferences` returns `AssetReferenceHit[]`. Adds `AssetReadPort.visibleToCaller`. Doc blocks of the descriptor, the registry port and `AssetReadPort` say what each answers to whom. | R-2, R-6, R-13; `ports.md` §1–§3 |
| `src/assets-library.test.ts` | Type-level assertions: a plain `AssetReference[]` descriptor still compiles; a restricted descriptor's three methods. | II |

Changeset: `@endora-commerce/contracts` **minor**. It is additive for a descriptor contributor and
adds a method to a port only `assets_library` provides (`release-intent.md`).

## B. `packages/modules/tasks/`

| File | Change | Why |
| --- | --- | --- |
| `src/backend/services/task-asset-references.ts` | Hits carry `assetId`; the descriptor gains `readerRestriction` built over `TaskAccess.visibleIds`, `TaskVisibility.condition('t')` and a `tasks:read` check. The deps become getters (`() => TaskAccess`, …) resolved per call. | R-2, `ports.md` §1.1 |
| `src/backend/services/owner-read-permissions.ts` | `TASKS_READ_PERMISSION` and its check, the existing `createOwnerReadCheck` shape. | F-16: `TaskVisibility` does not check `tasks:read` |
| `src/backend/index.ts` (the asset-reference boot hook, today 542-547) | Passes the getters. Still a contribution-only hook with no presence probe. | `module-activation.md` item 3 |
| `src/backend/services/attachment-service.ts` | `add()` asks `assets.visibleToCaller([assetId])` right after `findById`, before `#refuseAFileHeldOutOfSight`, the private-file and the active-content refusals; absent → `fileUnavailable()`. The `assets` dependency type widens to include `visibleToCaller`. | R-13, F-19 |
| `src/backend/services/task-asset-references.test.ts` (new, co-located) | The restriction's wiring: hits carry `assetId`, getters resolved per call, the `tasks:read` clause, a `null` condition. No co-located test of this package opens a database (T001 (f)), so the SQL complement property is in §F. | R-16 |
| `docs/tasks.md` | One sentence in the attachments section: the library hides a file of a Task the reader may not see. | Docs |

## C. `packages/modules/projects/`

| File | Change | Why |
| --- | --- | --- |
| `src/backend/services/project-asset-references.ts` | Hits carry `assetId`; `readerRestriction` over `ProjectAccess.visibleIds` / `visibleProjectSql`, with `canRead`. Getters as above. | R-2 |
| `src/backend/index.ts` (boot hook, today 638-643) | Passes the getters. | — |
| `src/backend/services/attachment-service.ts` | `add()` asks `visibleToCaller` as Tasks does. | R-13 |
| `src/backend/services/project-asset-references.test.ts` (new) | The restriction's wiring (as Tasks); the SQL complement property is in §F (T001 (f)). |
| `docs/projects.md` | The same sentence. | Docs |

## D. `packages/modules/crm/`

| File | Change | Why |
| --- | --- | --- |
| `src/backend/services/crm-asset-references.ts` | Hits carry `assetId`; `readerRestriction` over the scoped EntityManager (`CrmOpportunity`, Organization reach) and `crm:read`. | R-2, R-15 |
| `src/backend/services/owner-read-permissions.ts` | A `crm:read` check of the caller. | R-15 |
| `src/backend/index.ts` (boot hook, today 439-444) | Passes the getters. | — |
| `src/backend/services/opportunity-attachment-service.ts` | `add()` asks `visibleToCaller` before `#refuseAFileHeldOutOfReach` and the private-file refusal. | R-13 |
| `src/backend/services/crm-asset-references.test.ts` (new) | The restriction's wiring (as Tasks); the SQL complement property is in §F (T001 (f)). |
| `docs/crm.md` | The same sentence. | Docs |

## E. Unrestricted contributors — attribution and batching only

| File | Change | Why |
| --- | --- | --- |
| `packages/modules/catalog/src/backend/services/asset-references.ts` | Every hit carries `assetId`. The category-content descriptor (the per-asset loop at 163-185) becomes **one** jsonpath statement over the batch, returning the matched id. | R-6, F-8, F-14 |
| `packages/modules/cms/src/backend/services/asset-references.ts` | `assetId`; the per-asset loop (43-74) becomes one statement. | R-6 |
| `packages/modules/blog/src/backend/services/blog-asset-references.ts` | `assetId` on both descriptors; the content loop (78-108) becomes one statement. | R-6 |
| `packages/modules/megamenu/src/backend/services/asset-references.ts` | `assetId`. | R-6 |
| Their existing reference tests (`backend/test/integration/assets_library/cms-body-scan.test.ts`, `backend/test/integration/blog/asset-references.test.ts`, `packages/modules/megamenu/src/backend/services/contributed-reference-scanners.test.ts`, `backend/test/integration/{cms,blog}/asset-reference-while-off.test.ts`) | Assert the attribution of a two-asset batch. | R-6 |
| `backend/test/integration/catalog/asset-references.test.ts` (new) | Catalog has no reference-scanner test (T001 (g)): the attribution of a two-asset batch for all five catalog descriptors, and one statement per batch for category content. | R-6 |

No `readerRestriction` for any of them (FR-003): none has a reader-specific rule today (spec,
Assumptions).

## F. `backend/` (application and tests)

| Path | Change |
| --- | --- |
| `backend/test/integration/assets_library/reference-visibility.test.ts` (new) | The not-found-identity matrix and US1–US3 (`quickstart.md` §1). |
| `backend/test/integration/assets_library/reference-visibility-owner-off.test.ts` (new) | US5 with `withModuleOff` for `tasks`, `projects` and `crm`. |
| `backend/test/integration/assets_library/folder-delete-references.test.ts` (new) | US4 and the R-6 repair: recursive delete refuses, hidden assets re-homed. |
| `backend/test/integration/{tasks,projects,crm}/attachments.test.ts` | One case each for FR-006, including a hidden **public** file. |
| `backend/test/contract/assets_library/admin-folders.contract.test.ts`, `admin-soft-delete.contract.test.ts` | Extended for the visible-only counts. |
| `backend/test/perf/assets_library/reference-visibility.perf.test.ts` (new) | SC-004 (R-16). |
| `backend/test/integration/{tasks,projects,crm}/asset-reference-restriction.test.ts` (new) | The SQL complement property of each owner's `readerRestriction` over seeded rows (Tasks: private, draft, public, an unseen Project context, a NULL `context_id`; Projects: Member / Viewer / Organization reach, no `projects:read`; CRM: two Organizations, no `crm:read`). Here and not co-located: no co-located test of those packages opens a database (T001 (f)). |
| `backend/test/integration/tasks/off-state.test.ts` | Its existing "library refuses delete while off" case also asserts the file is absent from a restricted reader's list. |

No generated artefact changes: no new module, migration, entity, manifest field other than one
`dependencies` entry, admin contribution or doc page. `manifests:generate` still re-renders the
`assets_library` package manifest, because `dependencies` changed. Run it, and commit whatever it
renders.

## G. `docs/`

| Path | Change |
| --- | --- |
| `docs/i18n/pl/docusaurus-plugin-content-docs/current/modules/assets-library/index.md` (and its translation-cache entry) | The Polish copy of the new section (`docs/docs/contributing/documentation-i18n.md`). |
| The Polish copies of `tasks.md`, `projects.md` and `crm.md`, where they exist under the same tree | The one sentence each. |

## H. Not changed (checked)

| Area | Why not |
| --- | --- |
| `packages/admin-kit/` | The picker is a client of the list and detail routes (F-12); it needs no change and gets the filtering for free. |
| `packages/modules/assets_library/src/admin/` | The drawer's "Delete disabled while referenced" stays correct by invariant I-1, so there is no UI change. The designer may still review the empty-folder and not-found states. |
| `transactional_emails`, `pim_ergonode`, `product_feeds`, `invoices`, `orders`, `document_templates` | Port consumers on their own terms (R-1). |
| `admin_roles` | Read through its published `permissionService`; no change. |
