import type { FastifyRequest } from 'fastify';
import type {
  AdminI18nTranslatePort,
  PermissionReadPort,
  SettingWriteValidatorRegistryPort,
} from '@endora-commerce/contracts';
import {
  effectiveState,
  lazyPort,
  type ModuleContext,
  type RequireAdminFactory,
  type SettingsReadPort,
} from '@endora-commerce/platform/kernel';
import { AdminSearchSettings } from './admin-search-settings.js';
import { AdminSearchProviderRegistry } from './provider-registry.js';
import { registerAdminSearchRoutes } from './routes.js';
import { AdminSearchService } from './search-service.js';
import { createAdminSearchSettingsValidator } from './settings-validator.js';

/**
 * `admin_search` — global search across the record types owning modules
 * contribute (`specs/150-admin-global-search/`).
 *
 * It owns no table. What it composes: the provider registry owners push into,
 * the search service over it, the settings reader, the routes, and the write
 * validator for its own settings.
 */
export interface AdminSearchCradle {
  readonly requireAdmin: RequireAdminFactory;
  readonly adminContextResolver: (request: FastifyRequest) => { adminUserId: string };
  readonly adminSearchProviderRegistry: AdminSearchProviderRegistry;
  readonly adminSearchSettings: AdminSearchSettings;
  readonly adminSearchService: AdminSearchService;
}

export function registerModule(ctx: ModuleContext): void {
  ctx.di.register({
    // A **contribution registry**, and a plain `di.register` on purpose: it must
    // stay one. Owning modules push their providers in from `ctx.onBoot`, and
    // boot hooks run whatever this module's effective state is, so a
    // `providePort` gate here would throw `MODULE_DISABLED` during composition
    // and stop the backend from starting while global search is switched off.
    // It would also move every edge into this name from `contributes` to
    // `fails-closed` in the deactivation-consequence ledger. The presence of
    // each contributor is answered at enumeration, through the kernel's
    // effective state (the `promptActionToolRegistry` precedent).
    adminSearchProviderRegistry: ctx
      .asFunction(
        () => new AdminSearchProviderRegistry((moduleId) => effectiveState.isPresent(moduleId)),
      )
      .singleton(),

    adminSearchSettings: ctx
      .asFunction(
        () => new AdminSearchSettings(lazyPort<SettingsReadPort>(ctx, 'settingsReadPort')),
      )
      .singleton(),

    adminSearchService: ctx
      .asFunction(
        ({ adminSearchProviderRegistry, adminSearchSettings }: AdminSearchCradle) =>
          new AdminSearchService({
            registry: adminSearchProviderRegistry,
            // Ports of other modules — lazy, resolved per call, never captured.
            permissions: lazyPort<PermissionReadPort>(ctx, 'permissionService'),
            i18n: lazyPort<AdminI18nTranslatePort>(ctx, 'adminI18nService'),
            settings: adminSearchSettings,
            logger: ctx.log,
          }),
      )
      .singleton(),
  });

  ctx.routes(async (app) => {
    const { adminSearchService, requireAdmin, adminContextResolver } = ctx.cradle<AdminSearchCradle>();
    await registerAdminSearchRoutes(app, {
      searchService: adminSearchService,
      requireAdmin,
      resolveAdminContext: adminContextResolver,
    });
  });

  /**
   * The write rules of this module's settings — a **contribution** to the
   * `settings` module's write-validator registry, and nothing else.
   *
   * Deliberately without a presence probe. The registry filters by contributor
   * when a write asks which validators answer for a code, so a validator
   * registered while `admin_search` is off is simply not enumerated — and one
   * that was *not* registered because a probe returned early would stay
   * missing after an operator switched the module back on, until the next
   * restart. It contributes an inert descriptor, awaits nothing and touches no
   * store (the `seo` shape).
   */
  ctx.onBoot(() => {
    const validators = lazyPort<SettingWriteValidatorRegistryPort>(ctx, 'settingWriteValidatorRegistry');
    validators.register(
      createAdminSearchSettingsValidator(ctx.cradle<AdminSearchCradle>().adminSearchProviderRegistry),
    );
  });
}

/**
 * The module's persisted entity classes (D-168). Global search owns no table,
 * so the array is empty and stays empty.
 */
export const entities = [];
