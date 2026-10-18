import { isCredentialEndpointField, type FieldDefinition } from '@endora-commerce/contracts';

/**
 * Labels of the endpoint fields — the ones saying where the record's secrets
 * are sent — whose value differs between what the form loaded and what the
 * operator has typed. While one is non-empty, every stored secret must be typed
 * again: the server refuses to carry a stored secret over to a changed endpoint
 * (`CREDENTIAL_SECRET_REENTRY_REQUIRED`), and the form says so before saving.
 */
export function movedEndpointLabels(
  fields: readonly FieldDefinition[],
  initial: Readonly<Record<string, string>>,
  current: Readonly<Record<string, string>>,
): string[] {
  return fields
    .filter((field) => !field.secret && isCredentialEndpointField(field))
    .filter((field) => (initial[field.key] ?? '').trim() !== (current[field.key] ?? '').trim())
    .map((field) => field.label);
}
