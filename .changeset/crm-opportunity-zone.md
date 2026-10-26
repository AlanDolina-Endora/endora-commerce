---
'@endora-commerce/contracts': minor
'@endora-commerce/mod-crm': minor
---

An Opportunity's screen ends with a zone other modules can fill: `opportunity.detail.after`.

**`@endora-commerce/contracts`**: `AdminZoneNameSchema` gains `'opportunity.detail.after'`, with
its props `OpportunityDetailZoneProps { opportunityId }` in `AdminZonePropsMap`. A consumer that
switches exhaustively over `AdminZoneName` gets a compile error until it handles the new member.

**`@endora-commerce/mod-crm`** mounts it once, after the card holding the Opportunity's tabs,
handing over the Opportunity's id and nothing else. With nobody contributing — no module, one
that is switched off, or a person without the contribution's permission — the screen is
unchanged. CRM names no contributor; the first is the Projects module's *Project* panel.
