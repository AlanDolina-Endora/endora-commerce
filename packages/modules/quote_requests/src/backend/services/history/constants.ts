/**
 * The note `createOnBehalf` writes beside its `created` event. History
 * recognises it by exact equality and replaces it with a translated title
 * (FR-011); any other note is an operator's and is always shown.
 *
 * A leaf module, imported by both `rfq-admin-service.ts` (which writes it) and
 * `history-projection.ts` (which recognises it), so neither imports the other
 * for it.
 */
export const AUTOMATIC_ADMIN_CREATION_NOTE =
  'Quote Request created on customer behalf — awaiting customer acceptance.';
