---
'@endora-commerce/platform': minor
'@endora-commerce/contracts': minor
'@endora-commerce/admin-shell': minor
'@endora-commerce/mod-i18n': minor
'@endora-commerce/mod-api-keys': patch
---

The API description is available to administrators with the `platform.api_description.read` permission and to API keys with the `platform.api_description.read` scope.

**`@endora-commerce/platform`.**

- New permission `platform.api_description.read` (*Read the API description*), declared by `_lifecycle`'s manifest with English and Polish labels. The platform administrator grants it through an admin role.
- `GET /api/v1/_openapi.json` and `GET /api/v1/_docs` now answer only an administrator holding the code or an API key whose scopes include it. Anybody else is answered `401 UNAUTHORIZED` (no administrator session or key, a customer session included) or `403 FORBIDDEN` (an administrator or a key without the code). Both stay outside the sales-channel access rule (`salesChannelAccess: 'open'`). Responses carry `Cache-Control: private, no-store`.
- New admin route `GET /api/v1/admin/api-description`, gated on the same code, serving the same document to the Admin UI.
- `buildServer` no longer mounts the two routes. It decorates the root instance with `apiDescription(): OpenAPIV3_1.Document` (built on first call, as before), and `_lifecycle` mounts the routes where `auth`'s `requireAdmin` port is available. A composition that mounts no `_lifecycle` serves no API description; one that called `buildServer` and read `/api/v1/_openapi.json` in-process reads `app.apiDescription()` instead, or sends credentials. `registerOpenApiRoutes` is removed; it was reachable only through the host-internal `./http/openapi` subpath.
- The reference page loads `swagger-ui-dist@5.33.3` from jsDelivr with Subresource Integrity on both files (`swagger-ui.css` `sha384-Ov4/wv3j2bmct8cDc5X4ngJZohVPzEmc6uDPH8WeljUxO5vtoykvMEfbu9Vh6RaW`, `swagger-ui-bundle.js` `sha384-h00llMzD1afyNow1pDmnZKlHsUZgp9KE9HXLFXF2CvbwsBY0+WBO4f75SfGwvM4K`) and `crossorigin="anonymous"`; it used to load an unpinned version.
- A command-palette action, *API description*, targets `/api-description` and requires the new code.

**`@endora-commerce/contracts`.** `apiKeyScopeSchema` gains `'platform.api_description.read'`, so an administrator who holds the code can issue an API key that reads the API description.

**`@endora-commerce/admin-shell`.** New kernel-served screen `/api-description` (*System → API description*, gated on `platform.api_description.read`): the document's title, version and endpoint count, a JSON download, and a link that opens the interactive reference on the API's own address in a new tab, carrying the administrator session.

**`@endora-commerce/mod-i18n`.** The screen's strings and its navigation label in English and Polish (`platform.apiDescription.*`, `appShell.nav.platformApiDescription`).

**`@endora-commerce/mod-api-keys`.** The module page lists the new scope.
