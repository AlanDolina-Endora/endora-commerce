---
'@endora-commerce/contracts': minor
'@endora-commerce/mod-settings': minor
---

A platform reporting time zone: the setting `reporting.time_zone`, in the *General* section of the
settings screen, is the calendar reports count days in — a range of days runs from midnight of its
first day to midnight after its last, in that zone. Default `UTC`. It is declared by
`@endora-commerce/mod-settings` rather than by a reporting module, so that any report can read it;
Projects analytics does. A write of a zone the runtime does not know is refused with `422`
`VALIDATION_FAILED`. `@endora-commerce/contracts` exports the code as `REPORTING_TIME_ZONE_SETTING`
and the check as `isIanaTimeZone`. The settings package now runs its own unit tests (`test`).
