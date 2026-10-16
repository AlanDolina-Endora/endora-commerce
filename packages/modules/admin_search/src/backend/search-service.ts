import {
  ADMIN_SEARCH_MAX_LIMIT,
  AdminSearchHitSchema,
  type AdminI18nTranslatePort,
  type AdminSearchCapability,
  type AdminSearchGroup,
  type AdminSearchHit,
  type AdminSearchProvider,
  type AdminSearchProviderResult,
  type AdminSearchResponse,
  type AdminSearchStoredConfiguration,
  type PermissionReadPort,
  type SupportedAdminLanguage,
} from '@endora-commerce/contracts';
import { rethrowIfModuleDisabled } from '@endora-commerce/platform/kernel';
import { resolveConfiguration, type ResolvedEntityConfiguration } from './configuration-resolver.js';
import { escapeLikePattern, isUuid } from './like-pattern.js';
import type { AdminSearchProviderRegistry } from './provider-registry.js';

/** How long one record type may take before its group is reported unavailable (research R-10). */
export const PROVIDER_DEADLINE_MS = 1500;

/** The three settings a search reads, read once per request. */
export interface AdminSearchSettingsSnapshot {
  readonly minimumQueryLength: number;
  readonly resultsPerEntity: number;
  readonly stored: AdminSearchStoredConfiguration;
}

export interface AdminSearchSettingsReader {
  read(): Promise<AdminSearchSettingsSnapshot>;
}

export interface AdminSearchLogger {
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface AdminSearchServiceDeps {
  readonly registry: Pick<AdminSearchProviderRegistry, 'listVisible'>;
  /** `admin_roles`' permission read — one call per request. */
  readonly permissions: Pick<PermissionReadPort, 'listPermissions'>;
  /** `_i18n`'s resolver: group labels are rendered server-side, in the request language. */
  readonly i18n: AdminI18nTranslatePort;
  readonly settings: AdminSearchSettingsReader;
  readonly logger: AdminSearchLogger;
  /** Test seam; production uses {@link PROVIDER_DEADLINE_MS}. */
  readonly deadlineMs?: number;
}

export interface AdminSearchCaller {
  readonly language: SupportedAdminLanguage;
  readonly adminUserId: string;
  readonly requestId: string | null;
}

export interface AdminSearchRequest extends AdminSearchCaller {
  readonly q: string;
  readonly entityTypes?: readonly string[] | undefined;
  readonly limit?: number | undefined;
}

type Outcome =
  | { readonly status: 'ok'; readonly result: AdminSearchProviderResult }
  | { readonly status: 'timed_out' }
  | { readonly status: 'failed' };

/**
 * The federated search (`contracts/admin-search-api.md` §1–§2).
 *
 * Visibility is decided here in two of its three layers — presence (the
 * registry enumerates present modules only) and permission (the code each
 * type's own admin list enforces) — and inside each provider in the third,
 * scope, by the owner and with its own list's rule (research R-4).
 *
 * The search text is never logged and never stored (FR-017): a failure is
 * logged with the request id and the record type, and nothing else.
 */
export class AdminSearchService {
  constructor(private readonly deps: AdminSearchServiceDeps) {}

  async capability(caller: AdminSearchCaller): Promise<AdminSearchCapability> {
    const [snapshot, enabled] = await this.#enabledFor(caller);
    const entityTypes = await Promise.all(
      enabled.map(async ({ provider }) => ({
        entityType: provider.entityType,
        label: await this.#label(provider, caller.language),
        icon: provider.icon,
      })),
    );
    return {
      minimumQueryLength: snapshot.minimumQueryLength,
      resultsPerEntity: snapshot.resultsPerEntity,
      entityTypes,
    };
  }

  async search(request: AdminSearchRequest): Promise<AdminSearchResponse> {
    const started = Date.now();
    const text = request.q.trim();
    const [snapshot, enabled] = await this.#enabledFor(request);
    const limit = Math.min(request.limit ?? snapshot.resultsPerEntity, ADMIN_SEARCH_MAX_LIMIT);
    const meta = (belowMinimumLength: boolean) => ({
      belowMinimumLength,
      minimumQueryLength: snapshot.minimumQueryLength,
      limit,
      tookMs: Date.now() - started,
    });

    if (text.length < snapshot.minimumQueryLength) {
      return { data: { query: text, groups: [] }, meta: meta(true) };
    }

    const wanted = request.entityTypes === undefined ? null : new Set(request.entityTypes);
    // A type that is absent, not permitted or disabled is silently not
    // searched: naming it would disclose what exists.
    const selected = wanted === null ? enabled : enabled.filter((e) => wanted.has(e.provider.entityType));

    const likeEscaped = escapeLikePattern(text);
    const uuid = isUuid(text);
    const outcomes = await Promise.all(
      selected.map((entry) =>
        this.#run(entry, {
          text,
          likeEscaped,
          isUuid: uuid,
          limit,
          language: request.language,
          adminUserId: request.adminUserId,
          requestId: request.requestId,
        }),
      ),
    );

    const groups: AdminSearchGroup[] = [];
    for (const [i, outcome] of outcomes.entries()) {
      const provider = selected[i]!.provider;
      if (outcome.status === 'ok') {
        const hits = this.#safeHits(provider, outcome.result.hits, request.requestId);
        if (hits.length === 0) continue;
        groups.push({
          entityType: provider.entityType,
          label: await this.#label(provider, request.language),
          icon: provider.icon,
          status: 'ok',
          hits: hits.slice(0, limit),
          hasMore: outcome.result.hasMore || hits.length > limit,
        });
      } else {
        groups.push({
          entityType: provider.entityType,
          label: await this.#label(provider, request.language),
          icon: provider.icon,
          status: outcome.status,
          hits: [],
          hasMore: false,
        });
      }
    }
    return { data: { query: text, groups }, meta: meta(false) };
  }

  /** The settings, and the types this caller may search right now (present ∧ permitted ∧ enabled). */
  async #enabledFor(
    caller: AdminSearchCaller,
  ): Promise<[AdminSearchSettingsSnapshot, ResolvedEntityConfiguration[]]> {
    const [snapshot, permissions] = await Promise.all([
      this.deps.settings.read(),
      this.deps.permissions.listPermissions(caller.adminUserId),
    ]);
    const visible = this.deps.registry.listVisible(permissions);
    return [snapshot, resolveConfiguration(snapshot.stored, visible).filter((e) => e.enabled)];
  }

  async #run(
    entry: ResolvedEntityConfiguration,
    query: {
      text: string;
      likeEscaped: string;
      isUuid: boolean;
      limit: number;
      language: SupportedAdminLanguage;
      adminUserId: string;
      requestId: string | null;
    },
  ): Promise<Outcome> {
    const { provider } = entry;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<Outcome>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ status: 'timed_out' });
      }, this.deps.deadlineMs ?? PROVIDER_DEADLINE_MS);
    });
    try {
      const work = provider
        .search({
          text: query.text,
          likeEscaped: query.likeEscaped,
          isUuid: query.isUuid,
          fields: entry.fields,
          limit: query.limit,
          language: query.language,
          adminUserId: query.adminUserId,
          signal: controller.signal,
        })
        .then((result): Outcome => ({ status: 'ok', result }));
      const outcome = await Promise.race([work, deadline]);
      if (outcome.status === 'timed_out') {
        // The late answer is discarded; a rejection after the deadline must
        // not surface as an unhandled one.
        work.catch(() => undefined);
        this.deps.logger.warn(
          { requestId: query.requestId, entityType: provider.entityType },
          'admin_search: a record type exceeded its search deadline',
        );
      }
      return outcome;
    } catch (error) {
      // A narrow tolerance, and the right one: one record type's failure must
      // not blank the others' results (FR-008). A switched-off module is not a
      // failure of this type — it is the platform's 503 and propagates
      // (module-composition.md item 7).
      rethrowIfModuleDisabled(error);
      this.deps.logger.warn(
        {
          requestId: query.requestId,
          entityType: provider.entityType,
          error: error instanceof Error ? error.message : String(error),
        },
        'admin_search: a record type could not be searched',
      );
      return { status: 'failed' };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Hits that pass the response schema; a provider bug never reaches the shell's navigation. */
  #safeHits(
    provider: AdminSearchProvider,
    hits: AdminSearchProviderResult['hits'],
    requestId: string | null,
  ): AdminSearchHit[] {
    const safe: AdminSearchHit[] = [];
    for (const hit of hits) {
      const parsed = AdminSearchHitSchema.safeParse(hit);
      if (parsed.success) safe.push(parsed.data);
      else {
        this.deps.logger.error(
          { requestId, entityType: provider.entityType, hitId: hit.id },
          'admin_search: a provider returned a hit outside the response contract',
        );
      }
    }
    return safe;
  }

  #label(provider: AdminSearchProvider, language: SupportedAdminLanguage): Promise<string> {
    return this.deps.i18n.translate(provider.moduleId, provider.labelKey, language);
  }
}
