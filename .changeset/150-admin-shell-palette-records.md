---
'@endora-commerce/admin-shell': minor
'@endora-commerce/mod-i18n': minor
---

The command palette finds records as well as screens and actions.

On every open the palette asks `GET /api/v1/admin/global-search/capability`; when the answer names
at least one record type, typing at least the minimum search length searches records after a 250 ms
pause (the previous request aborted, a stale answer ignored) and shows one group per record type
after *Actions*, with server-resolved titles, a status badge, a "more results" hint and a note for a
type that could not be searched. Records join the palette's one Arrow/Enter list; a final row opens
`/global-search?q=…`. A refused or failed probe — global search switched off or not installed —
leaves the palette exactly as it was. A live region announces the number of records found.

The `core` bundle gains five keys in English and Polish: `appShell.palette.records.searching`,
`.more`, `.unavailable`, `.seeAll` and `.announce`, so a host needs `@endora-commerce/mod-i18n` at
this version.
