---
'@endora-commerce/mod-projects': minor
---

A new module package, `@endora-commerce/mod-projects` (module id `projects`).

In this release it is the module's foundation and nothing more: its manifest, with the
activation control `projects.enabled` (on by default, switchable on `/platform/modules`), an
empty composition root and no migration, table, permission, route or screen. An instance that
installs it gains nothing but the switch; an instance that does not is unaffected. Its contract —
`ProjectReadPort`, `ProjectStageGuardRegistryPort` and the API schemas — is in
`@endora-commerce/contracts` already (see that package's entry).
