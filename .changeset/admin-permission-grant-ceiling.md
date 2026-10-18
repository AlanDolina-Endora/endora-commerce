---
'@endora-commerce/contracts': patch
'@endora-commerce/mod-admin-roles': patch
'@endora-commerce/mod-admin-users': patch
'@endora-commerce/mod-api-keys': patch
---

Administrators hand out only the permissions their own role holds. A holder of the wildcard `*` is unaffected.

- `PUT /api/v1/admin/admin-roles/:code` refuses a role holding a permission the actor lacks, and refuses to change a role that already holds one, with `403 ADMIN_ROLE_GRANT_EXCEEDED` (`details.permissions` names the missing codes). A role the platform or a module seeds — `platform_admin` included, with its `requiresTwoFactor` flag — is changed only by a holder of `*`; anybody else is answered `409 ADMIN_ROLE_PROTECTED` with `details.code: 'modify'`.
- `POST` and `PATCH /api/v1/admin/admin-users` assign a role only if the actor holds every permission it grants (`403 ADMIN_ROLE_GRANT_EXCEEDED`). An account whose role holds a permission the actor lacks is not edited, given a password, deactivated or deleted by them: `403 ADMIN_USER_OUTRANKS_ACTOR`.
- `POST /api/v1/admin/api-keys` issues a key only with scopes the issuing administrator's role holds: `403 API_KEY_SCOPE_NOT_HELD`, with the missing scopes in `details.scopes`. `api_keys` now declares `admin_roles` as a dependency.

`AdminRolePort.upsertByCode(input, options?)` takes an optional `{ grantor: { permissions } }`. Pass it for a write made on an administrator's behalf; leave it out for a platform write — a module seeding its roles, an upgrade step, the bootstrap command — which is not held to the ceiling. `@endora-commerce/contracts` exports `permissionsNotHeld(requested, held)` and `ADMIN_PERMISSION_WILDCARD`, and three new `ERROR_CODES` members.
