---
'@endora-commerce/admin-kit': patch
---

`ProductPicker` now shows a preselected product without any interaction when it is mounted under React `<StrictMode>`, as the admin runs it. Its warm-up lookup marked an id as fetched before the answer arrived, so StrictMode's simulated unmount discarded the answer and the remount asked for nothing — the field stayed empty until opening the dropdown happened to load the product (seen on a quote request's Modify tab). The lookup in flight is now kept per id and re-awaited by every effect run, so a remount reuses the same request; only a failed lookup is remembered so it is not retried on every re-render.
