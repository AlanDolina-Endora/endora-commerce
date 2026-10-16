import { createHash } from 'node:crypto';
import {
  ERROR_CODES,
  type AdminI18nTranslatePort,
  type AdminSearchConfigurationView,
  type AdminSearchStoredConfiguration,
  type SettingsAdminAuditContext,
  type SettingsAdminPort,
  type SupportedAdminLanguage,
  type UpdateAdminSearchConfigurationRequest,
} from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';
import { mergeConfiguration, resolveConfiguration, validateSubmittedEntries } from './configuration-resolver.js';
import type { AdminSearchSettings } from './admin-search-settings.js';
import type { AdminSearchProviderRegistry } from './provider-registry.js';
import { ADMIN_SEARCH_SETTING_CODES } from './settings-validator.js';

/**
 * The optimistic-lock token of the search configuration: a digest of the
 * stored value in a canonical key order, so it changes exactly when the value
 * does (FR-026).
 *
 * Not the Settings row's own version: `settings` publishes no read of it
 * across its boundary (`SettingsAdminPort` is write-only), and a digest of the
 * value answers the question the screen asks — "did the configuration change
 * since I loaded it" — without one. The refusal is answered here, before the
 * write, with Settings' own `VERSION_CONFLICT` code.
 */
export function configurationVersion(stored: AdminSearchStoredConfiguration): string {
  const canonical = {
    version: stored.version,
    entities: Object.keys(stored.entities)
      .sort()
      .map((type) => [type, stored.entities[type]!.enabled, [...stored.entities[type]!.fields]]),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 32);
}

export interface AdminSearchConfigurationServiceDeps {
  readonly registry: Pick<AdminSearchProviderRegistry, 'listPresent'>;
  readonly settings: Pick<AdminSearchSettings, 'readWithRaw'>;
  /** `settings`' audited write: the audit row with before/after, the cache drop, the off-state refusal. */
  readonly settingsAdmin: Pick<SettingsAdminPort, 'setValueForAllChannels'>;
  readonly i18n: AdminI18nTranslatePort;
}

/**
 * The search configuration screen's read and write
 * (`specs/150-admin-global-search/contracts/admin-search-api.md` §3–§4).
 *
 * Lists **present** record types only (FR-013, FR-018) — whatever the caller
 * may read, because configuring is a platform decision and a label discloses no
 * record. A save validates every submitted entry against what its owner offers
 * now (FR-020, FR-021), merges over the stored value — entries of record types
 * whose module is off, and entries not submitted, are kept (FR-027) — and
 * writes through `settingsAdminService`, which records the audit row with the
 * value before and after (FR-025) and drops the settings cache so the very next
 * search uses it (FR-023).
 */
export class AdminSearchConfigurationService {
  constructor(private readonly deps: AdminSearchConfigurationServiceDeps) {}

  async view(language: SupportedAdminLanguage): Promise<AdminSearchConfigurationView> {
    const { raw } = await this.deps.settings.readWithRaw();
    const resolved = resolveConfiguration(raw.stored, this.deps.registry.listPresent());
    const entities = await Promise.all(
      resolved.map(async ({ provider, enabled, fields, customized }) => {
        const selected = new Set(fields);
        return {
          entityType: provider.entityType,
          label: await this.deps.i18n.translate(provider.moduleId, provider.labelKey, language),
          icon: provider.icon,
          enabled,
          customized,
          fields: await Promise.all(
            provider.fields.map(async (field) => ({
              code: field.code,
              label: await this.deps.i18n.translate(provider.moduleId, field.labelKey, language),
              // A type that is switched out keeps showing what it would search by.
              selected: selected.has(field.code),
              defaultSelected: field.defaultSelected,
            })),
          ),
        };
      }),
    );
    return {
      version: configurationVersion(raw.stored),
      minimumQueryLength: raw.minimumQueryLength,
      resultsPerEntity: raw.resultsPerEntity,
      entities,
    };
  }

  async update(
    request: UpdateAdminSearchConfigurationRequest,
    language: SupportedAdminLanguage,
    actor: SettingsAdminAuditContext,
  ): Promise<AdminSearchConfigurationView> {
    const issues = validateSubmittedEntries(request.entities, this.deps.registry.listPresent());
    if (issues.length > 0) {
      throw new HttpError(
        422,
        ERROR_CODES.VALIDATION_FAILED,
        'The global search configuration was not saved: every included record type needs at least one field it offers.',
        issues.map((issue) => ({ path: issue.path, issue: issue.issue })),
      );
    }
    const { raw } = await this.deps.settings.readWithRaw();
    if (request.expectedVersion !== null && request.expectedVersion !== configurationVersion(raw.stored)) {
      throw new HttpError(
        409,
        ERROR_CODES.VERSION_CONFLICT,
        'The global search configuration was changed by someone else. Reload it and try again.',
      );
    }
    const merged = mergeConfiguration(raw.stored, request.entities);
    await this.deps.settingsAdmin.setValueForAllChannels(ADMIN_SEARCH_SETTING_CODES.ENTITY_FIELDS, merged, null, actor);
    return this.view(language);
  }
}
