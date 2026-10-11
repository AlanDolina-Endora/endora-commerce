# Quickstart: verifying search engine robots (`specs/144-seo-search-engine-robots/`)

For whoever implements or reviews a slice. Commands assume the dev stack
(`pnpm run build:packages && pnpm run dev`) with the storefront on `http://localhost:3000`, the
admin on its dev port and the backend on `http://localhost:3001`. **`db:fresh`, `db:reset` and
the `module:*` CLI read `backend/.env` and act on the dev database — do not run them unprefixed
against a database you want to keep.**

## Slice 1 — default robots

1. Admin → Settings → SEO → *Default robots* → `NOINDEX, NOFOLLOW` → save for all channels.
2. Within a minute or two:

   ```bash
   curl -sI http://localhost:3000/ | grep -i x-robots-tag          # noindex, nofollow
   curl -s  http://localhost:3000/ | grep -o '<meta name="robots"[^>]*>'
   curl -sI http://localhost:3000/cart | grep -i x-robots-tag       # noindex, nofollow
   curl -sI http://localhost:3000/sitemap.xml | grep -i x-robots-tag
   curl -sI http://localhost:3000/icons/<any file> | grep -i x-robots-tag
   curl -s  http://localhost:3000/robots.txt                        # unchanged: no "Disallow: /" line
   curl -s  http://localhost:3001/api/v1/storefront/seo/robots-policy   # {"data":{"index":false,"follow":false}}
   ```

3. Set one channel back to `INDEX, FOLLOW` and repeat with `-H 'x-sales-channel: <code>'`: that
   channel has no header and no extra tag; the others keep theirs.
4. Reset to default: every response is byte-for-byte what it was before the feature
   (compare against a capture taken before step 1).
5. Stop the backend, restart the storefront, start the backend but make the policy route fail
   (or block it): pages still answer `200`, with only their own robots tag (FR-017).

## Slice 2 — Settings-screen generics

- A setting declared `multiline: true` renders a multi-line field; paste three lines, save,
  reload — three lines.
- Switch the admin language to Polish: the SEO group's setting names and descriptions are
  Polish; a module that ships no `settingLabels.*` keys still shows its English names.

## Slice 3 — custom `robots.txt` instructions

```bash
curl -s http://localhost:3000/robots.txt                 # system rules, blank line, operator text
curl -s 'http://localhost:3000/robots.txt?part=system'   # system rules only
curl -sI http://localhost:3000/robots.txt | grep -i 'x-endora-crawler-files\|cache-control'
```

Reset the setting: the first command prints the system rules alone. Paste more than 64 KiB: the
save is refused and the message names the limit.

## Slice 4 — the preview

On the *Custom robots.txt instructions* row: two labelled blocks; type without saving — the
second block follows and the "not yet saved" notice appears; switch channel — the preview
follows; set the channel to `NOINDEX` — the "stays open on purpose" sentence appears; stop the
storefront — "could not be reached", save still works.

## Slice 5 — `llms.txt`

```bash
curl -s  http://localhost:3000/llms.txt        # generated base, then operator text
curl -sI http://localhost:3000/llms.txt        # 404 once the channel is NOINDEX
```

## Off state (every slice)

Admin → Platform → Modules → switch SEO off. Then: the three `curl` checks of slice 1 show no
header and no extra tag; `robots.txt` is the system rules alone; `llms.txt` is `404`; the SEO
settings are read-only with no preview; `⌘K` offers neither SEO action;
`/api/v1/storefront/seo/robots-policy` answers `503 MODULE_DISABLED`. Switch it back on: everything
returns as configured.

## Checks to run before reporting a slice done

```bash
pnpm run build:packages
pnpm -r run typecheck && pnpm -r run lint
pnpm run check:naming && pnpm run check:language
pnpm --filter backend run composer:generate          # manifest, docs artefacts, migration registry
pnpm --filter backend run check:admin-zones
pnpm --filter backend run check:action-route-permissions
pnpm --filter backend run check:storefront-indexability
pnpm --filter backend run check:module-docs && pnpm --filter backend run check:docs-translations
pnpm --filter backend run check:release-intent -- --since origin/master
pnpm --filter backend exec vitest run test/integration/seo test/contract/seo \
  test/integration/_admin_surfaces/batch-eight-palette-off-state.test.ts \
  test/contract/admin_users/permission-inventory.test.ts \
  test/unit/_i18n/registered-bundles-shape.test.ts
pnpm --filter '!backend' run test                    # storefront, contracts, the module packages
```

`test:unit:fast` does not reach the contract and integration trees. Deleting
`storefront/app/robots.ts` is a deletion: grep `backend/test/**` and `storefront/test/**` for it
before finishing (one importer is known — `storefront/test/seo/route-declarations.test.ts`).
