import {
  ADMIN_SEARCH_DEFAULT_STORED_CONFIGURATION,
  AdminSearchStoredConfigurationSchema,
  type AdminSearchProvider,
  type AdminSearchStoredConfiguration,
  type AdminSearchStoredEntityConfiguration,
  type UpdateAdminSearchConfigurationRequest,
} from '@endora-commerce/contracts';

/**
 * The search configuration, resolved and validated
 * (`specs/150-admin-global-search/data-model.md` §2–§3, research R-6).
 *
 * The stored value outlives code versions — an owner may stop offering a field,
 * a module may be switched off — so it is **resolved on every read** against
 * what the present providers offer now, and entries of absent providers are
 * kept untouched for when they return (FR-027).
 */

export interface ResolvedEntityConfiguration {
  readonly provider: AdminSearchProvider;
  readonly enabled: boolean;
  /** Non-empty, offered codes, in offer order. */
  readonly fields: readonly string[];
  /** `false` ⇔ no stored entry: the defaults apply. */
  readonly customized: boolean;
}

export interface ConfigurationIssue {
  readonly path: string;
  readonly issue: string;
}

/** The stored value, or the default when it is unreadable — a search never fails on it. */
export function parseStoredConfiguration(raw: unknown): AdminSearchStoredConfiguration {
  const parsed = AdminSearchStoredConfigurationSchema.safeParse(raw);
  return parsed.success ? parsed.data : ADMIN_SEARCH_DEFAULT_STORED_CONFIGURATION;
}

export function defaultFields(provider: AdminSearchProvider): string[] {
  return provider.fields.filter((f) => f.defaultSelected).map((f) => f.code);
}

/** Resolve the configuration of every given (present) provider. */
export function resolveConfiguration(
  stored: AdminSearchStoredConfiguration,
  providers: readonly AdminSearchProvider[],
): ResolvedEntityConfiguration[] {
  return providers.map((provider) => {
    const entry = stored.entities[provider.entityType];
    if (entry === undefined) {
      return { provider, enabled: true, fields: defaultFields(provider), customized: false };
    }
    const wanted = new Set(entry.fields);
    const kept = provider.fields.filter((f) => wanted.has(f.code)).map((f) => f.code);
    return {
      provider,
      enabled: entry.enabled,
      // The offer shrank under the stored value: the defaults apply rather than nothing.
      fields: kept.length > 0 ? kept : defaultFields(provider),
      customized: true,
    };
  });
}

/**
 * Merge submitted entries over the stored value. An entry with `enabled` and
 * `fields` replaces the stored one; an entry with neither removes it (restore
 * defaults). Entries not submitted — including absent providers' — are kept.
 * Call only with entries {@link validateSubmittedEntries} accepted.
 */
export function mergeConfiguration(
  stored: AdminSearchStoredConfiguration,
  submitted: UpdateAdminSearchConfigurationRequest['entities'],
): AdminSearchStoredConfiguration {
  const entities: Record<string, AdminSearchStoredEntityConfiguration> = { ...stored.entities };
  for (const entry of submitted) {
    if (entry.enabled === undefined && entry.fields === undefined) {
      delete entities[entry.entityType];
    } else if (entry.enabled !== undefined && entry.fields !== undefined) {
      entities[entry.entityType] = { enabled: entry.enabled, fields: [...entry.fields] };
    }
  }
  return { version: 1, entities };
}

/** Validate a configuration request's entries against the present providers (route, FR-020/FR-021). */
export function validateSubmittedEntries(
  submitted: UpdateAdminSearchConfigurationRequest['entities'],
  presentProviders: readonly AdminSearchProvider[],
): ConfigurationIssue[] {
  const byType = new Map(presentProviders.map((p) => [p.entityType, p]));
  const seen = new Set<string>();
  const issues: ConfigurationIssue[] = [];
  submitted.forEach((entry, i) => {
    const provider = byType.get(entry.entityType);
    if (provider === undefined) {
      issues.push({ path: `entities.${i}.entityType`, issue: `Unknown record type: ${entry.entityType}` });
      return;
    }
    if (seen.has(entry.entityType)) {
      issues.push({ path: `entities.${i}.entityType`, issue: `Record type submitted twice: ${entry.entityType}` });
      return;
    }
    seen.add(entry.entityType);
    if ((entry.enabled === undefined) !== (entry.fields === undefined)) {
      issues.push({
        path: `entities.${i}`,
        issue: 'Send both enabled and fields, or neither to restore the defaults',
      });
      return;
    }
    if (entry.enabled === undefined || entry.fields === undefined) return;
    issues.push(...fieldIssues(`entities.${i}`, { enabled: entry.enabled, fields: entry.fields }, provider));
  });
  return issues;
}

/**
 * Validate a stored value's entries (the settings write validator, any write
 * path). An absent provider's entry is accepted as stored: it is the operator's
 * configuration, kept for when the module returns, and nothing here can see
 * what that module would offer.
 */
export function validateStoredEntries(
  entities: AdminSearchStoredConfiguration['entities'],
  presentProviders: readonly AdminSearchProvider[],
): ConfigurationIssue[] {
  const byType = new Map(presentProviders.map((p) => [p.entityType, p]));
  const issues: ConfigurationIssue[] = [];
  for (const [entityType, entry] of Object.entries(entities)) {
    const provider = byType.get(entityType);
    if (provider === undefined) continue;
    issues.push(...fieldIssues(`entities.${entityType}`, entry, provider));
  }
  return issues;
}

function fieldIssues(
  base: string,
  entry: { readonly enabled: boolean; readonly fields: readonly string[] },
  provider: AdminSearchProvider,
): ConfigurationIssue[] {
  const offered = new Set(provider.fields.map((f) => f.code));
  const seen = new Set<string>();
  const issues: ConfigurationIssue[] = [];
  entry.fields.forEach((code, j) => {
    if (seen.has(code)) {
      issues.push({ path: `${base}.fields.${j}`, issue: `Field selected twice: ${code}` });
      return;
    }
    seen.add(code);
    if (!offered.has(code)) {
      issues.push({
        path: `${base}.fields.${j}`,
        issue: `${provider.entityType} cannot be searched by ${code}`,
      });
    }
  });
  if (entry.enabled && entry.fields.length === 0) {
    issues.push({
      path: `${base}.fields`,
      issue: 'A record type included in global search needs at least one field; exclude the type instead',
    });
  }
  return issues;
}
