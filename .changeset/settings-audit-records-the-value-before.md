---
'@endora-commerce/mod-settings': patch
---

The audit trail of a setting-value change now records the value before the change as well as the value after it.

Until now `setting.global_value_set` and `setting.value_set` carried `stateAfter` only, and the two resets (`setting.global_value_reset`, `setting.value_reset`) recorded that a value was removed without recording which. Each of the four now also carries `stateBefore`:

```json
{ "settingCode": "your_module.base_url", "value": "https://old.example", "valueType": "string", "stored": true }
```

plus `salesChannelId` on the two per-channel actions. The audit log viewer already renders `stateBefore` beside `stateAfter`, so the previous value appears there with no further change.

**What `value` is.** The value **stored** at the level being written — the all-channels value for an all-channels write or reset, that channel's own value for a per-channel one. It is not the value the channel resolved to, which keeps it on the same footing as `stateAfter`: a first write records `"value": null, "stored": false`, not the manifest default and not an inherited all-channels value. `stored` is what separates "nothing was stored" from a stored `null`, which a `json` setting may legitimately hold.

**Secrets.** A `secret` setting's previous value is recorded as `"[redacted]"`, exactly as its new value already was — neither the plaintext nor the stored ciphertext reaches the audit trail. A `credential_ref` records the configuration code on both sides, as before.

Nothing about the write itself changes, `stateAfter` keeps its shape, a refused write still records nothing, and there is no migration: `audit_log_entries.state_before` already existed. Entries written before this release keep an empty before-state.
