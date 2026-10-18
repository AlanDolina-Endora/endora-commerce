---
'@endora-commerce/contracts': patch
'@endora-commerce/platform': patch
'@endora-commerce/mod-mfa': patch
'@endora-commerce/mod-credentials': patch
---

Two changes that keep a stored protection from being dropped as a side effect of another change.

- **`mfa` is not switched off while administrators are required to use a second factor.** `POST /api/v1/admin/modules/mfa/activation` with `{ active: false }` answers `409 MFA_DEACTIVATION_BLOCKED` (`details.setting: 'mfa.admin.totp_enforced'`) while that setting is on, and changes nothing. Turn the requirement off first; the switch-off then goes through as before, and switching `mfa` back on is never refused. `mfa` publishes the answer as `mfaDeactivationGuardPort` (`MfaDeactivationGuardPort` in `@endora-commerce/contracts`).
- **A stored credential secret is not carried over to a changed endpoint.** `PUT /api/v1/admin/credentials/:code` that changes a field saying where the record's secrets are sent — an LLM `baseUrl`, an SMTP `host` — answers `422 CREDENTIAL_SECRET_REENTRY_REQUIRED` (`details.fields` lists the secret keys) unless every stored secret is re-entered in the same request. The admin form marks those secret fields as soon as the endpoint is edited. `FieldDefinition` gains an optional `endpoint` flag (defaulting to `true` for `format: 'url'` fields) and `@endora-commerce/contracts` exports `isCredentialEndpointField`; a module registering its own configuration type gets the rule for its URL fields without a change, and declares `endpoint: true` on a host field that is not a URL.
